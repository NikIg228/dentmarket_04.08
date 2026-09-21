import { afterEach, expect, it, vi } from "vitest";
import { MarketplaceApiClient } from "./index.js";
afterEach(() => vi.unstubAllGlobals());
it("uses three explicit POST contracts without tokens in the URL", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "ACCEPTED" })); vi.stubGlobal("fetch", fetcher);
  const client = new MarketplaceApiClient("http://localhost/api", {});
  const input = { email: "test@example.invalid", bin: "123456789012", capability: "BUYER" as const };
  await client.requestRegistrationResume(input);
  fetcher.mockResolvedValue(Response.json({ status: "READY" }));
  await client.inspectRegistrationResume({ token: "A".repeat(64) });
  fetcher.mockResolvedValue(Response.json({ status: "COMPLETED", next: "LOGIN" }));
  await client.completeRegistrationResume({ ...input, token: "A".repeat(64), password: "synthetic-password" });
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(["request", "inspect", "complete"].map(action => `http://localhost/api/auth/registration/resume/${action}`));
  for (const [, options] of fetcher.mock.calls) expect(options).toMatchObject({ method: "POST", cache: "no-store", headers: { "content-type": "application/json" } });
});
