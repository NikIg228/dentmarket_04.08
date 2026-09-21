import { describe, expect, it } from "vitest";
import {
  availableCatalogOffers,
  catalogImageUrl,
  catalogPackagingLabel,
  selectCatalogPriceMinor,
  selectCatalogOffer,
  formatCatalogMoney,
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
  it("uses the sale-unit price, not the normalized minimum", () => {
    expect(selectCatalogPriceMinor(product)).toBe("125000");
  });

  it.each([1, 10, 100])("keeps package and normalized price for %s units tied to one offer", (quantity) => {
    const first = { ...product.offers[0]!, priceMinor: "123400", normalizedPriceMinor: String(123400 / quantity), packaging: { name: `Коробка ${quantity}`, quantityInBaseUnit: String(quantity), unit: "шт" } };
    const candidate = { ...product, minNormalizedPriceMinor: "1", offers: [first, { ...first, id: "other", priceMinor: "200000", normalizedPriceMinor: "1", packaging: { name: "Другая фасовка", quantityInBaseUnit: "200000", unit: "шт" } }] };
    expect(selectCatalogOffer(candidate)).toBe(first);
    expect(selectCatalogPriceMinor(candidate)).toBe("123400");
    expect(catalogPackagingLabel(candidate)).toBe(`Коробка ${quantity}`);
  });

  it("prefers available offers without using another supplier's minimum or pack", () => {
    const available = { ...product.offers[0]!, priceMinor: "50000", packaging: { name: "Доступная", quantityInBaseUnit: "10", unit: "шт" } };
    const candidate = { ...product, minNormalizedPriceMinor: "1", offers: [{ ...available, available: false, priceMinor: "1", packaging: { ...available.packaging, name: "Недоступная" } }, available] };
    expect(selectCatalogOffer(candidate)).toBe(available);
    expect(catalogPackagingLabel(candidate)).toBe("Доступная");
  });

  it("does not invent a unit or price for missing offer data", () => {
    const missing = { ...product, offers: [] };
    expect(selectCatalogPriceMinor(missing)).toBeNull();
    expect(catalogPackagingLabel(missing)).toBe("Упаковка уточняется");
    expect(formatCatalogMoney(null)).toBe("По запросу");
  });

  it.each([
    ["12345", "123,45 ₸"], ["1", "0,01 ₸"], ["0.123456", "0,00123456 ₸"],
    ["9007199254740993", "90\u00a0071\u00a0992\u00a0547\u00a0409,93 ₸"], ["10000.000000", "100 ₸"],
  ])("formats %s without dropping precision", (value, expected) => expect(formatCatalogMoney(value)).toBe(expected));

  it("sorts huge exact prices without Number rounding", () => {
    const candidate = { ...product, offers: [ { ...product.offers[0]!, priceMinor: "9007199254740993" }, { ...product.offers[0]!, id: "lower", priceMinor: "9007199254740992" } ] };
    expect(selectCatalogOffer(candidate)?.id).toBe("lower");
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
