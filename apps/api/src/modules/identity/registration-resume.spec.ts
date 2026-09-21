import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { RegistrationResumeService } from "./registration-resume.service";
import { RegistrationResumeController } from "./registration-resume.controller";
import { passwordHash, passwordMatches } from "./password-codec";
import { coreOpenApiSchemas } from "../../platform/openapi/core-openapi";
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../platform/config/environment", () => ({ environment: () => configuration }));
let configuration: Record<string, string>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const input = { email: "resume@example.invalid", bin: "123456789012", capability: "BUYER" as const };
const token = "A".repeat(64);
const binding = { registrationId: "11111111-1111-4111-8111-111111111111", ...input };
const password = "Synthetic-pass-123";
let db: any, onboarding: any, service: RegistrationResumeService, record: any, registration: any;
beforeEach(() => {
  configuration = { EMAIL_PROVIDER_URL: "http://127.0.0.1:4999/mail", EMAIL_PROVIDER_TOKEN: "synthetic", AUTH_EMAIL_BASE_URL: "http://127.0.0.1:3103" };
  record = { id: "proof-id", responseCode: 200, responseBody: binding, requestHash: hash(JSON.stringify(binding)), expiresAt: new Date(Date.now() + 900_000) };
  registration = { id: binding.registrationId, ...input, ownerDisplayName: "Test owner", organizationDisplayName: "Test clinic", status: "PENDING", organizationId: null, expiresAt: new Date(Date.now() + 86_400_000) };
  db = {
    idempotencyRecord: { findUnique: vi.fn(async () => record), create: vi.fn(async () => record), updateMany: vi.fn(async () => ({ count: 1 })) },
    registrationIntent: { findUnique: vi.fn(async () => registration), findFirst: vi.fn(async () => registration), updateMany: vi.fn(async () => ({ count: 1 })) },
    user: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: "user", ...input, displayName: "Test owner" })), updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  db.$transaction = vi.fn(async (fn: any) => fn(db));
  onboarding = { claim: vi.fn(async () => ({ organizationId: "created-org" })) };
  service = new RegistrationResumeService(db, onboarding);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
});
afterEach(() => vi.unstubAllGlobals());
describe("protected registration continuation", () => {
  it("sends only to persisted email, saves hash and binding, uses fragment/no redirects", async () => {
    expect(await service.request(input)).toEqual({ status: "ACCEPTED" });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(configuration.EMAIL_PROVIDER_URL);
    expect(options).toMatchObject({ redirect: "error", method: "POST" });
    const mail = JSON.parse(String(options?.body));
    expect(mail.to).toBe(input.email);
    expect(mail.text).toContain("/register/resume#token=");
    const raw = mail.text.match(/#token=([A-Za-z0-9_-]+)/)[1];
    const data = db.idempotencyRecord.create.mock.calls[1][0].data;
    expect(data.key).toBe(hash(raw)); expect(JSON.stringify(data)).not.toContain(raw);
    expect(data.responseBody).toEqual(binding);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(registration.expiresAt.getTime());
  });
  it("missing delivery is explicit and never logs a token", async () => {
    configuration.EMAIL_PROVIDER_TOKEN = "";
    await expect(service.request(input)).rejects.toThrow("не настроена");
    expect(db.idempotencyRecord.create).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("unknown/expired target returns the same ack without delivery", async () => {
    db.registrationIntent.findFirst.mockResolvedValue(null);
    expect(await service.request(input)).toEqual({ status: "ACCEPTED" });
    expect(fetch).not.toHaveBeenCalled();
    expect(db.registrationIntent.findFirst.mock.calls[0][0].where).toMatchObject({ ...input, status: "PENDING", organizationId: null, expiresAt: { gt: expect.any(Date) } });
  });
  it("cooldown preserves previously issued proof and does not resend", async () => {
    db.idempotencyRecord.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }));
    db.idempotencyRecord.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.request(input)).toEqual({ status: "ACCEPTED" }); expect(fetch).not.toHaveBeenCalled();
  });
  it("failed provider invalidates that proof, not an earlier one", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("provider private message"));
    expect(await service.request(input)).toEqual({ status: "ACCEPTED" });
    expect(db.idempotencyRecord.updateMany).toHaveBeenCalledWith({ where: { id: record.id, responseCode: 200 }, data: { responseCode: 503 } });
  });
  it("inspection neither consumes nor creates an account", async () => {
    expect(await service.inspect(token)).toMatchObject({ status: "READY", passwordMode: "NEW", ...input });
    expect(db.idempotencyRecord.updateMany).not.toHaveBeenCalled(); expect(db.user.create).not.toHaveBeenCalled();
  });
  it.each(["missing", "expired", "altered-binding", "expired-intent", "foreign-intent", "claimed", "failed-delivery"])("rejects %s proof", async (variant) => {
    if (variant === "missing") record = null;
    if (variant === "expired") record.expiresAt = new Date(0);
    if (variant === "altered-binding") record.requestHash = "wrong";
    if (variant === "expired-intent") registration.expiresAt = new Date(0);
    if (variant === "foreign-intent") registration.bin = "999999999999";
    if (variant === "claimed") registration.status = "CLAIMED";
    if (variant === "failed-delivery") record.responseCode = 503;
    await expect(service.complete({ ...input, token, password })).rejects.toThrow("недействительна");
    expect(db.user.create).not.toHaveBeenCalled(); expect(onboarding.claim).not.toHaveBeenCalled();
  });
  it.each([{ email: "foreign@example.invalid" }, { bin: "999999999999" }, { capability: "SUPPLIER" as const }])("rejects changed target %j", async changes => {
    await expect(service.complete({ ...input, ...changes, token, password })).rejects.toThrow("недействительна"); expect(onboarding.claim).not.toHaveBeenCalled();
  });
  it("creates verified account and consumes proof in the same claim transaction", async () => {
    expect(await service.complete({ ...input, token, password })).toEqual({ status: "COMPLETED", next: "LOGIN" });
    const data = db.user.create.mock.calls[0][0].data;
    expect(passwordMatches(password, data.passwordHash)).toBe(true); expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(onboarding.claim.mock.calls[0][2]).toBe(db);
    expect(db.idempotencyRecord.updateMany.mock.invocationCallOrder[0]).toBeLessThan(db.idempotencyRecord.findUnique.mock.invocationCallOrder[0]);
    expect(db.idempotencyRecord.updateMany.mock.calls.at(-1)[0]).toMatchObject({ where: { id: record.id, responseCode: 200 }, data: { responseCode: 410 } });
  });
  it("consumed proof only returns receipt and cannot overwrite a password", async () => {
    record.responseCode = 410; registration.status = "CLAIMED"; registration.organizationId = "org";
    expect(await service.complete({ ...input, token, password })).toEqual({ status: "COMPLETED", next: "LOGIN" });
    expect(db.user.create).not.toHaveBeenCalled(); expect(db.user.updateMany).not.toHaveBeenCalled(); expect(onboarding.claim).not.toHaveBeenCalled();
  });
  it("does not reset an existing password, persists failed attempts without consuming proof", async () => {
    db.user.findUnique.mockResolvedValue({ id: "existing", status: "ACTIVE", passwordHash: passwordHash("Different-pass-123"), failedLoginAttempts: 4, lockedUntil: null });
    await expect(service.complete({ ...input, token, password })).rejects.toThrow("Неверный текущий пароль");
    expect(db.user.updateMany.mock.calls[0][0].data).toEqual({ failedLoginAttempts: { increment: 1 }, lockedUntil: expect.any(Date) });
    expect(db.user.create).not.toHaveBeenCalled(); expect(onboarding.claim).not.toHaveBeenCalled();
    expect(db.idempotencyRecord.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: { responseCode: 410 } }));
  });
  it.each([{ status: "BLOCKED" }, { lockedUntil: new Date(Date.now() + 60_000) }, { mfaFactor: { status: "ACTIVE" } }, { passwordHash: null }])("preserves account restrictions %j", async restriction => {
    db.user.findUnique.mockResolvedValue({ id: "existing", status: "ACTIVE", passwordHash: passwordHash(password), ...restriction });
    await expect(service.complete({ ...input, token, password })).rejects.toThrow("штатного входа"); expect(onboarding.claim).not.toHaveBeenCalled();
  });
  it("correct existing password does not change credentials or reset login lock counters", async () => {
    db.user.findUnique.mockResolvedValue({ id: "existing", ...input, displayName: "Existing", status: "ACTIVE", passwordHash: passwordHash(password), emailVerifiedAt: null, lockedUntil: null });
    await service.complete({ ...input, token, password });
    expect(db.user.create).not.toHaveBeenCalled(); expect(db.user.updateMany.mock.calls[0][0].data).toEqual({ emailVerifiedAt: expect.any(Date) });
  });
  it("claim error propagates to the outer transaction and never consumes proof", async () => {
    onboarding.claim.mockRejectedValue(new Error("fixture rollback"));
    await expect(service.complete({ ...input, token, password })).rejects.toThrow("fixture rollback");
    expect(db.idempotencyRecord.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: { responseCode: 410 } }));
  });
  it("controller rejects undeclared authority, OpenAPI exposes all three contracts", () => {
    const controller = new RegistrationResumeController(service);
    expect(() => controller.request({ ...input, actorId: "foreign" })).toThrow();
    expect(coreOpenApiSchemas.RegistrationResumeCompleteRequest).toMatchObject({ required: expect.arrayContaining(["token", "email", "bin", "capability", "password"]) });
    expect(coreOpenApiSchemas.RegistrationResumeCompletedResponse).toBeDefined();
  });
});
