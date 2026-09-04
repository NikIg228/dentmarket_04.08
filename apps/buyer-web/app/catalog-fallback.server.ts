import publicCatalogData from "./data/public-catalog-fallback.json";
import publicCatalogMedia from "./data/public-catalog-media.json";
import { dentalSearchAliases } from "./catalog-search";
import type {
  CatalogFallbackFilters,
  SearchMedia,
  SearchProduct,
  SearchResult,
} from "./catalog-search-types";

const publicMediaEntries = publicCatalogMedia.entries as Record<
  string,
  SearchMedia
>;

const demoCatalogFallback: SearchProduct[] = [
  {
    id: "00000000-0000-4000-8000-000000000100",
    name: "Перчатки нитриловые SafeTouch Ultra",
    brand: "SafeTouch",
    manufacturer: "SafeMed Industries",
    categories: [
      { id: "00000000-0000-4000-8000-000000000901", name: "Перчатки" },
    ],
    minNormalizedPriceMinor: "4750",
    isAvailable: true,
    offers: [
      {
        id: "00000000-0000-4000-8000-000000000180",
        supplier: {
          id: "00000000-0000-4000-8000-000000000060",
          name: "MedConsum",
        },
        priceMinor: "475000",
        currency: "KZT",
        normalizedPriceMinor: "4750",
        packaging: {
          name: "Упаковка 100 штук",
          quantityInBaseUnit: "100",
          unit: "шт",
        },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["CARRIER"],
      },
      {
        id: "00000000-0000-4000-8000-000000000150",
        supplier: {
          id: "00000000-0000-4000-8000-000000000020",
          name: "Demo Dental Supply",
        },
        priceMinor: "490000",
        currency: "KZT",
        normalizedPriceMinor: "4900",
        packaging: {
          name: "Упаковка 100 штук",
          quantityInBaseUnit: "100",
          unit: "шт",
        },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["SUPPLIER_CITY"],
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000110",
    name: "Нагрудники стоматологические CleanDent 2-слойные",
    brand: "CleanDent",
    manufacturer: "CleanDent Europe",
    categories: [
      { id: "00000000-0000-4000-8000-000000000902", name: "Нагрудники" },
    ],
    minNormalizedPriceMinor: "2360",
    isAvailable: true,
    offers: [
      {
        id: "00000000-0000-4000-8000-000000000200",
        supplier: {
          id: "00000000-0000-4000-8000-000000000070",
          name: "TechDent Systems",
        },
        priceMinor: "1180000",
        currency: "KZT",
        normalizedPriceMinor: "2360",
        packaging: {
          name: "Упаковка 500 штук",
          quantityInBaseUnit: "500",
          unit: "шт",
        },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["SUPPLIER_CITY"],
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000120",
    name: "Бахилы MediStep усиленные",
    brand: "MediStep",
    manufacturer: "MediStep Asia",
    categories: [
      { id: "00000000-0000-4000-8000-000000000903", name: "Бахилы" },
    ],
    minNormalizedPriceMinor: "7000",
    isAvailable: true,
    offers: [
      {
        id: "00000000-0000-4000-8000-000000000170",
        supplier: {
          id: "00000000-0000-4000-8000-000000000060",
          name: "MedConsum",
        },
        priceMinor: "350000",
        currency: "KZT",
        normalizedPriceMinor: "7000",
        packaging: {
          name: "Упаковка 50 пар",
          quantityInBaseUnit: "50",
          unit: "пар",
        },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["CARRIER"],
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000130",
    name: "Стоматологическая установка DentTech X5",
    brand: "DentTech",
    manufacturer: "DentTech GmbH",
    categories: [
      { id: "00000000-0000-4000-8000-000000000904", name: "Оборудование" },
    ],
    minNormalizedPriceMinor: "85000000",
    isAvailable: true,
    offers: [
      {
        id: "00000000-0000-4000-8000-000000000190",
        supplier: {
          id: "00000000-0000-4000-8000-000000000070",
          name: "TechDent Systems",
        },
        priceMinor: "85000000",
        currency: "KZT",
        normalizedPriceMinor: "85000000",
        packaging: { name: "Комплект", quantityInBaseUnit: "1", unit: "шт" },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["SPECIAL"],
      },
    ],
  },
];

const generatedCatalogFallback: SearchProduct[] =
  publicCatalogData.products.map((product) => ({
    ...product,
    media: publicMediaEntries[product.sourceUrl ?? ""]
      ? [publicMediaEntries[product.sourceUrl ?? ""]]
      : undefined,
    photoStatus: publicMediaEntries[product.sourceUrl ?? ""]
      ? "exact"
      : product.photoStatus,
    categories: [
      { id: `public-category-${product.category}`, name: product.category },
    ],
  }));

const publicCatalogFallback = [
  ...generatedCatalogFallback,
  ...demoCatalogFallback,
];

const normalizedCatalogIdentity = (product: {
  name: string;
  brand: string | null;
  manufacturer: string | null;
}) =>
  [product.brand, product.name, product.manufacturer]
    .map((value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("ru"),
    )
    .join("|");

const fallbackMediaByIdentity = new Map(
  generatedCatalogFallback.flatMap((product) => {
    const media = product.media?.[0];
    return media
      ? ([[normalizedCatalogIdentity(product), media]] as const)
      : [];
  }),
);

/**
 * Keep the live catalog authoritative for products, offers and availability,
 * while filling only missing product media from the bundled public snapshot.
 * The lookup is deliberately exact so a photo can never be attached to a
 * merely similar product.
 */
export function attachFallbackCatalogMedia(result: SearchResult): SearchResult {
  return {
    ...result,
    items: result.items.map((product) => {
      if (product.media?.some((media) => media.metadata?.exactProductPhoto)) {
        return product;
      }
      const media = fallbackMediaByIdentity.get(
        normalizedCatalogIdentity(product),
      );
      return media ? { ...product, media: [media] } : product;
    }),
  };
}

export function searchFallbackCatalog(
  query: string,
  sort: string,
  filters: CatalogFallbackFilters = {},
  displayLimit = 24,
): SearchResult {
  const normalized = query.trim().toLocaleLowerCase("ru");
  const searchTerms = [
    normalized,
    ...(dentalSearchAliases[normalized] ?? []),
  ].filter(Boolean);
  const filtered = publicCatalogFallback.filter((product) => {
    const offer = product.offers[0];
    const text = [
      product.name,
      product.brand,
      product.manufacturer,
      product.categories[0]?.name,
      offer?.supplier.name,
      offer?.packaging.name,
      offer?.packaging.unit,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ru");
    return (
      (!searchTerms.length ||
        searchTerms.some((term) => text.includes(term))) &&
      (!filters.unit || text.includes(filters.unit.toLocaleLowerCase("ru"))) &&
      (!filters.packaging ||
        text.includes(filters.packaging.toLocaleLowerCase("ru"))) &&
      (!filters.delivery ||
        offer?.deliveryMethods.includes(filters.delivery)) &&
      (filters.stock !== "true" || offer?.available === true)
    );
  });
  filtered.sort((left, right) => {
    if (sort === "PRICE_ASC")
      return (
        Number(left.minNormalizedPriceMinor || Number.MAX_SAFE_INTEGER) -
        Number(right.minNormalizedPriceMinor || Number.MAX_SAFE_INTEGER)
      );
    if (sort === "PRICE_DESC")
      return (
        Number(right.minNormalizedPriceMinor || -1) -
        Number(left.minNormalizedPriceMinor || -1)
      );
    return left.name.localeCompare(right.name, "ru");
  });
  const limit = Math.max(1, Math.min(displayLimit, 120));
  return {
    total: filtered.length,
    offset: 0,
    limit,
    items: filtered.slice(0, limit),
    facets: { categories: [], suppliers: [] },
  };
}
