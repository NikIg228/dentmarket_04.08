"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  DmButton,
  DmFeedback,
  DmField,
  DmInput,
  DmSelect,
  DmTextarea,
  EmptyState,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { formatAdminStatus } from "./admin-labels";
import styles from "./supplier-operations.module.css";
import { adminAuthHeaders } from "./admin-auth";

type Warehouse = { id: string; code: string; name: string };
type DataSource = { id: string; name: string; type: string };
type SupplierProfile = {
  organizationId: string;
  organization: { displayName: string; bin: string };
  warehouses: Warehouse[];
  dataSources: DataSource[];
  _count: { offers: number; importBatches: number };
};
type ImportBatch = {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  createdAt: string;
};
type Product = {
  id: string;
  canonicalName: string;
  variants: Array<{ id: string; sku?: string | null; gtin?: string | null }>;
};
type MatchCandidate = {
  id: string;
  score: string;
  productVariant: {
    id: string;
    sku?: string | null;
    product: { canonicalName: string };
  };
};
type ExternalItem = {
  id: string;
  externalId: string;
  name: string;
  supplierSku?: string | null;
  matchedVariantId?: string | null;
  matchCandidates: MatchCandidate[];
};
type Offer = {
  id: string;
  supplierSku?: string | null;
  status: string;
  version: number;
  productVariant: { id: string; product: { canonicalName: string } };
  publication?: { status: string; marketplaceVisible: boolean } | null;
  prices: Array<{ amountMinor: string; currency: string; status: string }>;
};
type Balance = {
  id: string;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  availabilityStatus: string;
  freshnessStatus: string;
  warehouse: Warehouse;
  productVariant: { id: string; product: { canonicalName: string } };
  lots: Array<{
    id: string;
    lotNumber: string;
    expirationDate?: string | null;
    quantityAvailable: string;
    status: string;
  }>;
  reservations: Array<{ id: string; quantity: string; expiresAt: string }>;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

const demoCsv = `id,name,sku,gtin,price,currency,stock,lot,expires
WEB-001,Демонстрационный стоматологический композит,DEMO-COMP-A2,1234567890123,129000,KZT,24,WEB-LOT-01,2028-06-30`;

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function SupplierOperations() {
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [items, setItems] = useState<ExternalItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "danger" | "info">("info");
  const [busy, setBusy] = useState<string | null>(null);

  const report = useCallback(
    (description: string, tone: "success" | "danger" | "info" = "success") => {
      setMessage(description);
      setMessageTone(tone);
    },
    [],
  );

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
        throw new Error(
          payload?.message ?? `Не удалось выполнить запрос (${response.status})`,
        );
      }
      return response.json() as Promise<T>;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supplierData = await request<SupplierProfile[]>("/suppliers");
      setSuppliers(supplierData);
      const activeSupplierId = supplierId || supplierData[0]?.organizationId;
      if (!activeSupplierId) {
        report("Сначала создайте карточку поставщика.", "info");
        return;
      }
      if (!supplierId) setSupplierId(activeSupplierId);
      const [batchData, itemData, productData, offerData, balanceData] =
        await Promise.all([
          request<ImportBatch[]>(
            `/suppliers/${activeSupplierId}/import-batches`,
          ),
          request<ExternalItem[]>(
            `/suppliers/${activeSupplierId}/external-items`,
          ),
          request<Product[]>("/catalog/products"),
          request<Offer[]>(`/suppliers/${activeSupplierId}/offers`),
          request<Balance[]>(
            `/suppliers/${activeSupplierId}/inventory/balances`,
          ),
        ]);
      setBatches(batchData);
      setItems(itemData);
      setProducts(productData);
      setOffers(offerData);
      setBalances(balanceData);
      setMessage("");
    } catch (error) {
      report(
        error instanceof Error
          ? error.message
          : "Раздел поставщика недоступен.",
        "danger",
      );
    } finally {
      setLoading(false);
    }
  }, [report, request, supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSupplier = suppliers.find(
    ({ organizationId }) => organizationId === supplierId,
  );

  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("warehouse");
    setMessage("");
    try {
      await request(`/suppliers/${supplierId}/warehouses`, {
        method: "POST",
        body: JSON.stringify({
          code: String(data.get("code")).toUpperCase(),
          name: data.get("name"),
          addressLine: String(data.get("addressLine") ?? "") || null,
        }),
      });
      form.reset();
      await load();
      report("Склад поставщика создан.");
    } catch (error) {
      report(
        error instanceof Error ? error.message : "Не удалось создать склад.",
        "danger",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("source");
    setMessage("");
    try {
      await request(`/suppliers/${supplierId}/data-sources`, {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          type: data.get("type"),
        }),
      });
      form.reset();
      await load();
      report("Способ загрузки добавлен.");
    } catch (error) {
      report(
        error instanceof Error ? error.message : "Не удалось добавить способ загрузки.",
        "danger",
      );
    } finally {
      setBusy(null);
    }
  }

  async function uploadCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("upload");
    setMessage("");
    try {
      const batch = await request<ImportBatch>(
        `/suppliers/${supplierId}/import-batches`,
        {
          method: "POST",
          body: JSON.stringify({
            sourceId: data.get("sourceId"),
            fileName: data.get("fileName"),
            fileType: "CSV",
            contentBase64: base64Utf8(String(data.get("csv"))),
            columnMapping: {
              externalId: "id",
              name: "name",
              supplierSku: "sku",
              gtin: "gtin",
              priceMinor: "price",
              currency: "currency",
              quantityOnHand: "stock",
              lotNumber: "lot",
              expirationDate: "expires",
            },
          }),
        },
      );
      await request(
        `/suppliers/${supplierId}/import-batches/${batch.id}/process`,
        { method: "POST" },
      );
      await load();
      report("Файл загружен. Товары проверены по каталогу.");
    } catch (error) {
      report(
        error instanceof Error ? error.message : "Не удалось загрузить файл.",
        "danger",
      );
    } finally {
      setBusy(null);
    }
  }

  async function confirmMatch(item: ExternalItem, variantId: string) {
    setBusy(`match:${item.id}`);
    setMessage("");
    try {
      await request(
        `/suppliers/${supplierId}/external-items/${item.id}/match`,
        {
          method: "POST",
          body: JSON.stringify({ productVariantId: variantId }),
        },
      );
      await load();
      report(
        `Товар ${item.externalId} связан с карточкой каталога.`,
      );
    } catch (error) {
      report(
        error instanceof Error ? error.message : "Не удалось подтвердить товар.",
        "danger",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("offer");
    setMessage("");
    try {
      await request(`/suppliers/${supplierId}/offers`, {
        method: "POST",
        body: JSON.stringify({
          productVariantId: data.get("productVariantId"),
          sourceId: String(data.get("sourceId") ?? "") || null,
          supplierSku: String(data.get("supplierSku") ?? "") || null,
          sourceType: "IMPORT",
        }),
      });
      form.reset();
      await load();
      report("Черновик предложения создан.");
    } catch (error) {
      report(error instanceof Error ? error.message : "Предложение не создано.", "danger");
    } finally {
      setBusy(null);
    }
  }

  async function activateOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const offer = offers.find(({ id }) => id === data.get("offerId"));
    if (!offer) return;
    setBusy("publish");
    setMessage("");
    try {
      await request(`/suppliers/${supplierId}/offers/${offer.id}/price`, {
        method: "PUT",
        body: JSON.stringify({
          amountMinor: Number(data.get("amountMinor")),
          currency: "KZT",
          includesVat: true,
          vatRate: 12,
          source: "MANUAL",
          reason: "Обновление из admin-web",
        }),
      });
      await request(`/suppliers/${supplierId}/inventory/balances`, {
        method: "PUT",
        body: JSON.stringify({
          warehouseId: data.get("warehouseId"),
          productVariantId: offer.productVariant.id,
          offerId: offer.id,
          quantityOnHand: Number(data.get("quantityOnHand")),
          safetyStock: Number(data.get("safetyStock") || 0),
          source: "MANUAL",
        }),
      });
      await request(`/suppliers/${supplierId}/offers/${offer.id}/publication`, {
        method: "PUT",
        body: JSON.stringify({ status: "PUBLISHED", marketplaceVisible: true }),
      });
      await load();
      report(
        "Цена и остаток обновлены. Предложение опубликовано.",
      );
    } catch (error) {
      report(
        error instanceof Error ? error.message : "Предложение не опубликовано.",
        "danger",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("lot");
    setMessage("");
    try {
      await request(`/suppliers/${supplierId}/inventory/lots`, {
        method: "POST",
        body: JSON.stringify({
          inventoryBalanceId: data.get("balanceId"),
          lotNumber: data.get("lotNumber"),
          expirationDate: data.get("expirationDate"),
          quantityOnHand: Number(data.get("quantityOnHand")),
          status: "ACTIVE",
        }),
      });
      form.reset();
      await load();
      report("Партия добавлена. Товары с ближайшим сроком годности будут отгружаться первыми.");
    } catch (error) {
      report(error instanceof Error ? error.message : "Партия не создана.", "danger");
    } finally {
      setBusy(null);
    }
  }

  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("reserve");
    setMessage("");
    try {
      await request(
        `/suppliers/${supplierId}/inventory/balances/${data.get("balanceId")}/reservations`,
        {
          method: "POST",
          body: JSON.stringify({
            quantity: Number(data.get("quantity")),
            idempotencyKey: data.get("idempotencyKey"),
            ttlMinutes: 30,
            referenceType: "ADMIN_SMOKE",
          }),
        },
      );
      await load();
      report("Резерв создан. Повторный запрос не изменит количество дважды.");
    } catch (error) {
      report(error instanceof Error ? error.message : "Резерв не создан.", "danger");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      id="supplier-data"
      className={styles.section}
      aria-label="Товары поставщика"
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>ITERATION 1B / SUPPLIER DATA</span>
          <h2>От прайса до доступного остатка</h2>
          <p>
            Сквозной путь сохраняет исходную строку и разделяет коммерческие
            состояния.
          </p>
        </div>
        <div className={styles.actions}>
          <DmSelect
            aria-label="Активный поставщик"
            value={supplierId}
            onChange={(_, data) => setSupplierId(data.value)}
            disabled={loading || Boolean(busy)}
          >
            {suppliers.map((supplier) => (
              <option
                key={supplier.organizationId}
                value={supplier.organizationId}
              >
                {supplier.organization.displayName}
              </option>
            ))}
          </DmSelect>
          <DmButton
            appearance="secondary"
            onClick={() => void load()}
            disabled={loading || Boolean(busy)}
          >
            Обновить
          </DmButton>
        </div>
      </div>
      {message ? (
        <DmFeedback
          tone={messageTone}
          title={
            messageTone === "danger"
              ? "Операция не выполнена"
              : messageTone === "success"
                ? "Операция выполнена"
                : "Нужна настройка"
          }
          description={message}
          alert={messageTone === "danger"}
        />
      ) : null}
      {loading ? (
        <LoadingState label="Загружаем данные поставщика" />
      ) : !activeSupplier ? (
        <EmptyState
          title="Поставщик не найден"
          description="Создайте или выберите поставщика, чтобы настроить загрузку, предложения и остатки."
        />
      ) : (
        <div className={styles.grid}>
          <article className={styles.panel}>
            <header>
              <span>01</span>
              <div>
                <h3>Поставщик и загрузка товаров</h3>
                <p>
                  {activeSupplier.organization.displayName} · БИН{" "}
                  {activeSupplier.organization.bin}
                </p>
              </div>
            </header>
            <div className={styles.stats}>
              <b>
                {activeSupplier.warehouses.length}
                <small>складов</small>
              </b>
              <b>
                {activeSupplier.dataSources.length}
                <small>способов загрузки</small>
              </b>
              <b>
                {activeSupplier._count.importBatches}
                <small>загрузок</small>
              </b>
            </div>
            <form className={styles.form} onSubmit={createWarehouse}>
              <DmField label="Код склада" required>
                <DmInput name="code" required placeholder="AST-02" />
              </DmField>
              <DmField label="Название" required>
                <DmInput name="name" required placeholder="Склад Астана" />
              </DmField>
              <DmField className={styles.wide} label="Адрес">
                <DmInput name="addressLine" placeholder="ул. ..." />
              </DmField>
              <DmButton type="submit" appearance="secondary" disabled={Boolean(busy)}>
                {busy === "warehouse" ? "Добавляем…" : "Добавить склад"}
              </DmButton>
            </form>
            <form className={styles.form} onSubmit={createSource}>
              <DmField label="Название" required>
                <DmInput name="name" required placeholder="Прайс отдела продаж" />
              </DmField>
              <DmField label="Тип" required>
                <DmSelect name="type" defaultValue="CSV" required>
                  <option value="CSV">CSV</option>
                  <option value="EXCEL">Excel</option>
                  <option value="MANUAL">Ручной ввод</option>
                  <option value="API">Прямое подключение</option>
                  <option value="ERP">1С</option>
                </DmSelect>
              </DmField>
              <DmButton type="submit" appearance="secondary" disabled={Boolean(busy)}>
                {busy === "source" ? "Добавляем…" : "Добавить способ"}
              </DmButton>
            </form>
          </article>

          <article className={styles.panel}>
            <header>
              <span>02</span>
              <div>
                <h3>Загрузка и проверка товаров</h3>
                <p>Загрузите файл и свяжите товары с карточками каталога.</p>
              </div>
            </header>
            <form className={styles.form} onSubmit={uploadCsv}>
              <DmField label="Способ загрузки" required>
                <DmSelect name="sourceId" required>
                  <option value="">Выберите</option>
                  {activeSupplier.dataSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmField label="Имя файла" required>
                <DmInput name="fileName" defaultValue="web-price.csv" required />
              </DmField>
              <DmField
                className={styles.wide}
                label="Данные CSV"
                hint="Первая строка должна содержать названия колонок. Исходный файл сохраняется для аудита."
                required
              >
                <DmTextarea name="csv" rows={5} defaultValue={demoCsv} required />
              </DmField>
              <DmButton type="submit" appearance="primary" disabled={Boolean(busy)}>
                {busy === "upload" ? "Обрабатываем…" : "Загрузить и обработать"}
              </DmButton>
            </form>
            <div className={styles.records}>
              {batches.slice(0, 3).map((batch) => (
                <div className={styles.record} key={batch.id}>
                  <div>
                    <strong>{batch.fileName}</strong>
                    <small>
                      {formatAdminStatus(batch.status)}. {batch.processedRows}/{batch.totalRows}.
                      ошибок {batch.errorRows}
                    </small>
                  </div>
                  <time>
                    {new Date(batch.createdAt).toLocaleDateString("ru-KZ")}
                  </time>
                </div>
              ))}
            </div>
            <div className={styles.matches}>
              {items.slice(0, 4).map((item) => {
                const candidate = item.matchCandidates[0];
                return (
                  <div className={styles.match} key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.externalId} ·{" "}
                        {item.matchedVariantId
                          ? "Найден в каталоге"
                          : candidate
                            ? `Похож на ${candidate.productVariant.product.canonicalName}`
                            : "Совпадений нет"}
                      </small>
                    </div>
                    {!item.matchedVariantId && candidate && (
                      <DmButton
                        appearance="secondary"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void confirmMatch(item, candidate.productVariant.id)
                        }
                      >
                        {busy === `match:${item.id}` ? "Подтверждаем…" : "Подтвердить"}
                      </DmButton>
                    )}
                  </div>
                );
              })}
            </div>
          </article>

          <article className={styles.panel}>
            <header>
              <span>03</span>
              <div>
                <h3>Предложение, цена и публикация</h3>
                <p>Укажите товар, цену и условия продажи.</p>
              </div>
            </header>
            <form className={styles.form} onSubmit={createOffer}>
              <DmField className={styles.wide} label="Вариант товара" required>
                <DmSelect name="productVariantId" required>
                  <option value="">Выберите</option>
                  {products.flatMap((product) =>
                    product.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {product.canonicalName} · {variant.sku ?? "без SKU"}
                      </option>
                    )),
                  )}
                </DmSelect>
              </DmField>
              <DmField label="Способ загрузки">
                <DmSelect name="sourceId">
                  <option value="">Ручной</option>
                  {activeSupplier.dataSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmField label="SKU поставщика">
                <DmInput name="supplierSku" />
              </DmField>
              <DmButton type="submit" appearance="primary" disabled={Boolean(busy)}>
                {busy === "offer" ? "Создаём…" : "Создать предложение"}
              </DmButton>
            </form>
            <form className={styles.form} onSubmit={activateOffer}>
              <DmField className={styles.wide} label="Предложение" required>
                <DmSelect name="offerId" required>
                  <option value="">Выберите</option>
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.productVariant.product.canonicalName}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmField label="Цена, тиын" required>
                <DmInput
                  name="amountMinor"
                  type="number"
                  min="0"
                  defaultValue="129000"
                  required
                />
              </DmField>
              <DmField label="Фактический остаток" required>
                <DmInput
                  name="quantityOnHand"
                  type="number"
                  min="0"
                  defaultValue="24"
                  required
                />
              </DmField>
              <DmField label="Страховой запас">
                <DmInput
                  name="safetyStock"
                  type="number"
                  min="0"
                  defaultValue="2"
                />
              </DmField>
              <DmField label="Склад" required>
                <DmSelect name="warehouseId" required>
                  <option value="">Выберите</option>
                  {activeSupplier.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmButton type="submit" appearance="primary" disabled={Boolean(busy)}>
                {busy === "publish" ? "Публикуем…" : "Обновить и опубликовать"}
              </DmButton>
            </form>
            <div className={styles.records}>
              {offers.slice(0, 5).map((offer) => (
                <div className={styles.record} key={offer.id}>
                  <div>
                    <strong>
                      {offer.productVariant.product.canonicalName}
                    </strong>
                    <small>
                      {formatAdminStatus(offer.status)}. {formatAdminStatus(offer.publication?.status ?? "DRAFT")}.
                      v{offer.version}
                    </small>
                  </div>
                  <StatusTag tone={offer.publication?.marketplaceVisible ? "success" : "neutral"}>
                    {offer.prices.find(({ status }) => status === "ACTIVE")
                      ?.amountMinor ?? "Нет цены"}{" "}
                    тиын
                  </StatusTag>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <header>
              <span>04</span>
              <div>
                <h3>Партии и резервы</h3>
                <p>Сроки годности, актуальность данных и доступность по складам.</p>
              </div>
            </header>
            <form className={styles.form} onSubmit={createLot}>
              <DmField className={styles.wide} label="Остаток" required>
                <DmSelect name="balanceId" required>
                  <option value="">Выберите</option>
                  {balances.map((balance) => (
                    <option key={balance.id} value={balance.id}>
                      {balance.productVariant.product.canonicalName} · доступно{" "}
                      {balance.quantityAvailable}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmField label="Номер партии" required>
                <DmInput name="lotNumber" required placeholder="LOT-2026-001" />
              </DmField>
              <DmField label="Годен до" required>
                <DmInput name="expirationDate" type="date" required />
              </DmField>
              <DmField label="Количество" required>
                <DmInput name="quantityOnHand" type="number" min="0" required />
              </DmField>
              <DmButton type="submit" appearance="secondary" disabled={Boolean(busy)}>
                {busy === "lot" ? "Добавляем…" : "Добавить партию"}
              </DmButton>
            </form>
            <form className={styles.form} onSubmit={reserve}>
              <DmField label="Остаток" required>
                <DmSelect name="balanceId" required>
                  <option value="">Выберите</option>
                  {balances.map((balance) => (
                    <option key={balance.id} value={balance.id}>
                      {balance.warehouse.code} · {balance.quantityAvailable}
                    </option>
                  ))}
                </DmSelect>
              </DmField>
              <DmField label="Количество" required>
                <DmInput
                  name="quantity"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  required
                />
              </DmField>
              <DmField
                className={styles.wide}
                label="Ключ идемпотентности"
                hint="Повтор запроса с тем же ключом не уменьшит остаток второй раз."
                required
              >
                <DmInput
                  name="idempotencyKey"
                  minLength={8}
                  required
                  placeholder="checkout-demo-001"
                />
              </DmField>
              <DmButton type="submit" appearance="primary" disabled={Boolean(busy)}>
                {busy === "reserve" ? "Резервируем…" : "Зарезервировать"}
              </DmButton>
            </form>
            <div className={styles.records}>
              {balances.slice(0, 5).map((balance) => (
                <div className={styles.record} key={balance.id}>
                  <div>
                    <strong>
                      {balance.productVariant.product.canonicalName}
                    </strong>
                    <small>
                      {balance.warehouse.name}. {formatAdminStatus(balance.freshnessStatus)}.
                      lots {balance.lots.length}
                    </small>
                  </div>
                  <StatusTag tone={balance.freshnessStatus === "FRESH" ? "success" : "warning"}>
                    {balance.quantityAvailable} из {balance.quantityOnHand}
                  </StatusTag>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
