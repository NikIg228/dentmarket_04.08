export async function fetchLiveCatalog<T extends { items: unknown[]; total: number }>(params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  try {
    const saved = JSON.parse(window.localStorage.getItem("dentmarket:city") ?? "null") as { id?: string } | null;
    if (saved?.id) params.set("cityId", saved.id);
  } catch { /* Unknown city leaves the server's default geography unchanged. */ }
  const response = await fetch(`/catalog-search?${params}`, { cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Каталог временно недоступен. Запрос и фильтры сохранены — повторите загрузку.");
  const result = await response.json() as T;
  if (!Array.isArray(result?.items) || typeof result.total !== "number") throw new Error("Не удалось получить актуальный каталог. Повторите загрузку.");
  return result;
}

/** Restore the previously loaded window using bounded API pages, never a snapshot. */
export async function loadCatalogWindow<T extends { items: unknown[]; total: number }>(load: (offset: number, limit: number) => Promise<T>, count: number): Promise<T> {
  let result = await load(0, Math.min(24, count));
  while (result.items.length < Math.min(count, result.total)) {
    const next = await load(result.items.length, Math.min(24, count - result.items.length));
    if (!next.items.length) break;
    result = { ...next, items: [...result.items, ...next.items] };
  }
  return result;
}
