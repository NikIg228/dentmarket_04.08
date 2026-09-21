"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { catalogSearchResponseSchema, type CatalogSearchResponse } from "@marketplace/schemas";
import { catalogParams, emptyCatalogRequest, readCatalogRequest, type CatalogRequest } from "./catalog-request";

export function useCatalogSearch() {
  const [request, setRequest] = useState(emptyCatalogRequest);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<CatalogSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(request), sequence = useRef(0), pending = useRef<AbortController | null>(null);

  const load = useCallback(async (next: CatalogRequest) => {
    const id = ++sequence.current;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError(null);
    try {
      const result = await fetch(`/catalog-search?${catalogParams(next, true)}`, {
        cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3500)]),
      });
      if (!result.ok) throw Error("Catalog request failed");
      const parsed = catalogSearchResponseSchema.parse(await result.json());
      if (parsed.offset !== next.offset) throw Error("Unexpected catalog page");
      if (id === sequence.current) setResponse(parsed);
    } catch {
      if (id === sequence.current) {
        setResponse(null);
        setError("Каталог временно недоступен. Запрос и фильтры сохранены — повторите загрузку.");
      }
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, []);

  const apply = useCallback((next: CatalogRequest, history = true) => {
    current.current = next; setRequest(next); setQuery(next.query);
    if (history) {
      const params = catalogParams(next).toString();
      const url = params ? `/catalog?${params}` : "/catalog";
      if (url !== window.location.pathname + window.location.search) window.history.pushState(null, "", url);
    }
    void load(next);
  }, [load]);

  useEffect(() => {
    const restore = () => apply(readCatalogRequest(new URLSearchParams(window.location.search)), false);
    restore(); window.addEventListener("popstate", restore);
    return () => { window.removeEventListener("popstate", restore); ++sequence.current; pending.current?.abort(); };
  }, [apply]);

  return { request, query, setQuery, response, loading, error,
    search: (value = query) => apply({ ...current.current, query: value.trim().slice(0, 240), offset: 0 }),
    change: (patch: Partial<Omit<CatalogRequest, "query" | "offset">>) => apply({ ...current.current, ...patch, offset: 0 }),
    page: (offset: number) => apply({ ...current.current, offset }),
    reset: () => apply(emptyCatalogRequest()), retry: () => load(current.current),
  };
}
