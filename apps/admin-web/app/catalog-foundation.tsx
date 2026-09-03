"use client";

import { Add20Regular, ArrowClockwise20Regular } from "@fluentui/react-icons";
import {
  DmButton,
  DmFeedback,
  DmField,
  DmInput,
  DmSelect,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatAdminStatus } from "./admin-labels";
import { adminAuthHeaders } from "./admin-auth";
import styles from "./catalog-foundation.module.css";

type Industry = { id: string; nameRu: string };
type Category = { id: string; industryId: string; nameRu: string };
type Unit = { id: string; nameRu: string; symbol: string };
type Product = {
  id: string;
  canonicalName: string;
  status: string;
  version: number;
  variants: Array<{ id: string; sku?: string | null }>;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const productStatuses = ["DRAFT", "UNDER_REVIEW", "ACTIVE", "BLOCKED", "ARCHIVED"];

function optionalNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized === "" ? undefined : Number(normalized);
}

export function CatalogFoundation() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    description: string;
  } | null>(null);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        cache: "no-store",
        headers: { ...adminAuthHeaders(), ...init?.headers },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? `API вернул статус ${response.status}`);
      }
      return response.json() as Promise<T>;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [industryData, categoryData, unitData, productData] =
        await Promise.all([
          request<Industry[]>("/catalog/industries"),
          request<Category[]>("/catalog/categories"),
          request<Unit[]>("/catalog/units"),
          request<Product[]>("/catalog/products"),
        ]);
      setIndustries(industryData);
      setCategories(categoryData);
      setUnits(unitData);
      setProducts(productData);
      setHasLoaded(true);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить управление каталогом",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    action: () => Promise<unknown>,
    success: string,
    form?: HTMLFormElement,
  ) {
    setWorking(true);
    setFeedback(null);
    try {
      await action();
      form?.reset();
      await load();
      setFeedback({ tone: "success", description: success });
    } catch (error) {
      setFeedback({
        tone: "danger",
        description:
          error instanceof Error ? error.message : "Операция не выполнена",
      });
    } finally {
      setWorking(false);
    }
  }

  function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    return act(
      () =>
        request("/catalog/products", {
          method: "POST",
          body: JSON.stringify({
            canonicalName: data.get("canonicalName"),
            slug: data.get("slug"),
            productType: data.get("productType"),
            industryIds: [data.get("industryId")],
            categoryIds: [data.get("categoryId")],
          }),
        }),
      "Мастер-карточка создана в статусе «Черновик».",
      form,
    );
  }

  function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const product = products.find(({ id }) => id === data.get("productId"));
    if (!product) return;
    return act(
      () =>
        request(`/catalog/products/${product.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            version: product.version,
            status: data.get("status"),
          }),
        }),
      `Статус обновлён, версия карточки: ${product.version + 1}.`,
    );
  }

  function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    return act(
      () =>
        request(`/catalog/products/${data.get("productId")}/variants`, {
          method: "POST",
          body: JSON.stringify({
            sku: String(data.get("sku") ?? "").trim() || null,
            saleUnitId: String(data.get("saleUnitId") ?? "").trim() || null,
            packageQuantity: optionalNumber(data.get("packageQuantity")) ?? null,
          }),
        }),
      "Торговый вариант добавлен к мастер-карточке.",
      form,
    );
  }

  return (
    <section id="catalog-foundation" className={styles.section} aria-labelledby="catalog-foundation-title">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Единый каталог</span>
          <h2 id="catalog-foundation-title">Мастер-карточки и варианты</h2>
          <p>Создание и версионное управление canonical-данными DentMarket.</p>
        </div>
        <DmButton appearance="secondary" icon={<ArrowClockwise20Regular />} onClick={() => void load()} disabled={loading || working}>
          {loading ? "Обновляем…" : "Обновить"}
        </DmButton>
      </div>

      {feedback ? (
        <DmFeedback tone={feedback.tone} title={feedback.tone === "success" ? "Каталог обновлён" : "Действие не выполнено"} description={feedback.description} alert={feedback.tone === "danger"} />
      ) : null}
      {loadError && hasLoaded ? <DmFeedback tone="danger" title="Не удалось обновить каталог" description={loadError} alert /> : null}

      {loading && !hasLoaded ? (
        <LoadingState label="Загружаем данные каталога" />
      ) : loadError && !hasLoaded ? (
        <ErrorState title="Управление каталогом недоступно" description={loadError} action={<DmButton appearance="secondary" onClick={() => void load()}>Повторить</DmButton>} />
      ) : (
        <div className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelTitle}>
              <span>01</span>
              <div><h3>Мастер-карточка</h3><p>Классификация обязательна до отправки на публикацию.</p></div>
            </div>
            <form className={styles.form} onSubmit={(event) => void createProduct(event)}>
              <DmField className={styles.wide} label="Наименование" required>
                <DmInput name="canonicalName" required placeholder="Композитный материал светового отверждения" />
              </DmField>
              <DmField label="Slug" required hint="Латиница, цифры и дефисы">
                <DmInput name="slug" required pattern="[a-z0-9][a-z0-9-]{2,159}" placeholder="light-cure-composite" />
              </DmField>
              <DmField label="Тип товара" required><DmInput name="productType" required defaultValue="material" /></DmField>
              <DmField label="Индустрия" required>
                <DmSelect name="industryId" required><option value="">Выберите</option>{industries.map((item) => <option key={item.id} value={item.id}>{item.nameRu}</option>)}</DmSelect>
              </DmField>
              <DmField label="Категория" required>
                <DmSelect name="categoryId" required><option value="">Выберите</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.nameRu}</option>)}</DmSelect>
              </DmField>
              <DmButton className={styles.wide} type="submit" appearance="primary" icon={<Add20Regular />} disabled={working}>{working ? "Сохраняем…" : "Создать карточку"}</DmButton>
            </form>
            <form className={styles.form} onSubmit={(event) => void updateProduct(event)}>
              <DmField label="Карточка" required>
                <DmSelect name="productId" required><option value="">Выберите</option>{products.map((item) => <option key={item.id} value={item.id}>{item.canonicalName} · v{item.version}</option>)}</DmSelect>
              </DmField>
              <DmField label="Новый статус" required>
                <DmSelect name="status" defaultValue="UNDER_REVIEW">{productStatuses.map((status) => <option key={status} value={status}>{formatAdminStatus(status)}</option>)}</DmSelect>
              </DmField>
              <DmButton className={styles.wide} type="submit" appearance="secondary" disabled={working || products.length === 0}>Обновить по версии</DmButton>
            </form>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelTitle}>
              <span>02</span>
              <div><h3>Торговый вариант</h3><p>SKU, единица продажи и количество в упаковке.</p></div>
            </div>
            <form className={styles.form} onSubmit={(event) => void createVariant(event)}>
              <DmField className={styles.wide} label="Мастер-карточка" required>
                <DmSelect name="productId" required><option value="">Выберите</option>{products.map((item) => <option key={item.id} value={item.id}>{item.canonicalName}</option>)}</DmSelect>
              </DmField>
              <DmField label="SKU"><DmInput name="sku" placeholder="DENT-COMP-A2-4G" /></DmField>
              <DmField label="Единица продажи">
                <DmSelect name="saleUnitId"><option value="">Не задана</option>{units.map((item) => <option key={item.id} value={item.id}>{item.nameRu} ({item.symbol})</option>)}</DmSelect>
              </DmField>
              <DmField label="Количество в упаковке"><DmInput name="packageQuantity" type="number" min="0.000001" step="0.000001" placeholder="1" /></DmField>
              <DmButton type="submit" appearance="primary" icon={<Add20Regular />} disabled={working || products.length === 0}>{working ? "Добавляем…" : "Добавить вариант"}</DmButton>
            </form>
            {products.length ? (
              <div className={styles.records} aria-label="Карточки каталога">
                {products.slice(0, 8).map((product) => (
                  <div className={styles.record} key={product.id}>
                    <div><strong>{product.canonicalName}</strong><span>Версия {product.version} · {product.variants.length} SKU</span></div>
                    <StatusTag tone={product.status === "ACTIVE" ? "success" : product.status === "BLOCKED" ? "danger" : "neutral"}>{formatAdminStatus(product.status)}</StatusTag>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="Карточек пока нет" description="Создайте первую мастер-карточку, затем добавьте торговый вариант." />}
          </article>
        </div>
      )}
    </section>
  );
}
