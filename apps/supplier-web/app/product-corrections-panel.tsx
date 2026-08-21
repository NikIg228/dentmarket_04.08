"use client";

import type { MarketplaceApiClient } from "@marketplace/api-client";
import {
  DmButton,
  DmField,
  DmInput,
  DmSelect,
  DmTextarea,
  EmptyState,
  LoadingState,
  Section,
  StatusTag,
  formatDate,
} from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canSubmitProductCorrection } from "./product-corrections-validation";
import styles from "./product-corrections-panel.module.css";

type Product = {
  id: string;
  canonicalName: string;
  description: string | null;
  manufacturerSku: string | null;
  gtin: string | null;
  productType: string;
  regulatoryClass: string | null;
};

type Offer = { id: string; productVariant: { product: Product } };
type Correction = {
  id: string;
  field: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";
  moderatorComment: string | null;
  appliedValue: string | null;
  createdAt: string;
  supplierOrganizationId: string;
  product: { canonicalName: string };
};

const fields = [
  ["CANONICAL_NAME", "Название"],
  ["DESCRIPTION", "Описание"],
  ["MANUFACTURER_SKU", "Артикул производителя"],
  ["GTIN", "GTIN"],
  ["PRODUCT_TYPE", "Тип товара"],
  ["REGULATORY_CLASS", "Регуляторный класс"],
] as const;

const fieldLabel = (field: string) => fields.find(([value]) => value === field)?.[1] ?? field;
const statusLabel: Record<Correction["status"], string> = {
  PENDING: "Проверяем",
  APPROVED: "Принято",
  PARTIALLY_APPROVED: "Принято с редактурой",
  REJECTED: "Отклонено",
};

export function ProductCorrectionsPanel({ api, offers, supplierId }: { api: MarketplaceApiClient; offers: Offer[]; supplierId: string }) {
  const products = useMemo(() => [...new Map(offers.map((offer) => [offer.productVariant.product.id, offer.productVariant.product])).values()], [offers]);
  const [productId, setProductId] = useState("");
  const [field, setField] = useState<(typeof fields)[number][0]>("DESCRIPTION");
  const [proposedValue, setProposedValue] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [items, setItems] = useState<Correction[]>([]);
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => { if (!productId && products[0]) setProductId(products[0].id); }, [productId, products]);

  const load = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await api.get<Correction[]>("/moderation/product-corrections");
      setItems(data.filter((item) => item.supplierOrganizationId === supplierId));
    } catch {
      setHistoryError("Не удалось загрузить историю исправлений. Повторите попытку.");
    } finally {
      setHistoryLoading(false);
    }
  }, [api, supplierId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await api.post("/moderation/product-corrections", {
        productId,
        field,
        proposedValue: proposedValue.trim(),
        reason: reason.trim(),
        evidenceUrl: evidenceUrl.trim() || undefined,
      });
      setProposedValue("");
      setReason("");
      setEvidenceUrl("");
      setFeedback({ tone: "success", text: "Исправление отправлено на проверку." });
      await load();
    } catch {
      setFeedback({
        tone: "error",
        text: "Не удалось отправить исправление. Проверьте данные и повторите попытку.",
      });
    }
    finally { setBusy(false); }
  };

  return <Section title="Исправления карточек" description="Нашли ошибку? Предложите исправление и приложите подтверждение.">
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {!products.length ? <EmptyState title="Нет доступных карточек" description="Здесь появятся товары поставщика, для которых можно предложить исправление." /> : null}
        {products.length ? <>
        <DmField label="Товар" required>
          <DmSelect value={productId} onChange={(_, data) => setProductId(data.value)}>
            {products.map((product) => <option value={product.id} key={product.id}>{product.canonicalName}</option>)}
          </DmSelect>
        </DmField>
        <DmField label="Что исправить" required>
          <DmSelect value={field} onChange={(_, data) => setField(data.value as typeof field)}>
            {fields.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </DmSelect>
        </DmField>
        <DmField label="Предлагаемая редакция" required hint="Укажите точный вариант, который нужно внести в карточку.">
          <DmTextarea rows={4} value={proposedValue} onChange={(_, data) => setProposedValue(data.value)} />
        </DmField>
        <DmField label="Почему нужна правка" required hint="Укажите, что именно не совпадает с документом или каталогом производителя.">
          <DmTextarea rows={3} value={reason} onChange={(_, data) => setReason(data.value)} />
        </DmField>
        <DmField label="Ссылка на подтверждение" hint="Необязательно: сайт производителя, регистрационный документ или каталог.">
          <DmInput type="url" value={evidenceUrl} onChange={(_, data) => setEvidenceUrl(data.value)} />
        </DmField>
        {feedback ? <div className={`${styles.message} ${feedback.tone === "error" ? styles.messageError : styles.messageSuccess}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</div> : null}
        <div className={styles.formFooter}>
          <span className={styles.formHint}>Поля с отметкой обязательны. Ответ появится в истории после проверки.</span>
          <DmButton type="submit" appearance="primary" disabled={!canSubmitProductCorrection({ busy, productId, proposedValue, reason })}>
            {busy ? "Отправляем…" : "Отправить исправление"}
          </DmButton>
        </div>
        </> : null}
      </form>
      <div className={styles.history}>
        <div className={styles.historyHeading}><div><span className={styles.kicker}>История обращений</span><h3>Мои исправления</h3></div><span className={styles.historyCount}>{items.length}</span></div>
        {historyLoading ? <LoadingState label="Загружаем историю исправлений" /> : historyError ? <div className={styles.historyError} role="alert"><strong>{historyError}</strong><DmButton appearance="secondary" onClick={() => void load()}>Повторить</DmButton></div> : !items.length ? <EmptyState title="Исправлений пока нет" description="Здесь появятся ваши правки и решения DentMarket." /> : items.slice(0, 12).map((item) => <article className={styles.request} key={item.id}>
          <div className={styles.requestHeader}><strong>{item.product.canonicalName}</strong><StatusTag tone={item.status === "REJECTED" ? "danger" : item.status === "PENDING" ? "warning" : "success"}>{statusLabel[item.status]}</StatusTag></div>
          <small>{fieldLabel(item.field)} · {formatDate(item.createdAt, true)}</small>
          <p>{item.appliedValue ?? item.proposedValue}</p>
          {item.moderatorComment ? <span>Комментарий DentMarket: {item.moderatorComment}</span> : null}
        </article>)}
      </div>
    </div>
  </Section>;
}
