import { describe, expect, it, vi } from "vitest";
import { OneCAgentApi, OneCAgentRunner, safeOneCAgentError, type OneCSourceAdapter } from "./index.js";

describe("1C Agent protocol client", () => {
  it("enrolls once and sends the returned bearer token on subsequent calls", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ agentId: "agent-1", accessToken: "access-token", minimumSupportedVersion: "0.1.0", heartbeatIntervalSeconds: 30, claimIntervalSeconds: 5 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, serverTime: "2026-08-22T00:00:00.000Z" }), { status: 200 }));
    const api = new OneCAgentApi({ baseUrl: "https://api.example.kz", agentId: "agent-1", fetchImpl });

    await api.enroll("enrollment-token", "0.1.0", ["CATALOG_SYNC"]);
    await api.heartbeat("0.1.0", ["CATALOG_SYNC"]);

    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ headers: expect.any(Headers) });
    const headers = (fetchImpl.mock.calls[1]?.[1] as RequestInit).headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer access-token");
  });

  it("dispatches a claimed catalog job to the source adapter and completes it", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-1", type: "CATALOG_SYNC", trigger: "AGENT", payload: null, cursor: null, attempt: 1, maxAttempts: 3, correlationId: null } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "job-1", status: "SUCCEEDED" }), { status: 200 }));
    const api = new OneCAgentApi({ baseUrl: "https://api.example.kz", agentId: "agent-1", accessToken: "access-token", fetchImpl });
    const source: OneCSourceAdapter = {
      testConnection: async () => ({ ok: true }),
      discover: async () => ({ ok: true }),
      pullCatalog: async () => ({ items: [{ externalId: "item-1", name: "Dental item", raw: {} }] }),
      pullPrices: async () => ({ items: [] }),
      pullInventory: async () => ({ items: [] }),
      exportOrder: async () => ({ accepted: true, data: {} }),
      createReservation: async () => ({ status: "ACTIVE", data: {} }),
      releaseReservation: async () => ({ status: "RELEASED", data: {} }),
    };

    await expect(new OneCAgentRunner(api, source).runOnce()).resolves.toMatchObject({ status: "COMPLETED", jobId: "job-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchImpl.mock.calls[1]?.[1] as RequestInit).body))).toMatchObject({ result: { items: [{ externalId: "item-1" }] } });
  });

  it("rejects an invalid source result as a permanent contract error", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: "job-2", type: "CATALOG_SYNC", trigger: "AGENT", payload: null, cursor: null, attempt: 1, maxAttempts: 3, correlationId: null } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "job-2", status: "FAILED" }), { status: 200 }));
    const api = new OneCAgentApi({ baseUrl: "https://api.example.kz", agentId: "agent-1", accessToken: "access-token", fetchImpl });
    const source = {
      pullCatalog: async () => ({ items: [{ externalId: "item-without-name" }] }),
    } as unknown as OneCSourceAdapter;

    await expect(new OneCAgentRunner(api, source).runOnce()).resolves.toMatchObject({
      status: "FAILED",
      jobId: "job-2",
      message: expect.stringContaining("does not match the CATALOG_SYNC contract"),
    });
    expect(JSON.parse(String((fetchImpl.mock.calls[1]?.[1] as RequestInit).body))).toMatchObject({ retryable: false });
  });

  it("redacts common credentials from source errors", () => {
    expect(safeOneCAgentError(new Error("password=secret token:abc Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature")))
      .toBe("password=[REDACTED] token:[REDACTED] Bearer [REDACTED]");
  });
});
