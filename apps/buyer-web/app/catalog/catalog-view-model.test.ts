import { describe, expect, it } from "vitest";
import {
  availableCatalogOffers,
  catalogImageUrl,
  catalogPackagingLabel,
  selectCatalogPriceMinor,
  type CatalogProduct,
} from "./catalog-view-model";

const product = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "composite",
  name: "Композит",
  description: null,
  descriptionSources: null,
  brand: "Brand",
  manufacturer: "Manufacturer",
  productType: "MATERIAL",
  regulatoryClass: null,
  media: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      sourceUrl: "https://cdn.example.test/composite.png",
      securePath: null,
      normalizedStorageKey: null,
      altText: "Композит",
      width: 600,
      height: 600,
      metadata: null,
    },
  ],
  categories: [{ id: "00000000-0000-4000-8000-000000000003", name: "Композиты" }],
  minNormalizedPriceMinor: null,
  maxNormalizedPriceMinor: null,
  isAvailable: true,
  reviewSummary: { count: 0, averageRating: null },
  rank: 1,
  variants: [],
  offers: [
    {
      id: "00000000-0000-4000-8000-000000000004",
      variantId: "00000000-0000-4000-8000-000000000005",
      supplier: { id: "00000000-0000-4000-8000-000000000006", name: "Поставщик" },
      priceMinor: "125000",
      currency: "KZT",
      normalizedPriceMinor: "125000",
      packaging: { name: "Шприц 4 г", quantityInBaseUnit: "4", unit: "g" },
      available: true,
      freshness: [],
      confirmationMode: "AUTO",
      deliveryMethods: ["COURIER"],
      promotion: null,
    },
  ],
} as CatalogProduct;

describe("catalog view model", () => {
  it("uses a normalized available offer price when the product has no range", () => {
    expect(selectCatalogPriceMinor(product)).toBe("125000");
  });

  it("exposes only available offers for buyer-facing availability", () => {
    expect(availableCatalogOffers(product)).toHaveLength(1);
  });

  it("selects media and packaging from the typed catalog response", () => {
    expect(catalogImageUrl(product)).toContain("composite.png");
    expect(catalogPackagingLabel(product)).toBe("Шприц 4 г");
  });

  it("prefers a same-origin catalog asset over an external source", () => {
    const withLocalMedia = {
      ...product,
      media: [
        {
          ...product.media[0]!,
          securePath: "/catalog/products/composite.webp",
        },
      ],
    };

    expect(catalogImageUrl(withLocalMedia)).toBe(
      "/catalog/products/composite.webp",
    );
  });

  it("routes protected media through the configured API base", () => {
    const withProtectedMedia = {
      ...product,
      media: [
        {
          ...product.media[0]!,
          securePath: "/catalog/media/media-id?ticket=signed",
        },
      ],
    };

    expect(catalogImageUrl(withProtectedMedia, "/api")).toBe(
      "/api/catalog/media/media-id?ticket=signed",
    );
  });
});
