import { describe, expect, it } from "vitest";
import { catalogParams, catalogPageRange, emptyCatalogRequest, readCatalogRequest } from "./catalog-request";

describe("catalog request snapshot", () => {
  it("restores all query filters and page from a direct URL", () => {
    const input = new URLSearchParams("q=композит&categoryId=00000000-0000-4000-8000-000000000001&inStock=true&sort=PRICE_DESC&offset=24");
    const state = readCatalogRequest(input);
    expect(state).toEqual({ query: "композит", categoryId: input.get("categoryId"), inStockOnly: true, sort: "PRICE_DESC", offset: 24 });
    expect(readCatalogRequest(catalogParams(state))).toEqual(state);
  });
  it("reset builds an empty request, not stale state with one filter removed", () => {
    expect(catalogParams(emptyCatalogRequest()).toString()).toBe("");
    expect(catalogParams(emptyCatalogRequest(), true).toString()).toBe("offset=0&limit=24");
  });
  it.each(["-1", "NaN", "1.5", "10001"])("rejects invalid offset %s and invalid sort/category", (offset) => {
    expect(readCatalogRequest(new URLSearchParams(`offset=${offset}&sort=UNKNOWN&categoryId=bad`))).toEqual({ ...emptyCatalogRequest(), categoryId: undefined });
  });
  it("bounds pagination and handles end/empty/out-of-range pages", () => {
    expect(catalogPageRange({ ...emptyCatalogRequest(), offset: 24 }, 26, 2)).toEqual({first:25,last:26,previous:0,next:48,hasNext:false});
    expect(catalogPageRange(emptyCatalogRequest(), 26, 24).hasNext).toBe(true);
    expect(catalogPageRange({ ...emptyCatalogRequest(), offset:48 }, 26, 0).first).toBe(0);
    expect(catalogPageRange({ ...emptyCatalogRequest(), offset:9984 }, 20000, 24).hasNext).toBe(false);
  });
});
