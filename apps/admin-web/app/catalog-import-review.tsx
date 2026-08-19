"use client";

import { MarketplaceApiClient, type CatalogImportReview, type CatalogImportReviewQueueResponse } from "@marketplace/api-client";
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Textarea,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApiContext } from "./admin-auth";
import styles from "./catalog-import-review.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

function slugify(value: string) {
  return value.toLocaleLowerCase("ru").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `import-${Date.now()}`;
}

function importedValue(review: CatalogImportReview, key: string) {
  const value = review.source.normalizedData?.[key];
  return value == null || value === "" ? "—" : String(value);
}

function ReviewCard({ review, options, reload }: { review: CatalogImportReview; options: CatalogImportReviewQueueResponse["options"]; reload: (message?: string) => Promise<void> }) {
  const api = useMemo(() => new MarketplaceApiClient(API_URL, adminApiContext()), []);
  const [canonicalName, setCanonicalName] = useState(review.proposed.name);
  const [slug, setSlug] = useState(slugify(review.proposed.name));
  const [productType, setProductType] = useState("MATERIAL");
  const [industryId, setIndustryId] = useState(options.industries[0]?.id ?? "");
  const categories = options.categories.filter((category) => category.industryId === industryId);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [unitId, setUnitId] = useState(options.units[0]?.id ?? "");
  const [packageQuantity, setPackageQuantity] = useState("1");
  const [decisionReason, setDecisionReason] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const first = options.categories.find((category) => category.industryId === industryId);
    if (!categories.some((category) => category.id === categoryId)) setCategoryId(first?.id ?? "");
  }, [categories, categoryId, industryId, options.categories]);

  async function approve() {
    setError("");
    setWorking(true);
    try {
      await api.approveCatalogImportCandidate(review.id, {
        canonicalName,
        slug,
        productType,
        industryIds: [industryId],
        categoryIds: [categoryId],
        saleUnitId: unitId,
        packageQuantity: Number(packageQuantity),
        decisionReason,
      });
      await reload("Строка импорта одобрена. Предложение готово к проверке публикации.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось одобрить строку импорта");
    } finally {
      setWorking(false);
    }
  }

  async function publish() {
    if (!review.result) return;
    setError("");
    setWorking(true);
    try {
      await api.setSupplierOfferPublication(review.supplier.organizationId, review.result.offer.id, {
        status: "PUBLISHED",
        marketplaceVisible: true,
        expectedVersion: review.result.offer.version,
        decisionReason: "Оператор подтвердил карточку, цену, остаток и готовность поставщика",
      });
      setDialogOpen(false);
      await reload("Предложение опубликовано и доступно в поиске покупателя.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось опубликовать предложение");
    } finally {
      setWorking(false);
    }
  }

  const published = review.result?.offer.publicationStatus === "PUBLISHED" && review.result.offer.marketplaceVisible;
  return (
    <article className={styles.card} data-testid={`import-review-${review.id}`}>
      <header className={styles.cardHeader}>
        <div>
          <h3>{review.proposed.name}</h3>
          <p>{review.supplier.displayName} · {review.source.fileName} · строка {review.source.rowNumber}</p>
        </div>
        <Badge appearance="tint" color={published ? "success" : review.status === "APPROVED" ? "informative" : "warning"}>
          {published ? "Опубликовано" : review.status === "APPROVED" ? "Готово к публикации" : "Ожидает проверки"}
        </Badge>
      </header>

      <dl className={styles.facts}>
        <div><dt>Артикул</dt><dd>{review.proposed.sku ?? "—"}</dd></div>
        <div><dt>Цена</dt><dd>{importedValue(review, "priceMinor")} тиын</dd></div>
        <div><dt>Остаток</dt><dd>{importedValue(review, "quantityOnHand")}</dd></div>
        <div><dt>Проверка строки</dt><dd>{review.source.complianceStatus}</dd></div>
      </dl>

      {error ? <MessageBar className={styles.message} intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}

      {review.status === "PENDING" ? (
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void approve(); }}>
          <Field label="Каноническое название" required><Input value={canonicalName} onChange={(_, data) => setCanonicalName(data.value)} /></Field>
          <Field label="Slug" required><Input value={slug} onChange={(_, data) => setSlug(data.value)} /></Field>
          <Field label="Тип товара" required><Input value={productType} onChange={(_, data) => setProductType(data.value)} /></Field>
          <Field label="Индустрия" required><Select value={industryId} onChange={(_, data) => setIndustryId(data.value)}>{options.industries.map((industry) => <option key={industry.id} value={industry.id}>{industry.name}</option>)}</Select></Field>
          <Field label="Категория" required><Select value={categoryId} onChange={(_, data) => setCategoryId(data.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
          <Field label="Единица продажи" required><Select value={unitId} onChange={(_, data) => setUnitId(data.value)}>{options.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}</Select></Field>
          <Field label="Количество в упаковке" required><Input type="number" min="0.000001" step="any" value={packageQuantity} onChange={(_, data) => setPackageQuantity(data.value)} /></Field>
          <Field className={styles.full} label="Причина решения" required><Textarea value={decisionReason} onChange={(_, data) => setDecisionReason(data.value)} resize="vertical" /></Field>
          <div className={styles.full}><Button appearance="primary" type="submit" disabled={working || !canonicalName || !slug || !industryId || !categoryId || !unitId || decisionReason.trim().length < 5}>{working ? "Сохраняем…" : "Одобрить карточку"}</Button></div>
        </form>
      ) : review.result ? (
        <div className={styles.publication}>
          <div>
            <strong>{review.result.product.name}</strong>
            <span>Цена: {review.result.offer.priceMinor ?? "—"} тиын · остаток: {review.result.offer.quantityAvailable ?? "—"}</span>
          </div>
          {review.result.offer.readinessBlockers.length ? (
            <MessageBar className={styles.message} intent="warning"><MessageBarBody>Нельзя публиковать: {review.result.offer.readinessBlockers.join("; ")}</MessageBarBody></MessageBar>
          ) : published ? null : (
            <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
              <Button appearance="primary" onClick={() => setDialogOpen(true)}>Опубликовать предложение</Button>
              <DialogSurface>
                <DialogBody>
                  <DialogTitle>Опубликовать предложение?</DialogTitle>
                  <DialogContent>Карточка станет видна клиникам. Перед публикацией система повторно проверит договор, цену, упаковку, остаток и compliance.</DialogContent>
                  <DialogActions>
                    <Button appearance="secondary" onClick={() => setDialogOpen(false)}>Отмена</Button>
                    <Button appearance="primary" disabled={working} onClick={() => void publish()}>Подтвердить публикацию</Button>
                  </DialogActions>
                </DialogBody>
              </DialogSurface>
            </Dialog>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function CatalogImportReviewQueue() {
  const api = useMemo(() => new MarketplaceApiClient(API_URL, adminApiContext()), []);
  const [data, setData] = useState<CatalogImportReviewQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (message?: string) => {
    setError("");
    try {
      setData(await api.listCatalogImportReviews());
      if (message) setNotice(message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить очередь импорта");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className={styles.section} aria-labelledby="catalog-import-review-title">
      <div className={styles.heading}>
        <div>
          <h2 id="catalog-import-review-title">Проверка импорта перед публикацией</h2>
          <p>Сопоставьте строку поставщика с каноническим каталогом. До явного подтверждения предложение не появится у клиник.</p>
        </div>
        <Button appearance="outline" onClick={() => { setLoading(true); void load(); }}>Обновить</Button>
      </div>
      {notice ? <MessageBar className={styles.message} intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar> : null}
      {error ? <MessageBar className={styles.message} intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
      {loading ? <div className={styles.state}><Spinner label="Загружаем очередь импорта" /></div> : null}
      {!loading && data?.items.length === 0 ? <div className={styles.state}><strong>Очередь пуста</strong><span>Новые спорные строки появятся после обработки CSV поставщика.</span></div> : null}
      <div className={styles.list}>{data?.items.map((review) => <ReviewCard key={`${review.id}-${review.updatedAt}`} review={review} options={data.options} reload={load} />)}</div>
    </section>
  );
}
