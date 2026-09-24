import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { withWorkspaceReturn, type AuthEmailRegistration, type SocialExchangeInput, type WorkspaceContext } from "@marketplace/schemas";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { passwordHash, passwordMatches } from "./password-codec";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { environment } from "../../platform/config/environment";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { OidcVerifierService } from "./oidc-verifier.service";
import { OnboardingService } from "../onboarding/onboarding.service";
import { PlatformAuthorityPolicy } from "../access-control/platform-authority.policy";
import { authMailMode, deliverAuthMail, requireAuthMail } from "./auth-mail.delivery";
import { setTimeout as delay } from "node:timers/promises";

type RequestMetadata = { ipAddress?: string; userAgent?: string; correlationId?: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secureEqual = (left: string, right: string) => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

@Injectable()
export class AuthSessionsService {
  private readonly logger = new Logger(AuthSessionsService.name);
  clientOptions() { const config = environment(); return { localOperatorPasswordEnabled: config.LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED, emailDelivery: authMailMode(config) }; }
  constructor(
    private readonly prisma: PrismaService,
    private readonly oidc: OidcVerifierService,
    private readonly onboarding: OnboardingService,
    private readonly authority: PlatformAuthorityPolicy,
  ) {}

  private signingKey() {
    const config = environment();
    const key = (config.JWT_PRIVATE_KEY ?? config.JWT_SECRET)?.replaceAll("\\n", "\n");
    if (!key) throw new Error("JWT signing key is not configured");
    return { key, algorithm: config.JWT_PRIVATE_KEY ? "RS256" as const : "HS256" as const };
  }

  private issueAccessToken(userId: string, organizationIds: string[], activeOrganizationId: string | null, authMethods: string[], sessionId: string) {
    const config = environment();
    const signing = this.signingKey();
    return jwt.sign({ organization_ids: organizationIds, organization_id: activeOrganizationId ?? undefined, amr: authMethods }, signing.key, {
      algorithm: signing.algorithm,
      subject: userId,
      issuer: config.JWT_ISSUER ?? "dentmarket-kz",
      audience: config.JWT_AUDIENCE ?? "dentmarket-web",
      expiresIn: config.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      jwtid: sessionId,
    });
  }

  private async memberships(userId: string) {
    return this.prisma.organizationMembership.findMany({ where: { userId, status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } }, select: { organizationId: true, isPrimary: true }, orderBy: { acceptedAt: "asc" } });
  }

  async workspaceChoices(userId?: string): Promise<WorkspaceContext[]> {
    if (!userId) throw new UnauthorizedException("Войдите в аккаунт");
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } },
      select: { organization: { select: { id: true, displayName: true, capabilities: { select: { capability: true } } } } },
      orderBy: { acceptedAt: "asc" },
    });
    return memberships.map(({ organization }) => ({ organizationId: organization.id, organizationDisplayName: organization.displayName,
      capabilities: organization.capabilities.map(item => item.capability).filter((value): value is "BUYER" | "SUPPLIER" => value === "BUYER" || value === "SUPPLIER") })).filter(item => item.capabilities.length > 0);
  }

  async currentSession(refreshToken: string | undefined, csrfToken: string | undefined, workspace?: "BUYER" | "SUPPLIER") {
    if (!refreshToken || !csrfToken || csrfToken.length < 24) return null;
    const session = await this.prisma.authSession.findFirst({ where: { refreshTokenHash: hash(refreshToken), status: "ACTIVE", expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, email: true, displayName: true, status: true } } } });
    if (!session || session.user.status !== "ACTIVE" || !session.activeOrganizationId) return null;
    const workspaces = await this.workspaceChoices(session.userId);
    const active = workspaces.find(item => item.organizationId === session.activeOrganizationId);
    // Losing membership never silently selects a different organization.
    if (!active || (workspace && !active.capabilities.includes(workspace))) return null;
    const { id, email, displayName } = session.user;
    return { user: { id, email, displayName }, workspaces,
      sessionId: session.id, activeOrganizationId: session.activeOrganizationId,
      organizationIds: workspaces.map(item => item.organizationId), csrfToken,
      accessToken: this.issueAccessToken(id, workspaces.map(item => item.organizationId), active.organizationId, session.authMethods, session.id),
      accessTokenExpiresIn: environment().AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresAt: session.expiresAt.toISOString() };
  }

  async workspaceContext(userId?: string, organizationId?: string): Promise<WorkspaceContext> {
    if (!userId || !organizationId) throw new UnauthorizedException("Войдите в аккаунт с активной организацией");
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } },
      select: { organization: { select: { id: true, displayName: true, capabilities: { select: { capability: true } } } } },
    });
    if (!membership) throw new ForbiddenException("Доступ к организации недоступен. Обратитесь к владельцу организации.");
    return {
      organizationId: membership.organization.id,
      organizationDisplayName: membership.organization.displayName,
      capabilities: membership.organization.capabilities.map(item => item.capability)
        .filter((value): value is "BUYER" | "SUPPLIER" => value === "BUYER" || value === "SUPPLIER"),
    };
  }

  private async createSession(userId: string, organizationIds: string[], activeOrganizationId: string | null, authMethods: string[], metadata: RequestMetadata) {
    const refreshToken = randomBytes(48).toString("base64url");
    const config = environment();
    const session = await this.prisma.authSession.create({ data: { userId, familyId: randomUUID(), refreshTokenHash: hash(refreshToken), organizationIds, activeOrganizationId, authMethods, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent, lastUsedAt: new Date(), expiresAt: new Date(Date.now() + config.AUTH_REFRESH_TOKEN_TTL_DAYS * 86_400_000) } });
    return { ...this.sessionPayload(session, refreshToken), refreshToken };
  }

  private async email(to: string, subject: string, text: string) {
    return deliverAuthMail(environment(), { to, subject, text });
  }

  private async issueEmailToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET", metadata?: Record<string, unknown>) {
    const config = environment();
    const raw = randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + (type === "EMAIL_VERIFICATION" ? config.AUTH_EMAIL_VERIFICATION_TTL_HOURS * 3_600_000 : config.AUTH_PASSWORD_RESET_TTL_MINUTES * 60_000));
    await this.prisma.emailAuthToken.deleteMany({ where: { userId, type, consumedAt: null } });
    await this.prisma.emailAuthToken.create({ data: { userId, type, tokenHash: hash(raw), expiresAt, metadata: metadata as Prisma.InputJsonValue | undefined } });
    return { raw, expiresAt };
  }

  async registerEmail(input: AuthEmailRegistration, metadata: RequestMetadata) {
    requireAuthMail(environment());
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("Аккаунт с таким email уже существует. Войдите или восстановите пароль.");
    const user = await this.prisma.user.create({ data: { email: input.email, displayName: input.displayName, passwordHash: passwordHash(input.password) } });
    try {
      const token = await this.issueEmailToken(user.id, "EMAIL_VERIFICATION", input.registrationToken ? { registrationToken: input.registrationToken } : undefined);
      const link = withWorkspaceReturn(`${environment().AUTH_EMAIL_BASE_URL}/verify-email?token=${encodeURIComponent(token.raw)}`, input.returnTo);
      const delivery = await this.email(user.email, "Подтвердите email в DentMarket", `Здравствуйте, ${user.displayName}!\n\nПодтвердите email по ссылке:\n${link}\n\nСсылка действует до ${token.expiresAt.toISOString()}.`);
      await this.prisma.securityEvent.create({ data: { type: "auth.email.registered", severity: "INFO", actorId: user.id, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent } });
      return { ok: true as const, verificationRequired: true as const, email: user.email, delivery };
    } catch (error) {
      // Do not leave an unusable account behind when delivery is unavailable.
      // The user can retry registration immediately after the provider recovers.
      await this.prisma.$transaction([
        this.prisma.emailAuthToken.deleteMany({ where: { userId: user.id } }),
        this.prisma.user.delete({ where: { id: user.id } }),
      ]);
      throw error;
    }
  }

  async verifyEmail(rawToken: string, metadata: RequestMetadata) {
    const token = await this.prisma.emailAuthToken.findUnique({ where: { tokenHash: hash(rawToken) }, include: { user: true } });
    if (!token || token.type !== "EMAIL_VERIFICATION" || token.consumedAt || token.expiresAt <= new Date()) throw new UnauthorizedException("Ссылка подтверждения недействительна или истекла");
    const registrationToken = token.metadata && typeof token.metadata === "object" && !Array.isArray(token.metadata) && typeof (token.metadata as { registrationToken?: unknown }).registrationToken === "string" ? (token.metadata as { registrationToken: string }).registrationToken : undefined;
    let onboarding: { organizationId?: string; capability?: string; organizationDisplayName?: string } | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.emailAuthToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } });
    });
    if (registrationToken) onboarding = await this.onboarding.claim(registrationToken, { id: token.user.id, email: token.user.email, displayName: token.user.displayName });
    const result = await this.passwordSession(token.user, metadata);
    return { ...result, ...(onboarding ?? {}), verified: true };
  }

  private async passwordSession(user: { id: string; email: string; displayName: string }, metadata: RequestMetadata, preferredOrganizationId?: string) {
    const memberships = await this.memberships(user.id);
    const organizationIds = memberships.map(({ organizationId }) => organizationId);
    if (preferredOrganizationId && !organizationIds.includes(preferredOrganizationId)) throw new UnauthorizedException("Активное членство недоступно");
    const activeOrganizationId = preferredOrganizationId ?? memberships.find(({ isPrimary }) => isPrimary)?.organizationId ?? organizationIds[0] ?? null;
    const session = await this.createSession(user.id, organizationIds, activeOrganizationId, ["password"], metadata);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, ...session };
  }

  async loginLocalOperator(input: { email: string; password: string }, metadata: RequestMetadata) {
    if (!environment().LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED) throw new NotFoundException("Локальный вход отключён");
    return this.loginEmail(input, metadata, true);
  }

  async loginEmail(input: { email: string; password: string }, metadata: RequestMetadata, operatorOnly = false) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user?.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedException("Слишком много попыток. Попробуйте позже");
    if (!user || !passwordMatches(input.password, user.passwordHash)) {
      if (user) {
        const nextFailures = user.failedLoginAttempts + 1;
        const recorded = await this.prisma.user.updateMany({
          where: { id: user.id, failedLoginAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil },
          data: { failedLoginAttempts: { increment: 1 }, lockedUntil: nextFailures >= 5 ? new Date(Date.now() + 15 * 60_000) : user.lockedUntil },
        });
        if (recorded.count !== 1) throw new UnauthorizedException("Email или пароль указаны неверно");
      }
      throw new UnauthorizedException("Email или пароль указаны неверно");
    }
    if (user.status !== "ACTIVE") throw new UnauthorizedException("Доступ к аккаунту недоступен");
    if (!user.emailVerifiedAt) throw new UnauthorizedException("Сначала подтвердите email");
    let operatorOrganizationId: string | undefined;
    if (operatorOnly) {
      if (user.status !== "ACTIVE") throw new UnauthorizedException("Доступ оператора недоступен");
      const membership = await this.prisma.organizationMembership.findFirst({ where: { userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE", capabilities: { some: { capability: "MARKETPLACE_OPERATOR" } } } }, select: { organizationId: true } });
      if (!membership) throw new UnauthorizedException("Этот раздел доступен только команде DentMarket");
      await this.authority.assertPlatformOperator({ actorId: user.id, organizationId: membership.organizationId });
      operatorOrganizationId = membership.organizationId;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    return this.passwordSession(user, metadata, operatorOrganizationId);
  }

  async forgotPassword(email: string) {
    const delivery = requireAuthMail(environment());
    const started = performance.now();
    try {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user) {
        const token = await this.issueEmailToken(user.id, "PASSWORD_RESET");
        const link = `${environment().AUTH_EMAIL_BASE_URL}/reset-password?token=${encodeURIComponent(token.raw)}`;
        try { await this.email(user.email, "Восстановление пароля DentMarket", `Сбросить пароль: ${link}\nСсылка действует до ${token.expiresAt.toISOString()}.`); }
        catch { await this.prisma.emailAuthToken.deleteMany({ where: { tokenHash: hash(token.raw), consumedAt: null } }); this.logger.warn("auth_password_reset_delivery_failed"); }
      }
      return { ok: true as const, message: "Запрос принят. Если аккаунт существует, письмо передано на доставку. Если письма нет, обратитесь к оператору.", delivery };
    } finally { await delay(Math.max(0, 3_000 - (performance.now() - started))); }
  }

  async resetPassword(rawToken: string, password: string) {
    const token = await this.prisma.emailAuthToken.findUnique({ where: { tokenHash: hash(rawToken) }, include: { user: true } });
    if (!token || token.type !== "PASSWORD_RESET" || token.consumedAt || token.expiresAt <= new Date()) throw new UnauthorizedException("Ссылка восстановления недействительна или истекла");
    await this.prisma.$transaction([this.prisma.emailAuthToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }), this.prisma.user.update({ where: { id: token.userId }, data: { passwordHash: passwordHash(password), failedLoginAttempts: 0, lockedUntil: null } }), this.prisma.authSession.updateMany({ where: { userId: token.userId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "password_reset" } })]);
    return { ok: true };
  }

  async demo(capability: "BUYER" | "SUPPLIER", metadata: RequestMetadata) {
    const email = capability === "BUYER" ? "buyer@marketplace.local" : "supplier@marketplace.local";
    const user = await this.prisma.user.findUnique({ where: { email }, include: { memberships: { where: { status: "ACTIVE", organization: { status: "ACTIVE", capabilities: { some: { capability } } } }, include: { organization: true }, orderBy: { acceptedAt: "asc" } } } });
    const membership = user?.memberships[0];
    if (!user || !membership) throw new NotFoundException("Демонстрационный аккаунт не подготовлен");
    const organizationIds = user.memberships.map(({ organizationId }) => organizationId);
    const session = await this.createSession(user.id, organizationIds, membership.organizationId, ["demo"], metadata);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, capability, organizationId: membership.organizationId, organizationDisplayName: membership.organization.displayName, ...session };
  }

  private sessionPayload(session: { id: string; userId: string; organizationIds: string[]; activeOrganizationId: string | null; authMethods: string[]; expiresAt: Date }, refreshToken: string) {
    const config = environment();
    return {
      accessToken: this.issueAccessToken(session.userId, session.organizationIds, session.activeOrganizationId, session.authMethods, session.id),
      accessTokenExpiresIn: config.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt,
      sessionId: session.id,
      activeOrganizationId: session.activeOrganizationId,
      organizationIds: session.organizationIds,
    };
  }

  private async acceptInvitation(token: string, userId: string, email: string) {
    const invitation = await this.prisma.membershipInvitation.findUnique({ where: { tokenHash: hash(token) }, include: { roles: true } });
    if (!invitation || invitation.email.toLowerCase() !== email || invitation.status !== "PENDING") throw new BadRequestException("Invitation is invalid for this account");
    if (invitation.expiresAt <= new Date()) throw new BadRequestException("Invitation has expired");
    await this.authority.assertRolesBelongToOrganization(
      invitation.organizationId,
      invitation.roles.map(({ roleId }) => roleId),
    );
    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.upsert({
        where: { userId_organizationId: { userId, organizationId: invitation.organizationId } },
        update: { status: "ACTIVE", acceptedAt: new Date(), roles: { createMany: { data: invitation.roles.map(({ roleId }) => ({ roleId })), skipDuplicates: true } } },
        create: { userId, organizationId: invitation.organizationId, status: "ACTIVE", acceptedAt: new Date(), roles: { create: invitation.roles.map(({ roleId }) => ({ roleId })) } },
      });
      await tx.membershipInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: userId, organizationId: invitation.organizationId, action: "membership.social.accepted", entityType: "OrganizationMembership", entityId: membership.id } });
    });
  }

  async exchange(input: SocialExchangeInput, metadata: RequestMetadata) {
    const verified = await this.oidc.verify(input.provider, input.idToken);
    const identity = await this.prisma.externalIdentity.findUnique({ where: { provider_subject: { provider: input.provider, subject: verified.subject } }, include: { user: true } });
    let user = identity?.user;
    if (!user) {
      user = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email: verified.email } });
        const resolved = existing ?? await tx.user.create({ data: { email: verified.email, displayName: verified.displayName, emailVerifiedAt: new Date() } });
        try {
          await tx.externalIdentity.create({ data: { userId: resolved.id, provider: input.provider, subject: verified.subject, email: verified.email, emailVerified: true, profile: verified.profile as Prisma.InputJsonValue, lastLoginAt: new Date() } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("This social account is already linked");
          throw error;
        }
        await tx.auditLog.create({ data: { actorId: resolved.id, action: existing ? "identity.social.linked" : "identity.social.registered", entityType: "User", entityId: resolved.id, after: { provider: input.provider, email: verified.email } } });
        return resolved;
      });
    } else if (identity?.email.toLowerCase() !== verified.email) {
      throw new UnauthorizedException("Social account email changed; relinking is required");
    }
    if (input.invitationToken) await this.acceptInvitation(input.invitationToken, user.id, verified.email);
    const onboarding = input.registrationToken ? await this.onboarding.claim(input.registrationToken, { id: user.id, email: user.email, displayName: user.displayName }) : null;
    const memberships = await this.memberships(user.id);
    const organizationIds = memberships.map(({ organizationId }) => organizationId);
    const requested = input.organizationId;
    if (requested && !organizationIds.includes(requested)) throw new UnauthorizedException("Requested organization is not available to this account");
    const activeOrganizationId = requested ?? memberships.find(({ isPrimary }) => isPrimary)?.organizationId ?? organizationIds[0] ?? null;
    const refreshToken = randomBytes(48).toString("base64url");
    const config = environment();
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.authSession.create({ data: { userId: user!.id, familyId: randomUUID(), refreshTokenHash: hash(refreshToken), organizationIds, activeOrganizationId, authMethods: [input.provider.toLowerCase()], ipAddress: metadata.ipAddress, userAgent: metadata.userAgent, lastUsedAt: new Date(), expiresAt: new Date(Date.now() + config.AUTH_REFRESH_TOKEN_TTL_DAYS * 86_400_000) } });
      await tx.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date(), emailVerifiedAt: user!.emailVerifiedAt ?? new Date() } });
      await tx.externalIdentity.update({ where: { provider_subject: { provider: input.provider, subject: verified.subject } }, data: { lastLoginAt: new Date(), profile: verified.profile as Prisma.InputJsonValue } });
      return created;
    });
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, ...(onboarding ? { capability: onboarding.capability, organizationId: onboarding.organizationId, organizationDisplayName: onboarding.organizationDisplayName } : {}), ...this.sessionPayload(session, refreshToken) };
  }

  async rotate(refreshToken: string, metadata: RequestMetadata, expectedSessionId?: string) {
    const tokenHash = hash(refreshToken);
    const session = await this.prisma.authSession.findFirst({ where: { OR: [{ refreshTokenHash: tokenHash }, { previousTokenHash: tokenHash }] } });
    if (!session) throw new UnauthorizedException("Refresh session is invalid");
    if (expectedSessionId && session.id !== expectedSessionId) throw new UnauthorizedException("Refresh cookie belongs to another session");
    if (session.previousTokenHash && secureEqual(session.previousTokenHash, tokenHash)) {
      await this.prisma.$transaction([this.prisma.authSession.updateMany({ where: { familyId: session.familyId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "refresh_replay" } }), this.prisma.securityEvent.create({ data: { severity: "CRITICAL", type: "auth.refresh_replay", actorId: session.userId, sessionId: session.id, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent, correlationId: metadata.correlationId } })]);
      throw new UnauthorizedException("Refresh token replay detected; session family revoked");
    }
    const now = new Date();
    if (session.status !== "ACTIVE" || session.expiresAt <= now) throw new UnauthorizedException("Refresh session is revoked or expired");
    const memberships = await this.memberships(session.userId);
    const organizationIds = memberships.map(({ organizationId }) => organizationId);
    const activeOrganizationId = session.activeOrganizationId;
    if (!activeOrganizationId || !organizationIds.includes(activeOrganizationId)) throw new UnauthorizedException("Активное членство недоступно. Войдите заново.");
    const next = randomBytes(48).toString("base64url");
    const claimed = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        status: "ACTIVE",
        refreshTokenHash: tokenHash,
        expiresAt: { gt: now },
      },
      data: {
        previousTokenHash: tokenHash,
        refreshTokenHash: hash(next),
        organizationIds,
        activeOrganizationId,
        lastUsedAt: now,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    if (claimed.count !== 1) {
      const raced = await this.prisma.authSession.findUnique({ where: { id: session.id } });
      if (raced?.previousTokenHash && secureEqual(raced.previousTokenHash, tokenHash)) {
        await this.prisma.$transaction([
          this.prisma.authSession.updateMany({ where: { familyId: session.familyId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "refresh_replay" } }),
          this.prisma.securityEvent.create({ data: { severity: "CRITICAL", type: "auth.refresh_replay", actorId: session.userId, sessionId: session.id, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent, correlationId: metadata.correlationId } }),
        ]);
        throw new UnauthorizedException("Refresh token replay detected; session family revoked");
      }
      throw new UnauthorizedException("Refresh session is no longer active");
    }
    const updated = await this.prisma.authSession.findUniqueOrThrow({ where: { id: session.id } });
    return this.sessionPayload(updated, next);
  }

  async list(userId: string) {
    return this.prisma.authSession.findMany({ where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() } }, select: { id: true, activeOrganizationId: true, authMethods: true, ipAddress: true, userAgent: true, lastUsedAt: true, expiresAt: true, createdAt: true }, orderBy: { lastUsedAt: "desc" } });
  }

  async createHandoff(userId: string, organizationId: string, capability: "BUYER" | "SUPPLIER", sessionId?: string) {
    const now = new Date();
    const session = sessionId
      ? await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, status: "ACTIVE", expiresAt: { gt: now }, organizationIds: { has: organizationId } } })
      : await this.prisma.authSession.findFirst({ where: { userId, status: "ACTIVE", expiresAt: { gt: now }, organizationIds: { has: organizationId } }, orderBy: { lastUsedAt: "desc" } });
    if (!session) throw new UnauthorizedException("Authentication session is not available for handoff");
    const membership = await this.prisma.organizationMembership.findFirst({ where: { userId, organizationId, status: "ACTIVE", organization: { status: "ACTIVE", capabilities: { some: { capability } } } }, include: { organization: true } });
    if (!membership) throw new UnauthorizedException("Organization capability is not available for handoff");
    const code = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 120_000);
    await this.prisma.idempotencyRecord.create({ data: { scope: "session-handoff", key: hash(code), requestHash: hash(`${userId}:${organizationId}:${capability}`), responseCode: 200, responseBody: { sessionId: session.id, userId, organizationId, capability } as Prisma.InputJsonValue, expiresAt } });
    return { handoffCode: code, expiresAt, organizationId, organizationDisplayName: membership.organization.displayName, capability };
  }

  async exchangeHandoff(code: string, metadata: RequestMetadata = {}) {
    const record = await this.prisma.idempotencyRecord.findUnique({ where: { scope_key: { scope: "session-handoff", key: hash(code) } } });
    if (!record || record.expiresAt <= new Date() || record.responseCode !== 200) throw new UnauthorizedException("Session handoff is invalid or expired");
    const consumed = await this.prisma.idempotencyRecord.updateMany({ where: { id: record.id, responseCode: 200, expiresAt: { gt: new Date() } }, data: { responseCode: 410 } });
    if (consumed.count !== 1) throw new UnauthorizedException("Session handoff has already been used");
    const payload = record.responseBody && typeof record.responseBody === "object" && !Array.isArray(record.responseBody) ? record.responseBody as { sessionId?: string; userId?: string; organizationId?: string; capability?: "BUYER" | "SUPPLIER" } : {};
    if (!payload.sessionId || !payload.userId || !payload.organizationId || !payload.capability) throw new UnauthorizedException("Session handoff payload is invalid");
    const session = await this.prisma.authSession.findFirst({ where: { id: payload.sessionId, userId: payload.userId, status: "ACTIVE", expiresAt: { gt: new Date() }, organizationIds: { has: payload.organizationId } } });
    if (!session) throw new UnauthorizedException("Authentication session is revoked or expired");
    const workspace = await this.workspaceContext(payload.userId, payload.organizationId);
    if (!workspace.capabilities.includes(payload.capability)) throw new UnauthorizedException("Organization capability is no longer available");
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.userId }, select: { id: true, email: true, displayName: true } });
    // The destination owns its refresh cookie; no access/refresh token travels in the URL.
    const destination = await this.createSession(user.id, [workspace.organizationId], workspace.organizationId, session.authMethods, metadata);
    return { ...destination, user, capability: payload.capability, organizationId: workspace.organizationId, organizationDisplayName: workspace.organizationDisplayName };
  }

  async revoke(sessionId: string, userId: string, reason: string) {
    const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException("Session not found");
    return this.prisma.authSession.update({ where: { id: session.id }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: reason } });
  }

  async revokeByRefreshToken(refreshToken: string, userId: string | undefined, reason: string) {
    const session = await this.prisma.authSession.findFirst({ where: { refreshTokenHash: hash(refreshToken), ...(userId ? { userId } : {}) } });
    if (!session) return { revoked: false };
    await this.prisma.authSession.update({ where: { id: session.id }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: reason } });
    return { revoked: true };
  }

  async switchOrganization(sessionId: string, userId: string, organizationId: string) {
    const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, status: "ACTIVE", expiresAt: { gt: new Date() } } });
    if (!session) throw new NotFoundException("Session not found");
    const membership = await this.prisma.organizationMembership.findFirst({ where: { userId, organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } } });
    if (!membership || !session.organizationIds.includes(organizationId)) throw new UnauthorizedException("Organization membership is not active");
    const updated = await this.prisma.authSession.update({ where: { id: sessionId }, data: { activeOrganizationId: organizationId, lastUsedAt: new Date() } });
    return { activeOrganizationId: organizationId, accessToken: this.issueAccessToken(userId, updated.organizationIds, organizationId, updated.authMethods, updated.id), accessTokenExpiresIn: environment().AUTH_ACCESS_TOKEN_TTL_SECONDS };
  }

  async elevateMfa(sessionId: string, userId: string, organizationId: string) {
    const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, status: "ACTIVE", expiresAt: { gt: new Date() }, organizationIds: { has: organizationId } } });
    if (!session) throw new UnauthorizedException("Authentication session is not available for MFA elevation");
    const authMethods = Array.from(new Set([...session.authMethods, "totp"]));
    const updated = await this.prisma.authSession.update({ where: { id: session.id }, data: { authMethods, activeOrganizationId: organizationId, lastUsedAt: new Date() } });
    return { accessToken: this.issueAccessToken(userId, updated.organizationIds, organizationId, authMethods, updated.id), accessTokenExpiresIn: environment().AUTH_ACCESS_TOKEN_TTL_SECONDS, activeOrganizationId: organizationId, authenticationMethods: authMethods };
  }

  async unlink(userId: string, provider: "GOOGLE" | "APPLE") {
    const identities = await this.prisma.externalIdentity.findMany({ where: { userId } });
    if (identities.length <= 1) throw new ConflictException("The only sign-in method cannot be unlinked");
    const identity = identities.find((item) => item.provider === provider);
    if (!identity) throw new NotFoundException("Social identity not found");
    await this.prisma.$transaction([this.prisma.externalIdentity.delete({ where: { id: identity.id } }), this.prisma.authSession.updateMany({ where: { userId, authMethods: { has: provider.toLowerCase() }, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "identity_unlinked" } }), this.prisma.auditLog.create({ data: { actorId: userId, action: "identity.social.unlinked", entityType: "ExternalIdentity", entityId: identity.id, before: { provider } } })]);
    return { unlinked: true, provider };
  }
}
