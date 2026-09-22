import { afterEach, expect, it, vi } from "vitest";
import { fetchLiveCatalog, loadCatalogWindow } from "./live-search";
afterEach(() => vi.unstubAllGlobals());
it("exposes API outage instead of silently fetching a reserve catalog", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({}, { status: 500 })); vi.stubGlobal("fetch", fetcher);
  await expect(fetchLiveCatalog(new URLSearchParams())).rejects.toThrow("временно недоступен");
  expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toBe("/catalog-search?");
});
it("restores multiple pages with bounded requests", async () => {
  const load = vi.fn(async (offset: number, limit: number) => ({ items: Array.from({ length: Math.min(limit, 53-offset) }, (_, i) => offset+i), total: 53 }));
  expect((await loadCatalogWindow(load, 72)).items).toHaveLength(53);
  expect(load.mock.calls).toEqual([[0,24], [24,24], [48,24]]);
});
