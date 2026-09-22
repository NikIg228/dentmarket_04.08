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
