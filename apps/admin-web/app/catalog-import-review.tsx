"use client";

import { MarketplaceApiClient, type CatalogImportReview, type CatalogImportReviewQueueResponse } from "@marketplace/api-client";
import {
  DmButton,
  DmDialog,
  DmFeedback,
  DmField,
  DmInput,
  DmSelect,
  DmTextarea,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApiContext } from "./admin-auth";
import {
  canApproveCatalogImport,
  createCatalogImportSlug,
} from "./catalog-workflow-view-model";
import { formatAdminStatus } from "./admin-labels";
import styles from "./catalog-import-review.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

function importedValue(review: CatalogImportReview, key: string) {
  const value = review.source.normalizedData?.[key];
  return value == null || value === "" ? "—" : String(value);
}

function ReviewCard({ review, options, reload }: { review: CatalogImportReview; options: CatalogImportReviewQueueResponse["options"]; reload: (message?: string) => Promise<void> }) {
  const api = useMemo(() => new MarketplaceApiClient(API_URL, adminApiContext()), []);
  const [canonicalName, setCanonicalName] = useState(review.proposed.name);
  const [slug, setSlug] = useState(createCatalogImportSlug(review.proposed.name, review.id));
  const [productType, setProductType] = useState("MATERIAL");
  const [industryId, setIndustryId] = useState(options.industries[0]?.id ?? "");
  const categories = useMemo(
    () => options.categories.filter((category) => category.industryId === industryId),
    [industryId, options.categories],
  );
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [unitId, setUnitId] = useState(options.units[0]?.id ?? "");
  const [packageQuantity, setPackageQuantity] = useState("1");
  const [decisionReason, setDecisionReason] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const publishTriggerRef = useRef<HTMLSpanElement>(null);

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
      changeDialogOpen(false);
      await reload("Предложение опубликовано и доступно в поиске покупателя.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось опубликовать предложение");
    } finally {
      setWorking(false);
    }
  }

  const changeDialogOpen = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      queueMicrotask(() =>
        publishTriggerRef.current?.querySelector("button")?.focus(),
      );
    }
  };

  const published = review.result?.offer.publicationStatus === "PUBLISHED" && review.result.offer.marketplaceVisible;
  const canApprove = canApproveCatalogImport({
    canonicalName,
    slug,
    industryId,
    categoryId,
    unitId,
    packageQuantity,
    decisionReason,
  });
  return (
    <article className={styles.card} data-testid={`import-review-${review.id}`}>
      <header className={styles.cardHeader}>
        <div>
          <h3>{review.proposed.name}</h3>
          <p>{review.supplier.displayName} · {review.source.fileName} · строка {review.source.rowNumber}</p>
        </div>
        <StatusTag tone={published ? "success" : review.status === "APPROVED" ? "info" : "warning"}>
          {published ? "Опубликовано" : review.status === "APPROVED" ? "Готово к публикации" : "Ожидает проверки"}
        </StatusTag>
      </header>

      <dl className={styles.facts}>
        <div><dt>Артикул</dt><dd>{review.proposed.sku ?? "—"}</dd></div>
        <div><dt>Цена</dt><dd>{importedValue(review, "priceMinor")} тиын</dd></div>
        <div><dt>Остаток</dt><dd>{importedValue(review, "quantityOnHand")}</dd></div>
        <div><dt>Проверка строки</dt><dd>{formatAdminStatus(review.source.complianceStatus)}</dd></div>
      </dl>

      {error ? (
        <DmFeedback
          tone="danger"
          title="Решение не сохранено"
          description={error}
          alert
        />
      ) : null}

      {review.status === "PENDING" ? (
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void approve(); }}>
          <DmField label="Каноническое название" required><DmInput value={canonicalName} onChange={(_, data) => setCanonicalName(data.value)} /></DmField>
          <DmField label="Slug" hint="Латиница, цифры и дефисы" required><DmInput value={slug} onChange={(_, data) => setSlug(data.value)} /></DmField>
          <DmField label="Тип товара" required><DmInput value={productType} onChange={(_, data) => setProductType(data.value)} /></DmField>
          <DmField label="Индустрия" required><DmSelect value={industryId} onChange={(_, data) => setIndustryId(data.value)}>{options.industries.map((industry) => <option key={industry.id} value={industry.id}>{industry.name}</option>)}</DmSelect></DmField>
          <DmField label="Категория" required><DmSelect value={categoryId} onChange={(_, data) => setCategoryId(data.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</DmSelect></DmField>
          <DmField label="Единица продажи" required><DmSelect value={unitId} onChange={(_, data) => setUnitId(data.value)}>{options.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}</DmSelect></DmField>
          <DmField label="Количество в упаковке" required><DmInput type="number" min="0.000001" step="any" value={packageQuantity} onChange={(_, data) => setPackageQuantity(data.value)} /></DmField>
          <DmField className={styles.full} label="Причина решения" hint="Минимум 5 символов; запись попадёт в audit trail" required><DmTextarea value={decisionReason} onChange={(_, data) => setDecisionReason(data.value)} resize="vertical" /></DmField>
          <div className={styles.full}><DmButton appearance="primary" type="submit" disabled={working || !canApprove}>{working ? "Сохраняем…" : "Одобрить карточку"}</DmButton></div>
        </form>
      ) : review.result ? (
        <div className={styles.publication}>
          <div>
            <strong>{review.result.product.name}</strong>
            <span>Цена: {review.result.offer.priceMinor ?? "—"} тиын · остаток: {review.result.offer.quantityAvailable ?? "—"}</span>
          </div>
          {review.result.offer.readinessBlockers.length ? (
            <DmFeedback
              tone="warning"
              title="Предложение пока нельзя публиковать"
              description={review.result.offer.readinessBlockers.join("; ")}
            />
          ) : published ? null : (
            <>
              <span ref={publishTriggerRef}>
                <DmButton appearance="primary" onClick={() => changeDialogOpen(true)}>Опубликовать предложение</DmButton>
              </span>
              <DmDialog
                open={dialogOpen}
                onOpenChange={changeDialogOpen}
                title="Опубликовать предложение?"
                description="Карточка станет видна клиникам. Перед публикацией система повторно проверит договор, цену, упаковку, остаток и compliance."
                actions={
                  <>
                    <DmButton appearance="secondary" onClick={() => changeDialogOpen(false)}>Отмена</DmButton>
                    <DmButton appearance="primary" disabled={working} onClick={() => void publish()}>Подтвердить публикацию</DmButton>
                  </>
                }
              >
                <DmFeedback
                  tone="warning"
                  title="Публичное действие"
                  description="После подтверждения предложение сразу появится в поиске клиники."
                />
              </DmDialog>
            </>
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
    if (!message) setNotice("");
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
        <DmButton appearance="outline" onClick={() => { setLoading(true); void load(); }}>Обновить</DmButton>
      </div>
      {notice ? <DmFeedback tone="success" title="Очередь обновлена" description={notice} /> : null}
      {error ? (
        <ErrorState
          title="Очередь импорта недоступна"
          description={error}
          action={<DmButton appearance="secondary" onClick={() => { setLoading(true); void load(); }}>Повторить</DmButton>}
        />
      ) : null}
      {loading ? <LoadingState label="Загружаем очередь импорта" /> : null}
      {!loading && !error && data?.items.length === 0 ? (
        <EmptyState
          title="Очередь пуста"
          description="Новые спорные строки появятся после обработки файла поставщика."
        />
      ) : null}
      <div className={styles.list}>{data?.items.map((review) => <ReviewCard key={`${review.id}-${review.updatedAt}`} review={review} options={data.options} reload={load} />)}</div>
    </section>
  );
}
