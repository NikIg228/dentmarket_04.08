export type MarketplaceCatalogState = {
  query: string; sort: string; unit: string; packaging: string; delivery: string; stock: string;
  brand: string; category: string; categoryId?: string; minPrice: string; maxPrice: string; verified: boolean; official: boolean; count: number;
};
export function readMarketplaceCatalog(params: URLSearchParams): MarketplaceCatalogState {
  const str = (key: string) => (params.get(key) ?? "").slice(0, 240);
  const count = Number(params.get("count") ?? Number(params.get("offset") ?? 0) + 24);
  return { query: str("q"), sort: ["RELEVANCE", "PRICE_ASC", "PRICE_DESC", "NAME_ASC", "UPDATED_DESC"].includes(str("sort")) ? str("sort") : "RELEVANCE",
    unit: str("unit"), packaging: str("packaging"), delivery: str("deliveryMethod"), stock: ["true", "false"].includes(str("inStock")) ? str("inStock") : "all",
    brand: str("brand"), category: str("category"), categoryId: /^[0-9a-f-]{36}$/i.test(str("categoryId")) ? str("categoryId") : "", minPrice: str("minPrice"), maxPrice: str("maxPrice"),
    verified: params.get("verified") === "true", official: params.get("official") === "true",
    count: Number.isInteger(count) && count >= 24 ? Math.min(count, 504) : 24 };
}
export function marketplaceCatalogUrl(state: MarketplaceCatalogState, pathname = "/") {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ q: state.query, sort: state.sort === "RELEVANCE" ? "" : state.sort,
    unit: state.unit, packaging: state.packaging, deliveryMethod: state.delivery, inStock: state.stock === "all" ? "" : state.stock,
    brand: state.brand, category: state.category, categoryId: state.categoryId, minPrice: state.minPrice, maxPrice: state.maxPrice,
    verified: state.verified ? "true" : "", official: state.official ? "true" : "", count: state.count > 24 ? String(state.count) : "" })) if (value) params.set(key, value);
  return `${pathname === "/catalog" ? "/catalog" : "/"}${params.size ? `?${params}` : ""}`;
}
export function safeCatalogReturn(value?: string) {
  if (!value || !/^\/(?:catalog)?(?:\?|$)/.test(value)) return "/";
  const url = new URL(value, "http://local.invalid");
  return marketplaceCatalogUrl(readMarketplaceCatalog(url.searchParams), url.pathname);
}
