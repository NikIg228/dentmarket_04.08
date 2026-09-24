import { describe, expect, it, vi } from "vitest";
import { AuthSessionsService } from "./auth-sessions.service";
import { AuthSessionsController } from "./auth-sessions.controller";
import { THROTTLER_LIMIT } from "@nestjs/throttler/dist/throttler.constants";
import { environment } from "../../platform/config/environment";
vi.mock("../../platform/config/environment", () => ({ environment: () => ({ AUTH_ACCESS_TOKEN_TTL_SECONDS: 900, RATE_LIMIT_REQUESTS: 240, RATE_LIMIT_TTL_MS: 60000, JWT_SECRET: "synthetic-current-session-secret", JWT_ISSUER: "tests", JWT_AUDIENCE: "tests" }) }));

function setup(capabilities = ["SUPPLIER"]) {
  const session = { id: "session", userId: "user", activeOrganizationId: "org", authMethods: ["password"], expiresAt: new Date(Date.now() + 60000), user: { id: "user", email: "fixture@example.invalid", displayName: "Fixture", status: "ACTIVE" } };
  const db = { authSession: { findFirst: vi.fn().mockResolvedValue(session), update: vi.fn(), create: vi.fn() }, organizationMembership: { findMany: vi.fn().mockResolvedValue([{ organization: { id: "org", displayName: "Test", capabilities: capabilities.map(capability => ({ capability })) } }]) } };
  return { session, db, service: new AuthSessionsService(db as never, {} as never, {} as never, {} as never) };
}
describe("read-only current session", () => {
  it("serializes an anonymous response as JSON null and keeps credential throttling separate", async () => {
    const t = setup();
    const controller = new AuthSessionsController(t.service);
    const response = { json: vi.fn() };
    await controller.current({}, { header: () => undefined } as never, response as never);
    expect(response.json).toHaveBeenCalledWith(null);
    expect(t.db.authSession.findFirst).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}ip`, AuthSessionsController)).toBe(20);
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}ip`, controller.login)).toBeUndefined();
    const limit = Reflect.getMetadata(`${THROTTLER_LIMIT}ip`, controller.current);
    expect(typeof limit).toBe("function");
    expect(limit()).toBe(environment().RATE_LIMIT_REQUESTS);
  });
  it("does not query account data without the refresh and CSRF cookies", async () => {
    const t = setup();
    expect(await t.service.currentSession(undefined, "synthetic-csrf-token-long-enough")).toBeNull();
    expect(await t.service.currentSession("refresh", undefined)).toBeNull();
    expect(t.db.authSession.findFirst).not.toHaveBeenCalled();
  });
  it("uses only unexpired active server sessions and does not rotate them", async () => {
    const t = setup(); const value = await t.service.currentSession("refresh", "synthetic-csrf-token-long-enough", "SUPPLIER");
    expect(value).toMatchObject({ activeOrganizationId: "org", user: { id: "user" }, workspaces: [{ capabilities: ["SUPPLIER"] }] });
    expect(t.db.authSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/), status: "ACTIVE", expiresAt: { gt: expect.any(Date) } } }));
    expect(t.db.authSession.update).not.toHaveBeenCalled(); expect(t.db.authSession.create).not.toHaveBeenCalled();
  });
  it.each(["expired-or-revoked", "blocked-user", "lost-membership", "foreign-active-org", "operator", "wrong-capability"])("returns no session for %s", async variant => {
    const t = setup(variant === "operator" ? ["MARKETPLACE_OPERATOR"] : ["SUPPLIER"]);
    if (variant === "expired-or-revoked") t.db.authSession.findFirst.mockResolvedValue(null);
    if (variant === "blocked-user") t.session.user.status = "BLOCKED";
    if (variant === "lost-membership") t.db.organizationMembership.findMany.mockResolvedValue([]);
    if (variant === "foreign-active-org") t.session.activeOrganizationId = "foreign";
    expect(await t.service.currentSession("refresh", "synthetic-csrf-token-long-enough", variant === "wrong-capability" ? "BUYER" : undefined)).toBeNull();
  });
});
