const navigationOrigin = "https://navigation.invalid";
const productPath = /^\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unsafeCharacters = /[\\#\u0000-\u001f\u007f]/;

/** A navigation hint, never an authority, workspace choice or queued purchase. */
export function productReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096 || unsafeCharacters.test(value)) return;
  const pathname = value.split("?", 1)[0];
  if (!productPath.test(pathname)) return;
  const url = new URL(value, navigationOrigin);
  if (url.origin !== navigationOrigin || url.pathname !== pathname || url.searchParams.size > 1) return;
  if ([...url.searchParams.keys()].some(key => key !== "returnTo")) return;
  const catalog = url.searchParams.get("returnTo");
  if (catalog !== null) {
    if (!/^\/(?:catalog)?(?:\?|$)/.test(catalog) || unsafeCharacters.test(catalog)) return;
    const back = new URL(catalog, navigationOrigin);
    if (back.origin !== navigationOrigin || !["/", "/catalog"].includes(back.pathname)) return;
  }
  return url.pathname + url.search;
}

/** Append only the validated product context to a trusted application link. */
export function withProductReturn(href: string, value: unknown): string {
  const target = productReturnPath(value);
  if (!target) return href;
  const url = new URL(href, navigationOrigin);
  url.searchParams.set("returnTo", target);
  return href.startsWith("/") ? url.pathname + url.search + url.hash : url.href;
}

/** Only existing read-only pages. A return hint never selects an organization or executes an action. */
export function workspaceReturnPath(value: unknown, capability?: "BUYER" | "SUPPLIER"): string | undefined {
  if (typeof value !== "string" || value.length > 4096 || unsafeCharacters.test(value)) return;
  if (value === "/documents" || value === "/") return value;
  if (capability === "SUPPLIER") return;
  const product = productReturnPath(value);
  if (product) return product;
  if (!/^\/(?:catalog)?(?:\?|$)/.test(value)) return;
  const url = new URL(value, navigationOrigin);
  const filters = new Set(["q", "sort", "unit", "packaging", "deliveryMethod", "inStock", "brand", "category", "categoryId", "minPrice", "maxPrice", "verified", "official", "count", "offset"]);
  if (url.origin !== navigationOrigin || !["/", "/catalog"].includes(url.pathname)) return;
  for (const [key, field] of url.searchParams) if (!filters.has(key) || url.searchParams.getAll(key).length !== 1 || field.length > 240 || unsafeCharacters.test(field)) return;
  return url.pathname + url.search;
}

export function withWorkspaceReturn(href: string, value: unknown): string {
  const target = workspaceReturnPath(value);
  if (!target) return href;
  const url = new URL(href, navigationOrigin);
  url.searchParams.set("returnTo", target);
  return href.startsWith("/") ? url.pathname + url.search + url.hash : url.href;
}
