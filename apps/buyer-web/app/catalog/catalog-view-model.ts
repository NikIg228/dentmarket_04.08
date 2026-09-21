import type { CatalogSearchResponse } from "@marketplace/api-client";

export type CatalogProduct = CatalogSearchResponse["items"][number];

export function selectCatalogPriceMinor(product: CatalogProduct): string | null {
  return selectCatalogOffer(product)?.priceMinor ?? null;
}

// Compare exact decimal strings, never binary floating-point money.
function compareDecimal(left: string, right: string) {
  const [li, lf = ""] = left.split("."), [ri, rf = ""] = right.split(".");
  const scale = Math.max(lf.length, rf.length);
  const a = BigInt(li! + lf.padEnd(scale, "0")), b = BigInt(ri! + rf.padEnd(scale, "0"));
  return a < b ? -1 : a > b ? 1 : 0;
}

export function selectCatalogOffer(product: CatalogProduct) {
  const priced = product.offers.filter(offer => offer.priceMinor != null && /^\d+(?:\.\d+)?$/.test(offer.priceMinor));
  const available = priced.filter(offer => offer.available);
  return [...(available.length ? available : priced)].sort((a, b) => compareDecimal(a.priceMinor!, b.priceMinor!))[0] ?? null;
}

export function formatCatalogMoney(minor: string | null | undefined, currency = "KZT") {
  if (minor == null || !/^\d+(?:\.\d+)?$/.test(minor)) return "По запросу";
  const [integer, fraction = ""] = minor.split(".");
  const padded = integer!.padStart(3, "0");
  const major = padded.slice(0, -2).replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const decimals = (padded.slice(-2) + fraction).replace(/0+$/, "");
  return `${major}${decimals ? `,${decimals}` : ""} ${currency === "KZT" ? "₸" : currency}`;
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
  const packaging = selectCatalogOffer(product)?.packaging;
  return packaging?.name ?? "Упаковка уточняется";
}
