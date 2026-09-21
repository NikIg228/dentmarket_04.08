export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_SORTS = ["RELEVANCE", "PRICE_ASC", "PRICE_DESC", "NAME_ASC", "UPDATED_DESC"] as const;
export type CatalogSort = typeof CATALOG_SORTS[number];
export type CatalogRequest = { query: string; sort: CatalogSort; categoryId?: string; inStockOnly: boolean; offset: number };
export const emptyCatalogRequest = (): CatalogRequest => ({ query: "", sort: "RELEVANCE", inStockOnly: false, offset: 0 });

export function readCatalogRequest(params: URLSearchParams): CatalogRequest {
  const sort = params.get("sort"), categoryId = params.get("categoryId"), rawOffset = Number(params.get("offset") ?? 0);
  return {
    query: (params.get("q") ?? "").trim().slice(0, 240),
    sort: CATALOG_SORTS.includes(sort as CatalogSort) ? sort as CatalogSort : "RELEVANCE",
    categoryId: categoryId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(categoryId) ? categoryId : undefined,
    inStockOnly: params.get("inStock") === "true",
    offset: Number.isInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 10_000 ? rawOffset : 0,
  };
}

export function catalogParams(request: CatalogRequest, forApi = false): URLSearchParams {
  const params = new URLSearchParams();
  if (request.query) params.set("q", request.query);
  if (request.categoryId) params.set("categoryId", request.categoryId);
  if (request.inStockOnly) params.set("inStock", "true");
  if (request.sort !== "RELEVANCE") params.set("sort", request.sort);
  if (request.offset || forApi) params.set("offset", String(request.offset));
  if (forApi) params.set("limit", String(CATALOG_PAGE_SIZE));
  return params;
}

export function catalogPageRange(request: CatalogRequest, total: number, count: number) {
  return { first: count ? request.offset + 1 : 0, last: count ? request.offset + count : 0,
    previous: Math.max(0, request.offset - CATALOG_PAGE_SIZE),
    next: request.offset + CATALOG_PAGE_SIZE,
    hasNext: request.offset + CATALOG_PAGE_SIZE < total && request.offset + CATALOG_PAGE_SIZE <= 10_000 };
}
