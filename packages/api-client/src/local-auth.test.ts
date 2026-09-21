import { afterEach, expect, it, vi } from "vitest";
import { MarketplaceApiClient } from "./index.js";
afterEach(() => vi.unstubAllGlobals());
it("uses explicit local capabilities and POST-only credentials, never query strings", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ ok: true })); vi.stubGlobal("fetch", fetcher);
  const client = new MarketplaceApiClient("http://localhost/api", {});
  await client.authClientOptions();
  await client.registerEmail({ email: "test@example.invalid", displayName: "Test", password: "Synthetic-password" });
  await client.requestPasswordReset("test@example.invalid");
  await client.loginLocalOperator({ email: "test@example.invalid", password: "Synthetic-password" });
  expect(fetcher.mock.calls.map(call => call[0])).toEqual(["client-options", "register", "password/forgot", "local-operator/login"].map(p => `http://localhost/api/auth/${p}`));
  expect(fetcher.mock.calls[3][1]).toMatchObject({ method: "POST", cache: "no-store", body: JSON.stringify({ email: "test@example.invalid", password: "Synthetic-password" }) });
});
