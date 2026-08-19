import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SessionRevocationService } from "./session-revocation.service";

function createService(session: unknown) {
  const findUnique = vi.fn(async () => session);
  const service = new SessionRevocationService({ authSession: { findUnique } } as never);
  return { service, findUnique };
}

describe("SessionRevocationService", () => {
  it("accepts an active session belonging to the JWT subject", async () => {
    const { service, findUnique } = createService({ userId: "user-1", status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.assertActive("session-1", "user-1")).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "session-1" }, select: { userId: true, status: true, expiresAt: true } });
  });

  it("rejects revoked sessions and bounds repeated database reads with a deny cache", async () => {
    const { service, findUnique } = createService({ userId: "user-1", status: "REVOKED", expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.assertActive("session-1", "user-1")).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.assertActive("session-1", "user-1")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("rejects subject mismatch and expired sessions", async () => {
    const { service: mismatch } = createService({ userId: "user-2", status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000) });
    await expect(mismatch.assertActive("session-1", "user-1")).rejects.toBeInstanceOf(UnauthorizedException);

    const { service: expired } = createService({ userId: "user-1", status: "ACTIVE", expiresAt: new Date(Date.now() - 1) });
    await expect(expired.assertActive("session-1", "user-1")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("invalidates a session without waiting for cache expiry", async () => {
    const { service, findUnique } = createService({ userId: "user-1", status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000) });
    service.invalidate("session-1");
    await expect(service.assertActive("session-1", "user-1")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
