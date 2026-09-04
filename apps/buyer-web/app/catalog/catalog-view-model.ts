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

export function catalogImageUrl(
  product: CatalogProduct,
  apiUrl = "/api",
): string | null {
  const media = product.media.find((item) => item.securePath || item.sourceUrl);
  if (media?.securePath?.startsWith("/catalog/products/")) {
    return media.securePath;
  }
  if (media?.securePath) {
    return `${apiUrl.replace(/\/$/, "")}${media.securePath}`;
  }
  return media?.sourceUrl ?? null;
}

export function catalogPackagingLabel(product: CatalogProduct): string {
  const packaging = product.offers.find((offer) => offer.packaging.name)?.packaging;
  return packaging?.name ?? "Упаковка уточняется";
}
