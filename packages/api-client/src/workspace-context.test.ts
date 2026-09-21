import { afterEach, expect, it, vi } from "vitest";
import { MarketplaceApiClient } from "./index.js";
afterEach(() => vi.unstubAllGlobals());
it("reads current workspace with bearer only and without a tenant path parameter", async () => {
  const response = { organizationId: "00000000-0000-4000-8000-000000000001", organizationDisplayName: "Test", capabilities: ["BUYER"] };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)); vi.stubGlobal("fetch", fetcher);
  expect(await new MarketplaceApiClient("http://localhost/api", { accessToken: "synthetic", actorId: "not-authority", organizationId: "not-authority" }).workspaceContext()).toEqual(response);
  expect(fetcher).toHaveBeenCalledWith("http://localhost/api/auth/workspace-context", expect.objectContaining({ cache: "no-store", headers: { "content-type": "application/json", authorization: "Bearer synthetic" } }));
});
