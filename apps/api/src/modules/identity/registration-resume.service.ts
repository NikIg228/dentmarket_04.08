import { ConflictException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { RegistrationResumeComplete, RegistrationResumeCompleted, RegistrationResumeDetails, RegistrationResumeRequest, RegistrationResumeRequested } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { environment } from "../../platform/config/environment";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { OnboardingService } from "../onboarding/onboarding.service";
import { passwordHash, passwordMatches } from "./password-codec";
import { deliverAuthMail, requireAuthMail } from "./auth-mail.delivery";

const scope = "registration-resume";
const requestScope = "registration-resume-request";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const bindingSchema = z.object({ registrationId: z.uuid(), email: z.email(), bin: z.string().regex(/^\d{12}$/), capability: z.enum(["BUYER", "SUPPLIER"]) }).strict();
const invalid = () => new UnauthorizedException("Ссылка продолжения недействительна или истекла. Запросите новое письмо.");
const receipt: RegistrationResumeCompleted = { status: "COMPLETED", next: "LOGIN" };

@Injectable()
export class RegistrationResumeService {
  private readonly logger = new Logger(RegistrationResumeService.name);
  constructor(private readonly prisma: PrismaService, private readonly onboarding: OnboardingService) {}

  async request(input: RegistrationResumeRequest): Promise<RegistrationResumeRequested> {
    const config = environment();
    // Never expose continuation credentials through the development console.
    requireAuthMail(config);
    const started = performance.now();
    try {
      const now = new Date();
      const key = digest(input.email);
      const cooldown = { scope: requestScope, key, requestHash: key, expiresAt: new Date(now.getTime() + 60_000) };
      let permitted = false;
      try { await this.prisma.idempotencyRecord.create({ data: cooldown }); permitted = true; }
      catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        permitted = (await this.prisma.idempotencyRecord.updateMany({ where: { scope: requestScope, key, expiresAt: { lte: now } }, data: { expiresAt: cooldown.expiresAt } })).count === 1;
      }
      if (!permitted) return { status: "ACCEPTED" };
      const registration = await this.prisma.registrationIntent.findFirst({ where: { ...input, status: "PENDING", organizationId: null, expiresAt: { gt: now } } });
      if (!registration) return { status: "ACCEPTED" };
      const token = randomBytes(48).toString("base64url");
      const binding = { registrationId: registration.id, email: registration.email, bin: registration.bin, capability: registration.capability };
      const record = await this.prisma.idempotencyRecord.create({ data: {
        scope, key: digest(token), requestHash: digest(JSON.stringify(binding)), responseCode: 200,
        responseBody: binding, expiresAt: new Date(Math.min(now.getTime() + 15 * 60_000, registration.expiresAt.getTime())),
      } });
      const link = new URL("/register/resume", config.AUTH_EMAIL_BASE_URL);
      link.hash = new URLSearchParams({ token }).toString();
      try {
        await deliverAuthMail(config, { to: registration.email, subject: "Продолжение регистрации DentMarket", text: `Чтобы завершить начатую регистрацию, откройте ${link.href}\nСсылка действует до ${record.expiresAt.toISOString()}. Если вы не отправляли запрос, проигнорируйте письмо.` });
      } catch {
        await this.prisma.idempotencyRecord.updateMany({ where: { id: record.id, responseCode: 200 }, data: { responseCode: 503 } });
        this.logger.warn("registration_resume_delivery_failed");
      }
      return { status: "ACCEPTED" };
    } finally {
      // Bound ordinary existence/timing differences, including provider errors.
      // This is not a promise of constant timing during infrastructure overload.
      await delay(Math.max(0, 3_000 - (performance.now() - started)));
    }
  }

  private async proof(token: string, database: Prisma.TransactionClient = this.prisma) {
    const record = await database.idempotencyRecord.findUnique({ where: { scope_key: { scope, key: digest(token) } } });
    if (!record || record.expiresAt <= new Date() || ![200, 410].includes(record.responseCode ?? 0)) throw invalid();
    const parsed = bindingSchema.safeParse(record.responseBody);
    if (!parsed.success || record.requestHash !== digest(JSON.stringify(parsed.data))) throw invalid();
    const binding = parsed.data;
    const registration = await database.registrationIntent.findUnique({ where: { id: binding.registrationId } });
    if (!registration || registration.email !== binding.email || registration.bin !== binding.bin || registration.capability !== binding.capability) throw invalid();
    if (record.responseCode === 410) {
      if (registration.status !== "CLAIMED" || !registration.organizationId) throw invalid();
    } else if (registration.status !== "PENDING" || registration.organizationId || registration.expiresAt <= new Date()) throw invalid();
    return { record, registration };
  }

  async inspect(token: string): Promise<RegistrationResumeDetails> {
    const { record, registration } = await this.proof(token);
    const user = await this.prisma.user.findUnique({ where: { email: registration.email }, select: { id: true } });
    return { status: record.responseCode === 410 ? "COMPLETED" : "READY", email: registration.email, bin: registration.bin,
      capability: registration.capability as "BUYER" | "SUPPLIER", organizationDisplayName: registration.organizationDisplayName,
      ownerDisplayName: registration.ownerDisplayName, passwordMode: user ? "EXISTING" : "NEW", expiresAt: record.expiresAt.toISOString() };
  }

  async complete(input: RegistrationResumeComplete): Promise<RegistrationResumeCompleted> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Acquire the proof row before reading its registration. Under READ COMMITTED
        // a second request must not see the old proof with an already-claimed intent.
        await tx.idempotencyRecord.updateMany({ where: { scope, key: digest(input.token), responseCode: 200, expiresAt: { gt: new Date() } }, data: { responseCode: 200 } });
        const proof = await this.proof(input.token, tx);
        const registration = proof.registration;
        if (input.email !== registration.email || input.bin !== registration.bin || input.capability !== registration.capability) throw invalid();
        if (proof.record.responseCode === 410) return { ok: true };
        const now = new Date();
        let user = await tx.user.findUnique({ where: { email: registration.email }, include: { mfaFactor: true } });
        if (user) {
          if (user.status !== "ACTIVE" || (user.lockedUntil && user.lockedUntil > now) || user.mfaFactor?.status === "ACTIVE" || !user.passwordHash) {
            return { ok: false, message: "Продолжение этого аккаунта требует штатного входа или помощи оператора. Блокировки и MFA сохраняются." };
          }
          if (!passwordMatches(input.password, user.passwordHash)) {
            const failures = user.failedLoginAttempts + 1;
            await tx.user.updateMany({ where: { id: user.id, failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil }, data: {
              failedLoginAttempts: { increment: 1 }, lockedUntil: failures >= 5 ? new Date(now.getTime() + 15 * 60_000) : null,
            } });
            return { ok: false, message: "Неверный текущий пароль. Используйте восстановление доступа, если забыли его." };
          }
          const verified = await tx.user.updateMany({ where: { id: user.id, status: "ACTIVE", passwordHash: user.passwordHash, lockedUntil: user.lockedUntil }, data: { emailVerifiedAt: user.emailVerifiedAt ?? now } });
          if (verified.count !== 1) throw new ConflictException("Аккаунт изменился. Повторите проверку ссылки.");
        } else {
          user = await tx.user.create({ data: { email: registration.email, displayName: registration.ownerDisplayName, passwordHash: passwordHash(input.password), emailVerifiedAt: now }, include: { mfaFactor: true } });
        }
        // The internal claim token is never returned, logged, or stored in plaintext.
        const claimToken = randomBytes(48).toString("base64url");
        const bound = await tx.registrationIntent.updateMany({ where: { id: registration.id, status: "PENDING", organizationId: null, expiresAt: { gt: now } }, data: { tokenHash: digest(claimToken) } });
        if (bound.count !== 1) throw new ConflictException("Заявка уже завершена или истекла. Откройте вход.");
        await this.onboarding.claim(claimToken, user, tx);
        const consumed = await tx.idempotencyRecord.updateMany({ where: { id: proof.record.id, responseCode: 200, expiresAt: { gt: new Date() } }, data: { responseCode: 410 } });
        if (consumed.count !== 1) throw invalid();
        return { ok: true };
      }, { maxWait: 5_000, timeout: 15_000 });
      if (!result.ok) throw new UnauthorizedException(result.message);
      return receipt;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new ConflictException("Регистрация обрабатывается. Повторно откройте ссылку; новая заявка не требуется.");
      throw error;
    }
  }
}
