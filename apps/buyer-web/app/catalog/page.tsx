"use client";

import Link from "next/link";
import { ArrowRight24Regular } from "@fluentui/react-icons/svg/arrow-right";
import { Box24Regular } from "@fluentui/react-icons/svg/box";
import { CheckmarkCircle24Regular } from "@fluentui/react-icons/svg/checkmark-circle";
import { Filter24Regular } from "@fluentui/react-icons/svg/filter";
import { ShieldCheckmark24Regular } from "@fluentui/react-icons/svg/shield-checkmark";
import { VehicleTruckProfile24Regular } from "@fluentui/react-icons/svg/vehicle-truck-profile";
import {
  DmButton,
  DmCheckbox,
  DmSelect,
  EmptyState,
  ErrorState,
  LoadingState,
  formatDate,
} from "@marketplace/ui";
import type { CatalogSearchResponse } from "@marketplace/api-client";
import { PublicHeader } from "../public-header";
import {
  availableCatalogOffers,
  catalogImageUrl,
  catalogPackagingLabel,
  selectCatalogOffer,
  formatCatalogMoney,
} from "./catalog-view-model";
import { useCatalogSearch } from "./use-catalog-search";
import { catalogPageRange, type CatalogSort } from "./catalog-request";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
function CatalogCard({ product }: { product: CatalogSearchResponse["items"][number] }) {
  const availableOffers = availableCatalogOffers(product);
  const offer = selectCatalogOffer(product);
  const imageUrl = catalogImageUrl(product, API_URL);
  const freshness = offer?.freshness.find((item) => item.updatedAt);
  const supplierNames = [...new Set(availableOffers.map((offer) => offer.supplier.name))];

  return (
    <article className={styles.card} data-testid="catalog-card" data-product-id={product.id} data-offer-id={offer?.id}>
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
          <span><Box24Regular aria-hidden="true" /> {catalogPackagingLabel(product)}{offer?.packaging.unit ? ` · ${offer.packaging.quantityInBaseUnit} ${offer.packaging.unit} в единице продажи` : " · состав уточняется"}</span>
              <span><VehicleTruckProfile24Regular aria-hidden="true" /> Доставка от поставщика</span>
        </div>
        <div className={styles.cardFooter}>
          <div>
            <span className={styles.priceCaption}>За упаковку / единицу продажи, от</span>
            <strong className={styles.price}>{formatCatalogMoney(offer?.priceMinor, offer?.currency ?? "KZT")}</strong>
            <span className={styles.supplierCaption}>{offer?.normalizedPriceMinor && offer.packaging.unit ? `${formatCatalogMoney(offer.normalizedPriceMinor, offer.currency ?? "KZT")} за 1 ${offer.packaging.unit}` : "Цена за базовую единицу уточняется"}</span>
            {offer ? <span className={styles.supplierCaption}>Цена и фасовка: {offer.supplier.name}</span> : null}
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
  const catalog = useCatalogSearch();
  const { query, setQuery, response, loading, error, request } = catalog;
  const { categoryId, inStockOnly, sort } = request;
  const range = catalogPageRange(request, response?.total ?? 0, response?.items.length ?? 0);

  return (
    <div className={styles.page}>
      <PublicHeader
        active="catalog"
        baseHref="/catalog"
        query={query}
        searching={loading}
        onQueryChange={setQuery}
        onSearch={catalog.search}
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

        <section className={styles.content} aria-label="Каталог товаров" aria-busy={loading}>
          <aside className={styles.filters} aria-label="Фильтры каталога">
            <div className={styles.filterHeading}><Filter24Regular aria-hidden="true" /><strong>Фильтры</strong></div>
            <DmCheckbox
              className={styles.checkRow}
              checked={inStockOnly}
              onChange={(_, data) => catalog.change({ inStockOnly: data.checked === true })}
              label="Только в наличии"
            />
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Категории</span>
              <button type="button" className={!categoryId ? styles.filterOptionActive : styles.filterOption} onClick={() => catalog.change({ categoryId: undefined })}>Все категории</button>
              {response?.facets.categories.slice(0, 8).map((facet) => (
                <button type="button" key={facet.id} className={facet.id === categoryId ? styles.filterOptionActive : styles.filterOption} onClick={() => catalog.change({ categoryId: facet.id })}>
                  <span>{facet.name}</span><small>{facet.count}</small>
                </button>
              ))}
            </div>
            <DmButton type="button" onClick={catalog.reset}>Сбросить всё</DmButton>
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
                <DmSelect value={sort} onChange={(_, data) => catalog.change({ sort: data.value as CatalogSort })}>
                  <option value="RELEVANCE">По релевантности</option>
                  <option value="PRICE_ASC">Сначала дешевле</option>
                  <option value="PRICE_DESC">Сначала дороже</option>
                  <option value="NAME_ASC">По названию</option>
                  <option value="UPDATED_DESC">Недавно обновлённые</option>
                </DmSelect>
              </label>
            </div>

            {loading ? (
              <div className={styles.loadingArea}><LoadingState label="Загружаем предложения поставщиков" /></div>
            ) : error ? (
              <div className={styles.stateArea}><ErrorState description={error} action={<DmButton appearance="primary" type="button" onClick={() => void catalog.retry()}>Повторить загрузку</DmButton>} /></div>
            ) : response?.items.length ? (
              <div className={styles.grid}>
                {response.items.map((product) => <CatalogCard key={product.id} product={product} />)}
              </div>
            ) : (
              <div className={styles.stateArea}><EmptyState title="Ничего не нашли" description="Измените запрос или уберите часть фильтров — мы попробуем подобрать другие предложения." action={<DmButton appearance="primary" type="button" onClick={catalog.reset}>Сбросить фильтры</DmButton>} /></div>
            )}

            {!error && response ? <nav className={styles.pagination} aria-label="Страницы каталога">
              <DmButton type="button" disabled={loading || request.offset === 0} onClick={() => catalog.page(range.previous)}>Предыдущая страница</DmButton>
              <span role="status">{loading ? "Обновляем страницу…" : `${range.first}–${range.last} из ${response.total}${!range.hasNext && response.items.length ? " · Конец списка" : ""}`}</span>
              <DmButton type="button" disabled={loading || !range.hasNext} onClick={() => catalog.page(range.next)}>Следующая страница</DmButton>
            </nav> : null}

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
