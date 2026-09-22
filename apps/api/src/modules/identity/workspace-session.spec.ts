import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionsService } from "./auth-sessions.service";
const config = vi.hoisted(() => ({ JWT_SECRET: "synthetic-jwt-secret-at-least-32-characters", AUTH_ACCESS_TOKEN_TTL_SECONDS: 900, AUTH_REFRESH_TOKEN_TTL_DAYS: 30 }));
vi.mock("../../platform/config/environment", () => ({ environment: () => config }));
let db: any, service: AuthSessionsService;
beforeEach(() => {
  db = {
    idempotencyRecord: { findUnique: vi.fn().mockResolvedValue({ id: "code", expiresAt: new Date(Date.now() + 60000), responseCode: 200, responseBody: { sessionId: "source", userId: "user", organizationId: "org", capability: "SUPPLIER" } }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    authSession: { findFirst: vi.fn().mockResolvedValue({ id: "source", userId: "user", status: "ACTIVE", activeOrganizationId: "org", expiresAt: new Date(Date.now()+60000), organizationIds: ["org"], authMethods: ["password"] }), create: vi.fn().mockImplementation(async ({ data }) => ({ id: "destination", ...data })), updateMany: vi.fn() },
    organizationMembership: { findFirst: vi.fn().mockResolvedValue({ organization: { id: "org", displayName: "Test", capabilities: [{ capability: "SUPPLIER" }] } }), findMany: vi.fn().mockResolvedValue([{ organizationId: "other" }]) },
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "user", displayName: "Test", email: "test@example.invalid" }) },
  };
  service = new AuthSessionsService(db, {} as never, {} as never, {} as never);
});
describe("workspace session boundaries", () => {
  it("creates a destination session only after one-time consumption and current membership validation", async () => {
    const result = await service.exchangeHandoff("synthetic-code");
    expect(result.sessionId).toBe("destination"); expect(result.refreshToken.length).toBeGreaterThan(32);
    expect(db.authSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "user", organizationIds: ["org"], activeOrganizationId: "org", authMethods: ["password"] }) });
    expect(db.organizationMembership.findFirst.mock.calls[0][0].where).toMatchObject({ userId: "user", organizationId: "org", status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } });
  });
  it("does not exchange a consumed code or one whose membership has been removed", async () => {
    db.idempotencyRecord.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.exchangeHandoff("synthetic-code")).rejects.toThrow("already been used");
    expect(db.authSession.create).not.toHaveBeenCalled();
    db.organizationMembership.findFirst.mockResolvedValueOnce(null);
    await expect(service.exchangeHandoff("synthetic-code")).rejects.toMatchObject({ status: 403 });
    expect(db.authSession.create).not.toHaveBeenCalled();
  });
  it("does not change the active organization silently during refresh", async () => {
    await expect(service.rotate("synthetic-refresh", {})).rejects.toThrow("Войдите заново");
    expect(db.authSession.updateMany).not.toHaveBeenCalled();
  });
  it("does not rotate the cookie of a different login in the same browser", async () => {
    await expect(service.rotate("synthetic-refresh", {}, "another-session")).rejects.toThrow("another session");
    expect(db.authSession.updateMany).not.toHaveBeenCalled();
  });
  it("only lists active memberships of the verified user", async () => {
    db.organizationMembership.findMany.mockResolvedValue([{ organization: { id: "org", displayName: "Test", capabilities: [{ capability: "SUPPLIER" }, { capability: "MARKETPLACE_OPERATOR" }] } }]);
    expect(await service.workspaceChoices("user")).toEqual([{ organizationId: "org", organizationDisplayName: "Test", capabilities: ["SUPPLIER"] }]);
    expect(db.organizationMembership.findMany.mock.calls[0][0].where).toMatchObject({ userId: "user", status: "ACTIVE", user: { status: "ACTIVE" }, organization: { status: "ACTIVE" } });
    await expect(service.workspaceChoices()).rejects.toMatchObject({ status: 401 });
  });
});
