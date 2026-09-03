"use client";

import {
  DmButton,
  DmFeedback,
  DmField,
  DmInput,
  DmTextarea,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@marketplace/ui";
import { useCallback, useEffect, useState } from "react";
import { adminAuthHeaders } from "./admin-auth";
import {
  canDecideCorrection,
  correctionDecisionLabel,
} from "./catalog-workflow-view-model";
import styles from "./product-correction-queue.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

type Correction = {
  id: string;
  field: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string;
  evidenceUrl: string | null;
  createdAt: string;
  product: {
    canonicalName: string;
    brand: { name: string } | null;
    manufacturer: { name: string } | null;
  };
  supplier: { organization: { displayName: string } };
};

const labels: Record<string, string> = {
  CANONICAL_NAME: "Название",
  DESCRIPTION: "Описание",
  MANUFACTURER_SKU: "Артикул производителя",
  GTIN: "GTIN",
  PRODUCT_TYPE: "Тип товара",
  REGULATORY_CLASS: "Регуляторный класс",
};

export function ProductCorrectionQueue() {
  const [items, setItems] = useState<Correction[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(
        `${apiUrl}/moderation/product-corrections?status=PENDING`,
        { headers: adminAuthHeaders(false) },
      );
      if (!response.ok) throw new Error("API отклонил запрос очереди");
      const data = (await response.json()) as Correction[];
      setItems(data);
      setDrafts(
        Object.fromEntries(data.map((item) => [item.id, item.proposedValue])),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось загрузить запросы поставщиков",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: Correction, action: "approve" | "reject") => {
    setBusy(item.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiUrl}/moderation/product-corrections/${item.id}/${action}`,
        {
          method: "POST",
          headers: adminAuthHeaders(),
          body: JSON.stringify({
            acceptedValue: action === "approve" ? drafts[item.id] : undefined,
            moderatorComment: comments[item.id]?.trim() || undefined,
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      setNotice(
        action === "approve"
          ? "Правка принята и сохранена в карточке."
          : "Правка отклонена; комментарий доступен поставщику.",
      );
      await load();
    } catch {
      setError("Решение не сохранено. Проверьте права и повторите попытку.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="product-corrections-title">
      <div className={styles.header}>
        <div>
          <h2 id="product-corrections-title">Правки от поставщиков</h2>
          <p>
            Проверьте источник и при необходимости отредактируйте значение до
            публикации.
          </p>
        </div>
        <DmButton appearance="secondary" onClick={() => void load()}>
          Обновить
        </DmButton>
      </div>

      {notice ? (
        <DmFeedback tone="success" title="Решение сохранено" description={notice} />
      ) : null}
      {error ? (
        <ErrorState
          title="Очередь правок недоступна"
          description={error}
          action={
            <DmButton appearance="secondary" onClick={() => void load()}>
              Повторить
            </DmButton>
          }
        />
      ) : null}
      {loading ? <LoadingState label="Загружаем правки поставщиков" /> : null}
      {!loading && !error && !items.length ? (
        <EmptyState
          title="Новых исправлений нет"
          description="Запросы появятся здесь после отправки правки поставщиком."
        />
      ) : null}

      {!loading && !error && items.length ? (
        <div className={styles.list}>
          {items.map((item) => {
            const draft = drafts[item.id] ?? "";
            const comment = comments[item.id] ?? "";
            const itemBusy = busy === item.id;
            return (
              <article className={styles.item} key={item.id}>
                <div className={styles.identity}>
                  <span>{labels[item.field] ?? item.field}</span>
                  <h3>{item.product.canonicalName}</h3>
                  <small>
                    {item.supplier.organization.displayName} ·{" "}
                    {new Date(item.createdAt).toLocaleDateString("ru-KZ")}
                  </small>
                  <p>{item.reason}</p>
                  {item.evidenceUrl ? (
                    <a href={item.evidenceUrl} target="_blank" rel="noreferrer">
                      Открыть подтверждение ↗
                    </a>
                  ) : (
                    <small>Подтверждающая ссылка не приложена</small>
                  )}
                </div>
                <div className={styles.comparison}>
                  <div className={styles.readonlyField}>
                    <span>Сейчас</span>
                    <div>{item.currentValue || "Поле не заполнено"}</div>
                  </div>
                  <DmField label="Значение для публикации" required>
                    <DmTextarea
                      rows={5}
                      value={draft}
                      onChange={(_, data) =>
                        setDrafts((state) => ({
                          ...state,
                          [item.id]: data.value,
                        }))
                      }
                    />
                  </DmField>
                  <DmField
                    label="Комментарий поставщику"
                    hint="Минимум 3 символа; обязателен для решения"
                    required
                    validationState={
                      comment.trim().length > 0 && comment.trim().length < 3
                        ? "error"
                        : "none"
                    }
                    validationMessage={
                      comment.trim().length > 0 && comment.trim().length < 3
                        ? "Добавьте содержательный комментарий"
                        : undefined
                    }
                  >
                    <DmInput
                      value={comment}
                      onChange={(_, data) =>
                        setComments((state) => ({
                          ...state,
                          [item.id]: data.value,
                        }))
                      }
                    />
                  </DmField>
                </div>
                <div className={styles.actions}>
                  <DmButton
                    appearance="secondary"
                    disabled={
                      itemBusy ||
                      !canDecideCorrection({ action: "reject", draft, comment })
                    }
                    onClick={() => void decide(item, "reject")}
                  >
                    Отклонить
                  </DmButton>
                  <DmButton
                    appearance="primary"
                    disabled={
                      itemBusy ||
                      !canDecideCorrection({ action: "approve", draft, comment })
                    }
                    onClick={() => void decide(item, "approve")}
                  >
                    {itemBusy
                      ? "Сохраняем…"
                      : correctionDecisionLabel(draft, item.proposedValue)}
                  </DmButton>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
