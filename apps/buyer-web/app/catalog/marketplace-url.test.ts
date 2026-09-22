import { expect, it } from "vitest";
import { marketplaceCatalogUrl, readMarketplaceCatalog, safeCatalogReturn } from "./marketplace-url";
it("preserves search, all filters and the loaded window when returning from a product", () => {
  const state = readMarketplaceCatalog(new URLSearchParams("q=композит&sort=PRICE_ASC&brand=Test&category=Материалы&unit=шт&packaging=box&deliveryMethod=PICKUP&inStock=true&verified=true&official=true&minPrice=100&maxPrice=5000&count=72"));
  const url = marketplaceCatalogUrl(state);
  expect(readMarketplaceCatalog(new URL(url, "http://localhost").searchParams)).toEqual(state);
  expect(safeCatalogReturn(url)).toBe(url);
});
it("rejects external return URLs and bounds malformed pagination", () => {
  expect(safeCatalogReturn("//example.com/")).toBe("/");
  expect(safeCatalogReturn("/documents")).toBe("/");
  expect(readMarketplaceCatalog(new URLSearchParams("count=-5")).count).toBe(24);
  expect(readMarketplaceCatalog(new URLSearchParams("count=99999")).count).toBe(504);
});
it("keeps legacy category and page links in the unified catalog", () => {
  const state = readMarketplaceCatalog(new URLSearchParams("categoryId=00000000-0000-4000-8000-000000000001&offset=24&inStock=false"));
  expect(state.count).toBe(48);
  expect(safeCatalogReturn(marketplaceCatalogUrl(state, "/catalog"))).toContain("categoryId=00000000-0000-4000-8000-000000000001");
});
