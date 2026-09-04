import { describe, expect, it } from "vitest";
import {
  attachFallbackCatalogMedia,
  searchFallbackCatalog,
} from "./catalog-fallback.server";

describe("server-side public catalog fallback", () => {
  it("returns a bounded first page instead of the full snapshot", () => {
    const result = searchFallbackCatalog("", "RELEVANCE");

    expect(result.total).toBeGreaterThan(24);
    expect(result.items).toHaveLength(24);
    expect(result.limit).toBe(24);
  });

  it("preserves dental aliases and catalog filters", () => {
    const result = searchFallbackCatalog("перчаткии", "NAME_ASC", {
      stock: "true",
    });

    expect(result.items.length).toBeGreaterThan(0);
    expect(
      result.items.every((product) =>
        [
          product.name,
          product.brand,
          product.manufacturer,
          product.categories[0]?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes("перчат"),
      ),
    ).toBe(true);
  });

  it("caps direct fallback requests to protect response size", () => {
    const result = searchFallbackCatalog("", "RELEVANCE", {}, 10_000);

    expect(result.items).toHaveLength(120);
    expect(result.limit).toBe(120);
  });

  it("fills missing live media without replacing live product data", () => {
    const fallbackProduct = searchFallbackCatalog("", "RELEVANCE").items[0]!;
    const liveProduct = {
      ...fallbackProduct,
      id: "00000000-0000-4000-8000-000000000999",
      media: [],
      offers: [],
    };

    const result = attachFallbackCatalogMedia({
      total: 1,
      items: [liveProduct],
      facets: { categories: [], suppliers: [] },
    });

    expect(result.items[0]?.id).toBe(liveProduct.id);
    expect(result.items[0]?.offers).toEqual([]);
    expect(result.items[0]?.media?.[0]?.securePath).toMatch(
      /^\/catalog\/products\//,
    );
  });

  it("does not replace an exact live media record", () => {
    const fallbackProduct = searchFallbackCatalog("", "RELEVANCE").items[0]!;
    const liveMedia = {
      ...fallbackProduct.media![0]!,
      id: "live-media",
      securePath: "/catalog/media/live-media?ticket=signed",
    };

    const result = attachFallbackCatalogMedia({
      total: 1,
      items: [{ ...fallbackProduct, media: [liveMedia] }],
      facets: { categories: [], suppliers: [] },
    });

    expect(result.items[0]?.media).toEqual([liveMedia]);
  });
});
