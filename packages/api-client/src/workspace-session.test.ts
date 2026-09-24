import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceSession } from "./workspace-session.js";
import { MarketplaceApiClient } from "./index.js";

const organizationId = "00000000-0000-4000-8000-000000000020";
const sessionId = "00000000-0000-4000-8000-000000000021";
const userId = "00000000-0000-4000-8000-000000000022";
const context = { organizationId, organizationDisplayName: "Test supplier", capabilities: ["SUPPLIER"] };
const response = { ...context, capability: "SUPPLIER", user: { id: userId, email: "fixture@example.invalid", displayName: "Test" },
  activeOrganizationId: organizationId, organizationIds: [organizationId], sessionId, accessToken: "test-token",
  accessTokenExpiresIn: 900, refreshTokenExpiresAt: "2026-12-01T00:00:00.000Z", csrfToken: "synthetic-csrf-token-long-enough" };
function browser(value?: object, hash = "") {
  const data = new Map<string, string>();
  if (value) data.set("dentmarket:supplier-session", JSON.stringify(value));
  vi.stubGlobal("window", { sessionStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) },
    location: { hash, pathname: "/", search: "" }, history: { replaceState: vi.fn() } });
  return data;
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("verified workspace session", () => {
  it("exchanges a one-time code once across concurrent StrictMode starts and verifies membership", async () => {
    browser(undefined, "#session=" + encodeURIComponent(JSON.stringify({ organizationId, capability: "SUPPLIER", handoffCode: "one-time-synthetic-code" })));
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(response)).mockResolvedValueOnce(Response.json(context));
    vi.stubGlobal("fetch", fetcher);
    const store = createWorkspaceSession("/api", "SUPPLIER");
    await Promise.all([store.start(), store.start(), store.start()]);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/auth/handoff/exchange", "/api/auth/workspace-context"]);
    expect(store.getSnapshot()).toMatchObject({ ready: true, error: null, session: { sessionId, organizationId } });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "include", signal: expect.any(AbortSignal) });
  });
  it("never authenticates an actor-only development fixture", async () => {
    browser({ organizationId, capability: "SUPPLIER", actorId: userId });
    const fetcher = vi.fn().mockResolvedValue(Response.json(null)); vi.stubGlobal("fetch", fetcher);
    const store = createWorkspaceSession("/api", "SUPPLIER"); await store.start();
    expect(store.getSnapshot()).toEqual({ ready: true, session: null, error: null });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/auth/current?workspace=SUPPLIER"]);
  });
  it("restores a fresh tab from its capability cookie, then verifies membership without rotating it", async () => {
    browser();
    const restored = { ...response, workspaces: [context] };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(restored)).mockResolvedValueOnce(Response.json(context));
    vi.stubGlobal("fetch", fetcher);
    const store = createWorkspaceSession("/api", "SUPPLIER"); await Promise.all([store.start(), store.start()]);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["/api/auth/current?workspace=SUPPLIER", "/api/auth/workspace-context"]);
    expect(store.getSnapshot()).toMatchObject({ ready: true, error: null, session: { organizationId, sessionId, capability: "SUPPLIER" } });
  });
  it("never promotes a supplier cookie into a buyer session", async () => {
    browser(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...response, workspaces: [context] })));
    const store = createWorkspaceSession("/api", "BUYER"); await store.start();
    expect(store.getSnapshot().session).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("denies a stored token whose organization no longer permits supplier access", async () => {
    const data = browser({ ...response, accessTokenExpiresAt: Date.now() + 900000 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...context, capabilities: ["BUYER"] })));
    const store = createWorkspaceSession("/api", "SUPPLIER"); await store.start();
    expect(store.getSnapshot()).toMatchObject({ ready: true, session: null, error: expect.stringContaining("Войдите") });
    expect(data.size).toBe(0);
  });
  it("ends loading on network failure and permits an explicit retry without deleting the stored login", async () => {
    const data = browser({ ...response, accessTokenExpiresAt: Date.now() + 900000 });
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValueOnce(Response.json(context)); vi.stubGlobal("fetch", fetcher);
    const store = createWorkspaceSession("/api", "SUPPLIER"); await store.start();
    expect(store.getSnapshot()).toMatchObject({ ready: true, session: null }); expect(data.size).toBe(1);
    await store.retry(); expect(store.getSnapshot().session?.organizationId).toBe(organizationId);
  });
  it("shares one refresh with CSRF and clears definitively revoked sessions", async () => {
    browser({ ...response, accessTokenExpiresAt: Date.now() + 900000 });
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(context)).mockResolvedValueOnce(Response.json({ ...response, accessToken: "rotated" })).mockResolvedValueOnce(Response.json({}, { status: 401 }));
    vi.stubGlobal("fetch", fetcher); const store = createWorkspaceSession("/api", "SUPPLIER"); await store.start();
    expect(await Promise.all([store.getAccessToken(true), store.getAccessToken(true)])).toEqual(["rotated", "rotated"]);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: "include", headers: { "x-csrf-token": response.csrfToken } });
    await expect(store.getAccessToken(true)).rejects.toThrow("Войдите"); expect(store.getSnapshot().session).toBeNull();
  });
  it("does not replay a rejected write; only safe reads receive one refresh retry", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("token"); const onUnauthorized = vi.fn();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 401 })); vi.stubGlobal("fetch", fetcher);
    const api = new MarketplaceApiClient("/api", { getAccessToken, onUnauthorized });
    await expect(api.post("/carts", { anything: true })).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(getAccessToken).not.toHaveBeenCalledWith(true); expect(onUnauthorized).toHaveBeenCalledOnce();
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 401 })).mockResolvedValueOnce(Response.json({ ok: true }));
    await expect(api.get("/carts")).resolves.toEqual({ ok: true }); expect(getAccessToken).toHaveBeenCalledWith(true);
  });
});
