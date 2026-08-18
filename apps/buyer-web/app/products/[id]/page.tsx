import { MarketplaceApiClient } from "@marketplace/api-client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import catalog from "../../data/public-catalog-fallback.json";
import mediaCatalog from "../../data/public-catalog-media.json";
import styles from "./page.module.css";
import ProductOfferActions from "./product-offer-actions";

type CatalogProduct = (typeof catalog.products)[number];
type PublicComparison = Awaited<
  ReturnType<MarketplaceApiClient["comparePublicOffers"]>
>;
type DetailProduct = {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  manufacturer: string | null;
  category: string | null;
  sourceUrl: string | null;
  attributes: Array<readonly [string, string]>;
  isAvailable: boolean;
  offers: Array<{
    supplier: { id: string; name: string };
    supplierSku: string | null;
    priceMinor: string | null;
    currency: string;
    packaging?: { name: string };
    available: boolean;
    deliveryMethods: string[];
    verifiedDocuments: boolean;
    officialDistributor: boolean;
  }>;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

function displayAttribute(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  return JSON.stringify(value);
}

function fromFallback(product: CatalogProduct): DetailProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    brand: product.brand,
    manufacturer: product.manufacturer,
    category: product.category,
    sourceUrl: product.sourceUrl,
    attributes: product.attributes.map(([name, value]) => [name, value]),
    isAvailable: product.isAvailable,
    offers: product.offers.map((offer) => ({
      supplier: offer.supplier,
      supplierSku: offer.supplierSku,
      priceMinor: offer.priceMinor,
      currency: offer.currency,
      packaging: offer.packaging,
      available: offer.available,
      deliveryMethods: offer.deliveryMethods,
      verifiedDocuments: offer.verifiedDocuments,
      officialDistributor: offer.officialDistributor,
    })),
  };
}

function fromComparison(comparison: PublicComparison): DetailProduct {
  return {
    id: comparison.product.id,
    name: comparison.product.name,
    description: null,
    brand: comparison.product.brand,
    manufacturer: comparison.product.manufacturer,
    category: null,
    sourceUrl: null,
    attributes: comparison.comparisonAttributes.map((attribute) => [
      attribute.name,
      displayAttribute(attribute.value),
    ]),
    isAvailable: comparison.offers.some((offer) =>
      offer.availability.some(
        ({ quantityAvailable }) => Number(quantityAvailable) > 0,
      ),
    ),
    offers: comparison.offers.map((offer) => ({
      supplier: {
        id: offer.supplier.organizationId,
        name: offer.supplier.name,
      },
      supplierSku: offer.supplierSku,
      priceMinor: offer.price.amountMinor,
      currency: offer.price.currency,
      packaging: { name: offer.packaging.name },
      available: offer.availability.some(
        ({ quantityAvailable }) => Number(quantityAvailable) > 0,
      ),
      deliveryMethods: offer.delivery.map(({ method }) => method),
      verifiedDocuments: offer.markers.verifiedDocuments,
      officialDistributor: offer.markers.officialDistributor,
    })),
  };
}

const getProduct = cache(async (id: string): Promise<DetailProduct | null> => {
  try {
    const api = new MarketplaceApiClient(API_URL, {});
    return fromComparison(await api.comparePublicOffers(id, { quantity: 1 }));
  } catch {
    const fallback = catalog.products.find((item) => item.id === id);
    return fallback ? fromFallback(fallback) : null;
  }
});

function formatPrice(
  minor: number | string | null | undefined,
  currency = "KZT",
) {
  if (minor == null) return "Цена по запросу";
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(decodeURIComponent(id));
  return product
    ? {
        title: `${product.name} | DentMarket`,
        description: product.description,
      }
    : { title: "Карточка товара | DentMarket" };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(decodeURIComponent(id));
  if (!product) notFound();

  const media = product.sourceUrl
    ? mediaCatalog.entries[
        product.sourceUrl as keyof typeof mediaCatalog.entries
      ]
    : undefined;
  const attributes = product.attributes ?? [];

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/">
          ← Вернуться в каталог
        </Link>
        <div className={styles.breadcrumbs}>
          Каталог / {product.category || "Стоматологические товары"}
        </div>
        <section className={styles.hero}>
          <div className={styles.visual}>
            {media?.securePath ? (
              <img
                src={media.securePath}
                alt={media.altText ?? product.name}
                draggable={false}
              />
            ) : (
              <span>
                Фото товара
                <br />
                готовится
              </span>
            )}
          </div>
          <div className={styles.summary}>
            <span className={styles.eyebrow}>
              {product.category || "Стоматологические товары"}
            </span>
            <h1>{product.name}</h1>
            {product.brand ? (
              <p className={styles.brand}>
                {product.brand}
                {product.manufacturer ? ` · ${product.manufacturer}` : ""}
              </p>
            ) : null}
            <p className={styles.description}>
              {product.description ||
                "Карточка товара DentMarket с описанием, характеристиками и предложениями поставщиков."}
            </p>
            <div className={styles.facts}>
              <span>
                <strong>{product.offers.length}</strong>
                <small>предложений</small>
              </span>
              <span>
                <strong>
                  {product.isAvailable ? "В наличии" : "Под заказ"}
                </strong>
                <small>статус товара</small>
              </span>
              <span>
                <strong>{media?.securePath ? "Фото" : "Готовится"}</strong>
                <small>визуал</small>
              </span>
            </div>
            <div className={styles.heroActions}>
              <ProductOfferActions offers={product.offers} />
              <span className={styles.trustNote}>
                Заказ доступен после входа в кабинет клиники
              </span>
            </div>
          </div>
        </section>

        <section className={styles.contentGrid}>
          <div className={styles.panel}>
            <h2>Характеристики</h2>
            {attributes.length ? (
              <dl className={styles.attributes}>
                {attributes.map(([key, value]) => (
                  <div key={`${key}-${value}`}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className={styles.muted}>
                Характеристики будут дополнены после следующей выгрузки
                поставщика.
              </p>
            )}
            {product.sourceUrl ? (
              <a
                className={styles.source}
                href={product.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Открыть источник карточки ↗
              </a>
            ) : null}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.panelKicker}>Коммерческие условия</span>
                <h2>Предложения поставщиков</h2>
              </div>
              <span className={styles.offerCount}>{product.offers.length}</span>
            </div>
            <div className={styles.offers}>
              {product.offers.length ? (
                product.offers.map((offer) => (
                  <article
                    className={styles.offer}
                    key={`${offer.supplier.name}-${offer.supplierSku ?? "offer"}`}
                  >
                    <div>
                      <strong>{offer.supplier.name}</strong>
                      <span>
                        {offer.packaging?.name
                          ? `Фасовка: ${offer.packaging.name}`
                          : "Условия уточняются"}
                      </span>
                    </div>
                    <div className={styles.offerRight}>
                      <strong>
                        {formatPrice(offer.priceMinor, offer.currency)}
                      </strong>
                      <span
                        className={
                          offer.available ? styles.available : styles.onRequest
                        }
                      >
                        {offer.available ? "В наличии" : "Под заказ"}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <p className={styles.muted}>
                  Поставщики ещё не добавили предложение.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
