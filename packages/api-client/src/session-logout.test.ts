import { afterEach, describe, expect, it, vi } from "vitest";
import { revokeWorkspaceSession } from "./index.js";

const session = { sessionId: "session-1", accessToken: "synthetic-access" };
afterEach(() => vi.unstubAllGlobals());

describe("workspace logout server confirmation", () => {
  it("revokes the exact bearer session without cookies or identity headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: session.sessionId, status: "REVOKED" }));
    vi.stubGlobal("fetch", fetcher);
    await revokeWorkspaceSession("http://localhost/api/", session);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("http://localhost/api/auth/sessions/session-1/revoke");
    expect(options).toMatchObject({ method: "POST", credentials: "omit", headers: { "content-type": "application/json", authorization: "Bearer synthetic-access" }, body: '{"reason":"user_logout"}' });
    expect(Object.keys(options.headers)).toHaveLength(2);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([null, {}, { sessionId: "s" }, { accessToken: "t" }])("never claims a local/demo-only session was revoked (%j)", async (value) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(revokeWorkspaceSession("http://localhost/api", value)).rejects.toThrow("не подтверждён");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 429, 500])("does not accept HTTP %s or expose server internals", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "SQL secret" }, { status })));
    await expect(revokeWorkspaceSession("http://localhost/api", session)).rejects.toThrow("не подтвердил");
    await expect(revokeWorkspaceSession("http://localhost/api", session)).rejects.not.toThrow("SQL secret");
  });

  it.each([{ ok: true }, { id: "other-session", status: "REVOKED" }, { id: "session-1", status: "ACTIVE" }, null])("requires explicit confirmation for this session (%j)", async (result) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(result)));
    await expect(revokeWorkspaceSession("http://localhost/api", session)).rejects.toThrow("отзыв текущей сессии");
  });

  it("allows retry after a lost response without treating a network error as success", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("network with internal details"))
      .mockResolvedValueOnce(Response.json({ id: session.sessionId, status: "REVOKED" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(revokeWorkspaceSession("http://localhost/api", session)).rejects.toThrow("проверьте соединение");
    await expect(revokeWorkspaceSession("http://localhost/api", session)).resolves.toBeUndefined();
  });
});
