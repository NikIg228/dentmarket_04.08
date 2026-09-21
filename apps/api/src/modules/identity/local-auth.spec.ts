import { beforeEach, expect, it, vi } from "vitest";
import { AuthSessionsService } from "./auth-sessions.service";
import { passwordHash } from "./password-codec";
import { deliverAuthMail, requireAuthMail } from "./auth-mail.delivery";
vi.mock("../../platform/config/environment", () => ({ environment: () => config }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./auth-mail.delivery", () => ({ deliverAuthMail: vi.fn(), requireAuthMail: vi.fn(), authMailMode: () => "LOCAL_FILE" }));
let config: any, db: any, service: AuthSessionsService, authority: any, user: any;
const password = "Synthetic-local-password";
beforeEach(() => {
  vi.clearAllMocks();
  config = { LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED: true, JWT_SECRET: "synthetic-key-with-more-than-thirty-two-characters", AUTH_ACCESS_TOKEN_TTL_SECONDS: 900, AUTH_REFRESH_TOKEN_TTL_DAYS: 30, AUTH_PASSWORD_RESET_TTL_MINUTES: 30, AUTH_EMAIL_BASE_URL: "http://127.0.0.1:3103" };
  user = { id: "user", email: "audit@example.invalid", displayName: "Audit", status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash: passwordHash(password), failedLoginAttempts: 0, lockedUntil: null };
  db = { user: { findUnique: vi.fn(async () => user), update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) }, organizationMembership: { findFirst: vi.fn(async () => ({ organizationId: "operator" })), findMany: vi.fn(async () => [{ organizationId: "buyer", isPrimary: true }, { organizationId: "operator", isPrimary: false }]) }, authSession: { create: vi.fn(async ({ data }) => ({ id: "session", ...data })) }, emailAuthToken: { deleteMany: vi.fn(), create: vi.fn() } };
  authority = { assertPlatformOperator: vi.fn() };
  service = new AuthSessionsService(db, {} as never, {} as never, authority);
  vi.mocked(requireAuthMail).mockReturnValue("LOCAL_FILE"); vi.mocked(deliverAuthMail).mockResolvedValue("LOCAL_FILE");
});
it("disabled endpoint rejects before account lookup", async () => {
  config.LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED = false;
  await expect(service.loginLocalOperator({ email: user.email, password }, {})).rejects.toThrow("отключён");
  expect(db.user.findUnique).not.toHaveBeenCalled();
});
it("selects authorized operator org, never the primary tenant, and creates only password session", async () => {
  const result = await service.loginLocalOperator({ email: user.email, password }, {});
  expect(result.activeOrganizationId).toBe("operator");
  expect(authority.assertPlatformOperator).toHaveBeenCalledWith({ actorId: "user", organizationId: "operator" });
  expect(db.organizationMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "ACTIVE", organization: { status: "ACTIVE", capabilities: { some: { capability: "MARKETPLACE_OPERATOR" } } } }) }));
  expect(db.authSession.create.mock.calls[0][0].data.authMethods).toEqual(["password"]);
});
it.each(["tenant", "inactive", "unverified", "locked", "wrong-password", "revoked-membership", "authority-revoked"])("denies %s before creating a session", async variant => {
  if (variant === "tenant") db.organizationMembership.findFirst.mockResolvedValue(null);
  if (variant === "inactive") user.status = "BLOCKED";
  if (variant === "unverified") user.emailVerifiedAt = null;
  if (variant === "locked") user.lockedUntil = new Date(Date.now() + 60000);
  if (variant === "revoked-membership") db.organizationMembership.findMany.mockResolvedValue([]);
  if (variant === "authority-revoked") authority.assertPlatformOperator.mockRejectedValue(new Error("Revoked"));
  await expect(service.loginLocalOperator({ email: user.email, password: variant === "wrong-password" ? "wrong" : password }, {})).rejects.toThrow();
  expect(db.authSession.create).not.toHaveBeenCalled();
});
it("missing mail config fails before registration or reset account lookup", async () => {
  vi.mocked(requireAuthMail).mockImplementation(() => { throw new Error("Unconfigured"); });
  await expect(service.registerEmail({ email: user.email, displayName: "Audit", password }, {})).rejects.toThrow("Unconfigured");
  await expect(service.forgotPassword(user.email)).rejects.toThrow("Unconfigured");
  expect(db.user.findUnique).not.toHaveBeenCalled();
});
it("reset ack is identical for known, unknown and delivery-failed account; failed token invalidated", async () => {
  const accepted = await service.forgotPassword(user.email);
  user = null; expect(await service.forgotPassword("unknown@example.invalid")).toEqual(accepted);
  user = { id: "user", email: "audit@example.invalid" };
  vi.mocked(deliverAuthMail).mockRejectedValue(new Error("private-token"));
  expect(await service.forgotPassword(user.email)).toEqual(accepted);
  expect(db.emailAuthToken.deleteMany).toHaveBeenLastCalledWith({ where: { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), consumedAt: null } });
  expect(JSON.stringify(accepted)).not.toMatch(/private-token|tokenHash|\.tmp/);
});
