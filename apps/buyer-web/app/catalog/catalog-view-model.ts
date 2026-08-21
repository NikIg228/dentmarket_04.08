import type { CatalogSearchResponse } from "@marketplace/api-client";

export type CatalogProduct = CatalogSearchResponse["items"][number];

export function selectCatalogPriceMinor(product: CatalogProduct): string | null {
  return (
    product.minNormalizedPriceMinor ??
    product.offers.find((offer) => offer.available && offer.normalizedPriceMinor)?.normalizedPriceMinor ??
    product.offers.find((offer) => offer.available && offer.priceMinor)?.priceMinor ??
    product.offers.find((offer) => offer.normalizedPriceMinor)?.normalizedPriceMinor ??
    null
  );
}

export function availableCatalogOffers(product: CatalogProduct) {
  return product.offers.filter((offer) => offer.available);
}

export function catalogImageUrl(product: CatalogProduct): string | null {
  const media = product.media.find((item) => item.sourceUrl || item.securePath);
  return media?.sourceUrl ?? media?.securePath ?? null;
}

export function catalogPackagingLabel(product: CatalogProduct): string {
  const packaging = product.offers.find((offer) => offer.packaging.name)?.packaging;
  return packaging?.name ?? "Упаковка уточняется";
}
