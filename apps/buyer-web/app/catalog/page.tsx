"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight24Regular,
  Box24Regular,
  CheckmarkCircle24Regular,
  Filter24Regular,
  ShieldCheckmark24Regular,
  VehicleTruckProfile24Regular,
} from "@fluentui/react-icons";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  formatDate,
  formatMoney,
} from "@marketplace/ui";
import { MarketplaceApiClient, type CatalogSearchResponse } from "@marketplace/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicHeader } from "../public-header";
import {
  availableCatalogOffers,
  catalogImageUrl,
  catalogPackagingLabel,
  selectCatalogPriceMinor,
} from "./catalog-view-model";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const PAGE_SIZE = 24;
type SortOption = "RELEVANCE" | "PRICE_ASC" | "PRICE_DESC" | "NAME_ASC" | "UPDATED_DESC";

type CatalogRequest = {
  query: string;
  sort: SortOption;
  categoryId?: string;
  inStockOnly: boolean;
};

function updateCatalogUrl(router: ReturnType<typeof useRouter>, request: CatalogRequest) {
  const params = new URLSearchParams();
  if (request.query) params.set("q", request.query);
  if (request.categoryId) params.set("categoryId", request.categoryId);
  if (request.inStockOnly) params.set("inStock", "true");
  if (request.sort !== "RELEVANCE") params.set("sort", request.sort);
  const query = params.toString();
  router.replace(query ? `/catalog?${query}` : "/catalog", { scroll: false });
}

function CatalogCard({ product }: { product: CatalogSearchResponse["items"][number] }) {
  const availableOffers = availableCatalogOffers(product);
  const priceMinor = selectCatalogPriceMinor(product);
  const imageUrl = catalogImageUrl(product);
  const freshness = product.offers
    .flatMap((offer) => offer.freshness)
    .find((item) => item.updatedAt);
  const supplierNames = [...new Set(availableOffers.map((offer) => offer.supplier.name))];

  return (
    <article className={styles.card}>
      <Link className={styles.cardImage} href={`/products/${product.id}`} aria-label={`Открыть ${product.name}`}>
        {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span className={styles.imageFallback}>DM</span>}
        {product.isAvailable ? <span className={styles.availableBadge}><CheckmarkCircle24Regular aria-hidden="true" /> В наличии</span> : null}
      </Link>
      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          <span>{product.categories[0]?.name ?? product.productType}</span>
          {product.brand ? <span>{product.brand}</span> : null}
        </div>
        <Link className={styles.cardTitle} href={`/products/${product.id}`}>
          {product.name}
        </Link>
        <p className={styles.cardDescription}>{product.description ?? "Описание и характеристики доступны в карточке товара."}</p>
        <div className={styles.cardFacts}>
          <span><Box24Regular aria-hidden="true" /> {catalogPackagingLabel(product)}</span>
              <span><VehicleTruckProfile24Regular aria-hidden="true" /> Доставка от поставщика</span>
        </div>
        <div className={styles.cardFooter}>
          <div>
            <span className={styles.priceCaption}>Цена от</span>
            <strong className={styles.price}>{priceMinor ? formatMoney(priceMinor, "KZT") : "По запросу"}</strong>
            <span className={styles.supplierCaption}>{supplierNames.length ? `${supplierNames.length} поставщик${supplierNames.length === 1 ? "" : "а"}` : "Поставщик уточняется"}</span>
          </div>
          <Link className={styles.cardAction} href={`/products/${product.id}`}>
            Подробнее <ArrowRight24Regular aria-hidden="true" />
          </Link>
        </div>
        {freshness?.updatedAt ? <small className={styles.freshness}>Обновлено {formatDate(freshness.updatedAt)}</small> : null}
      </div>
    </article>
  );
}

export default function CatalogPage() {
  const router = useRouter();
  const api = useMemo(() => new MarketplaceApiClient(API_URL, {}), []);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("RELEVANCE");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [inStockOnly, setInStockOnly] = useState(false);
  const [response, setResponse] = useState<CatalogSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async (request: CatalogRequest) => {
    setLoading(true);
    setError(null);
    try {
      const nextResponse = await api.searchPublicCatalog({
        q: request.query,
        categoryId: request.categoryId,
        inStock: request.inStockOnly ? "true" : undefined,
        sort: request.sort,
        offset: 0,
        limit: PAGE_SIZE,
      });
      setResponse(nextResponse);
    } catch {
      setResponse(null);
      setError("Каталог временно недоступен. Проверьте соединение и повторите попытку.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialRequest: CatalogRequest = {
      query: params.get("q") ?? "",
      sort: (params.get("sort") as SortOption | null) ?? "RELEVANCE",
      categoryId: params.get("categoryId") ?? undefined,
      inStockOnly: params.get("inStock") === "true",
    };
    setQuery(initialRequest.query);
    setSort(initialRequest.sort);
    setCategoryId(initialRequest.categoryId);
    setInStockOnly(initialRequest.inStockOnly);
    void loadCatalog(initialRequest);
  }, [loadCatalog]);

  const request = (overrides: Partial<CatalogRequest> = {}): CatalogRequest => ({
    query,
    sort,
    categoryId,
    inStockOnly,
    ...overrides,
  });

  const runSearch = (nextQuery = query) => {
    const next = request({ query: nextQuery.trim() });
    setQuery(next.query);
    updateCatalogUrl(router, next);
    void loadCatalog(next);
  };

  const selectCategory = (nextCategoryId?: string) => {
    const next = request({ categoryId: nextCategoryId });
    setCategoryId(next.categoryId);
    updateCatalogUrl(router, next);
    void loadCatalog(next);
  };

  const changeStockFilter = (nextInStockOnly: boolean) => {
    const next = request({ inStockOnly: nextInStockOnly });
    setInStockOnly(next.inStockOnly);
    updateCatalogUrl(router, next);
    void loadCatalog(next);
  };

  const changeSort = (nextSort: SortOption) => {
    const next = request({ sort: nextSort });
    setSort(next.sort);
    updateCatalogUrl(router, next);
    void loadCatalog(next);
  };

  return (
    <div className={styles.page}>
      <PublicHeader
        active="catalog"
        baseHref="/catalog"
        query={query}
        searching={loading}
        onQueryChange={setQuery}
        onSearch={(value) => runSearch(value)}
      />
      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>DentMarket · B2B-каталог</span>
            <h1>Стоматологические материалы, которые легко закупать.</h1>
            <p>Сравнивайте предложения поставщиков, проверяйте наличие и собирайте заказ в одном рабочем пространстве клиники.</p>
            <div className={styles.heroProofs}>
              <span><ShieldCheckmark24Regular aria-hidden="true" /> Проверенные предложения</span>
              <span><VehicleTruckProfile24Regular aria-hidden="true" /> Доставка по Казахстану</span>
            </div>
          </div>
          <div className={styles.heroVisual} aria-hidden="true">
            <span className={styles.heroOrb} />
            <div className={styles.heroPanel}>
              <span>Живая выдача</span>
              <strong>{response ? response.total : "—"}</strong>
              <small>товаров в каталоге</small>
            </div>
          </div>
        </section>

        <section className={styles.content} aria-label="Каталог товаров">
          <aside className={styles.filters} aria-label="Фильтры каталога">
            <div className={styles.filterHeading}><Filter24Regular aria-hidden="true" /><strong>Фильтры</strong></div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={inStockOnly} onChange={(event) => changeStockFilter(event.currentTarget.checked)} />
              <span>Только в наличии</span>
            </label>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Категории</span>
              <button type="button" className={!categoryId ? styles.filterOptionActive : styles.filterOption} onClick={() => selectCategory(undefined)}>Все категории</button>
              {response?.facets.categories.slice(0, 8).map((facet) => (
                <button type="button" key={facet.id} className={facet.id === categoryId ? styles.filterOptionActive : styles.filterOption} onClick={() => selectCategory(facet.id)}>
                  <span>{facet.name}</span><small>{facet.count}</small>
                </button>
              ))}
            </div>
            <div className={styles.filterNote}>
              <strong>Понятные условия закупки</strong>
              <span>Цена, упаковка, наличие и срок обновления предложения отображаются прямо в выдаче.</span>
            </div>
          </aside>

          <div className={styles.results}>
            <div className={styles.resultsToolbar}>
              <div>
                <span className={styles.eyebrow}>Marketplace</span>
                <h2>{response ? `${response.total} товаров` : "Каталог товаров"}</h2>
                {response?.interpretedQuery?.length ? <p>Понимаем запрос как: {response.interpretedQuery.join(", ")}</p> : null}
              </div>
              <label className={styles.sortControl}>
                <span>Сортировка</span>
                <select value={sort} onChange={(event) => changeSort(event.currentTarget.value as SortOption)}>
                  <option value="RELEVANCE">По релевантности</option>
                  <option value="PRICE_ASC">Сначала дешевле</option>
                  <option value="PRICE_DESC">Сначала дороже</option>
                  <option value="NAME_ASC">По названию</option>
                  <option value="UPDATED_DESC">Недавно обновлённые</option>
                </select>
              </label>
            </div>

            {loading ? (
              <div className={styles.loadingArea}><LoadingState label="Загружаем предложения поставщиков" /></div>
            ) : error ? (
              <div className={styles.stateArea}><ErrorState description={error} action={<button className={styles.retry} type="button" onClick={() => void loadCatalog(request())}>Повторить загрузку</button>} /></div>
            ) : response?.items.length ? (
              <div className={styles.grid}>
                {response.items.map((product) => <CatalogCard key={product.id} product={product} />)}
              </div>
            ) : (
              <div className={styles.stateArea}><EmptyState title="Ничего не нашли" description="Измените запрос или уберите часть фильтров — мы попробуем подобрать другие предложения." action={<button className={styles.retry} type="button" onClick={() => { setQuery(""); selectCategory(undefined); }}>Сбросить фильтры</button>} /></div>
            )}

            {response?.facets.suppliers.length ? (
              <div className={styles.supplierStrip}>
                <div><span className={styles.eyebrow}>Партнёры в выдаче</span><strong>Предложения от поставщиков</strong></div>
                <div className={styles.supplierList}>{response.facets.suppliers.slice(0, 5).map((supplier) => <span key={supplier.id}>{supplier.name} <small>{supplier.count}</small></span>)}</div>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
