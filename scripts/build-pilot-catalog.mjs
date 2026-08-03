import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const sourceCatalogPath = path.join(
  root,
  "data/archive/public-catalog-full.json",
);
const sourceMediaPath = path.join(
  root,
  "data/archive/public-catalog-media-full.json",
);
const outputCatalogPath = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-fallback.json",
);
const outputMediaPath = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-media.json",
);
const reportPath = path.join(root, "data/pilot/pilot-catalog-report.json");

const TARGET_SIZE = 500;
const DEMO_SUPPLIER_COUNT = 10;
const DEMO_PRODUCTS_PER_SUPPLIER = 50;
const POLICY_VERSION = 1;
const DEFAULT_CATEGORY_CAP = 60;
const CATEGORY_CAPS = new Map([
  ["Стоматологические материалы и оборудование", 120],
  ["Имплантология", 70],
  ["Инструменты", 70],
  ["Оборудование", 40],
  ["Ортодонтия", 35],
]);
const BROAD_CATEGORIES = new Set([
  "Стоматологические материалы и оборудование",
  "Инструменты",
  "Оборудование",
]);
const REJECTED_NAME = /ножницы\s+iris\s+delicate/i;
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isEquipment = (product) => /оборуд|установк|компрессор|автоклав|сканер/i.test(
  `${normalize(product.category)} ${normalize(product.name)}`,
);
const demoSuppliers = Array.from({ length: DEMO_SUPPLIER_COUNT }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    id: `demo-supplier-${number}`,
    name: `Демо-поставщик ${number}`,
  };
});
const demoBasePriceMinor = (product, productIndex) => {
  const stableNumber = Number.parseInt(String(product.id).replace(/\D/g, "").slice(-6) || "0", 10);
  const tenge = 1_500 + ((stableNumber + productIndex * 977) % 38_500);
  return tenge * 100;
};

const [sourceCatalog, sourceMedia] = await Promise.all([
  fs.readFile(sourceCatalogPath, "utf8").then(JSON.parse),
  fs.readFile(sourceMediaPath, "utf8").then(JSON.parse),
]);

const mediaEntries = sourceMedia.entries ?? {};
const mediaPathUsage = new Map();
for (const product of sourceCatalog.products ?? []) {
  const media = mediaEntries[product.sourceUrl ?? ""];
  if (!media?.securePath) continue;
  mediaPathUsage.set(
    media.securePath,
    (mediaPathUsage.get(media.securePath) ?? 0) + 1,
  );
}

const eligible = (sourceCatalog.products ?? []).filter((product) => {
  const name = normalize(product.name);
  const description = normalize(product.description);
  const media = mediaEntries[product.sourceUrl ?? ""];
  return (
    name.length >= 5 &&
    !REJECTED_NAME.test(name) &&
    description.length >= 60 &&
    Array.isArray(product.variants) &&
    product.variants.length > 0 &&
    media?.securePath &&
    media.metadata?.exactProductPhoto === true &&
    (mediaPathUsage.get(media.securePath) ?? 0) <= 3
  );
});

const qualityScore = (product) => {
  const descriptionLength = normalize(product.description).length;
  const variants = product.variants ?? [];
  const offers = product.offers ?? [];
  const media = mediaEntries[product.sourceUrl ?? ""];
  return (
    (product.isAvailable ? 500 : 0) +
    (product.minNormalizedPriceMinor ? 350 : 0) +
    (product.brand ? 90 : 0) +
    (product.manufacturer ? 70 : 0) +
    (descriptionLength >= 160 ? 60 : descriptionLength >= 100 ? 35 : 15) +
    (product.catalogSource === "manufacturer" ? 45 : 0) +
    (product.sourceUpdatedAt ? 25 : 0) +
    ((product.aliases?.length ?? 0) > 0 ? 25 : 0) +
    (variants.some((variant) => normalize(variant.sku)) ? 35 : 0) +
    Math.min(variants.length, 5) * 4 +
    Math.min(offers.length, 5) * 5 +
    (media?.width >= 800 && media?.height >= 800 ? 20 : 0) +
    (BROAD_CATEGORIES.has(product.category) ? -45 : 20)
  );
};

const ranked = eligible
  .map((product) => ({ product, score: qualityScore(product) }))
  .sort(
    (left, right) =>
      right.score - left.score ||
      normalize(left.product.category).localeCompare(
        normalize(right.product.category),
        "ru",
      ) ||
      normalize(left.product.name).localeCompare(normalize(right.product.name), "ru") ||
      String(left.product.id).localeCompare(String(right.product.id)),
  );

if (ranked.length < TARGET_SIZE) {
  throw new Error(
    `Pilot policy found only ${ranked.length} eligible cards; expected at least ${TARGET_SIZE}`,
  );
}

const selectedIds = new Set();
const selectedByCategory = new Map();
const selected = [];
const select = (entry) => {
  if (selectedIds.has(entry.product.id)) return false;
  selectedIds.add(entry.product.id);
  selected.push(entry);
  selectedByCategory.set(
    entry.product.category,
    (selectedByCategory.get(entry.product.category) ?? 0) + 1,
  );
  return true;
};

// Preserve breadth before filling the catalog by global quality score.
for (const category of [...new Set(ranked.map(({ product }) => product.category))].sort(
  (left, right) => normalize(left).localeCompare(normalize(right), "ru"),
)) {
  for (const entry of ranked.filter(({ product }) => product.category === category).slice(0, 3)) {
    select(entry);
  }
}

for (const entry of ranked) {
  if (selected.length >= TARGET_SIZE) break;
  const cap = CATEGORY_CAPS.get(entry.product.category) ?? DEFAULT_CATEGORY_CAP;
  if ((selectedByCategory.get(entry.product.category) ?? 0) >= cap) continue;
  select(entry);
}

// A new source snapshot may have fewer minor categories. Fill the remainder without
// changing the required quality gates, while recording the effective distribution.
for (const entry of ranked) {
  if (selected.length >= TARGET_SIZE) break;
  select(entry);
}

if (selected.length !== TARGET_SIZE) {
  throw new Error(`Pilot selection produced ${selected.length} cards, expected ${TARGET_SIZE}`);
}

const demoCoreIds = new Set(
  [...selected]
    .sort(
      (left, right) =>
        Number(isEquipment(left.product)) - Number(isEquipment(right.product)) ||
        right.score - left.score ||
        String(left.product.id).localeCompare(String(right.product.id)),
    )
    .slice(0, DEMO_PRODUCTS_PER_SUPPLIER)
    .map(({ product }) => product.id),
);
const products = selected
  .map(({ product }) => {
    if (!demoCoreIds.has(product.id)) {
      return {
        ...product,
        minNormalizedPriceMinor: null,
        isAvailable: false,
        offers: [],
      };
    }
    const productIndex = [...demoCoreIds].indexOf(product.id);
    const variant = product.variants[0];
    const basePriceMinor = demoBasePriceMinor(product, productIndex);
    const offers = demoSuppliers.map((supplier, supplierIndex) => {
      const priceMinor = Math.round(basePriceMinor * (0.93 + supplierIndex * 0.018));
      const available = supplierIndex < 8;
      return {
        id: `${product.id}-demo-offer-${String(supplierIndex + 1).padStart(2, "0")}`,
        variantId: variant.id,
        supplier,
        priceMinor: String(priceMinor),
        currency: "KZT",
        normalizedPriceMinor: String(priceMinor),
        packaging: {
          name: variant.label || "Штука",
          quantityInBaseUnit: "1",
          unit: "шт.",
        },
        available,
        confirmationMode: available ? "AUTO" : "MANUAL",
        deliveryMethods: ["CARRIER", "PICKUP"],
        supplierSku: `DEMO-${String(productIndex + 1).padStart(3, "0")}-${String(supplierIndex + 1).padStart(2, "0")}`,
        verifiedDocuments: true,
        officialDistributor: supplierIndex < 3,
        supplierWarranty: true,
        demo: true,
      };
    });
    return {
      ...product,
      minNormalizedPriceMinor: String(
        Math.min(...offers.filter((offer) => offer.available).map((offer) => Number(offer.normalizedPriceMinor))),
      ),
      isAvailable: true,
      offers,
    };
  })
  .sort(
    (left, right) =>
      normalize(left.name).localeCompare(normalize(right.name), "ru") ||
      String(left.id).localeCompare(String(right.id)),
  );
const selectedMediaEntries = Object.fromEntries(
  products.map((product) => [
    product.sourceUrl,
    mediaEntries[product.sourceUrl],
  ]),
);
const countBy = (getValue) =>
  Object.entries(
    products.reduce((result, product) => {
      const value = getValue(product);
      if (value) result[value] = (result[value] ?? 0) + 1;
      return result;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ru"))
    .map(([name, cards]) => ({ name, cards }));

const report = {
  policyVersion: POLICY_VERSION,
  sourceGeneratedAt: sourceCatalog.generatedAt ?? null,
  sourceCards: sourceCatalog.products?.length ?? 0,
  eligibleCards: eligible.length,
  selectedCards: products.length,
  selectedVariants: products.reduce(
    (total, product) => total + (product.variants?.length ?? 0),
    0,
  ),
  selectedOffers: products.reduce(
    (total, product) => total + (product.offers?.length ?? 0),
    0,
  ),
  cardsWithBrand: products.filter((product) => product.brand).length,
  cardsWithPrice: products.filter((product) => product.minNormalizedPriceMinor).length,
  cardsAvailable: products.filter((product) => product.isAvailable).length,
  mediaEntries: Object.keys(selectedMediaEntries).length,
  demoSuppliers: demoSuppliers.length,
  demoProductsWithOffers: demoCoreIds.size,
  demoOffersPerSupplier: DEMO_PRODUCTS_PER_SUPPLIER,
  categories: countBy((product) => product.category),
  brands: countBy((product) => product.brand).slice(0, 30),
  policy: {
    targetSize: TARGET_SIZE,
    demoSupplierCount: DEMO_SUPPLIER_COUNT,
    demoProductsPerSupplier: DEMO_PRODUCTS_PER_SUPPLIER,
    minimumDescriptionLength: 60,
    requiresVariant: true,
    requiresExactLocalMedia: true,
    maximumMediaReuse: 3,
    defaultCategoryCap: DEFAULT_CATEGORY_CAP,
    categoryCaps: Object.fromEntries(CATEGORY_CAPS),
    quarantinePatterns: [REJECTED_NAME.source],
  },
};

await Promise.all([
  fs.mkdir(path.dirname(outputCatalogPath), { recursive: true }),
  fs.mkdir(path.dirname(reportPath), { recursive: true }),
]);
await Promise.all([
  fs.writeFile(
    outputCatalogPath,
    `${JSON.stringify(
      {
        generatedAt: sourceCatalog.generatedAt ?? null,
        catalogMode: "PILOT",
        selectionPolicyVersion: POLICY_VERSION,
        sourceTotal: sourceCatalog.products?.length ?? 0,
        total: products.length,
        quarantine: sourceCatalog.quarantine ?? [],
        products,
      },
      null,
      2,
    )}\n`,
  ),
  fs.writeFile(
    outputMediaPath,
    `${JSON.stringify(
      {
        generatedAt: sourceMedia.generatedAt ?? null,
        catalogMode: "PILOT",
        total: Object.keys(selectedMediaEntries).length,
        entries: selectedMediaEntries,
      },
      null,
      2,
    )}\n`,
  ),
  fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
]);

console.log(
  JSON.stringify(
    {
      outputCatalogPath,
      outputMediaPath,
      reportPath,
      ...report,
      categories: report.categories.slice(0, 15),
      brands: report.brands.slice(0, 15),
    },
    null,
    2,
  ),
);
