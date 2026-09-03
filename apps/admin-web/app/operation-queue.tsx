"use client";

import {
  DmButton,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { useCallback, useEffect, useState } from "react";
import styles from "./operation-queue.module.css";
import { adminAuthHeaders } from "./admin-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

type QueueItem = Record<string, unknown> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  detectedAt?: string;
  evaluatedAt?: string;
  proposedName?: string;
  orderNumber?: string;
  agreementNumber?: string;
  fileName?: string;
};
type QueueSection = {
  type: string;
  priority: string;
  count: number;
  items: QueueItem[];
};
type WorkQueue = {
  generatedAt: string;
  totalOpenItems: number;
  sections: QueueSection[];
};

const labels: Record<string, string> = {
  CATALOG_REVIEW: "Карточки на проверке",
  COMPLIANCE_REVIEW: "Проверка документов",
  INTEGRATION_RECONCILIATION: "Расхождения в данных",
  IMPORT_ATTENTION: "Загрузки требуют проверки",
  AGREEMENT_SIGNATURE: "Договоры ждут подписи",
  SUPPLIER_CONFIRMATION: "Подтверждение заказов",
  STALE_INVENTORY: "Устаревшие остатки",
};
const priorityLabels: Record<string, string> = {
  CRITICAL: "Критический",
  HIGH: "Высокий",
  NORMAL: "Обычный",
  LOW: "Низкий",
};
const itemLabel = (item: QueueItem) =>
  item.proposedName ??
  item.orderNumber ??
  item.agreementNumber ??
  item.fileName ??
  (typeof item.externalRef === "string"
    ? item.externalRef
    : item.id ?? "Операционная задача");
const itemDate = (item: QueueItem) =>
  item.createdAt ?? item.updatedAt ?? item.detectedAt ?? item.evaluatedAt;
const priorityTone = (priority: string) =>
  priority === "CRITICAL"
    ? "danger" as const
    : priority === "HIGH"
      ? "warning" as const
      : priority === "LOW"
        ? "neutral" as const
        : "info" as const;

export function OperationQueue() {
  const [data, setData] = useState<WorkQueue | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/operations/work-queue`, {
        headers: adminAuthHeaders(false),
      });
      if (!response.ok) {
        throw new Error(`Очередь недоступна (${response.status})`);
      }
      setData((await response.json()) as WorkQueue);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить очередь задач",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasItems = data?.sections.some(({ count }) => count > 0) ?? false;

  return (
    <section className={styles.panel} aria-label="Операционная очередь">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Контроль продаж</p>
          <h2 className={styles.title}>Задачи, которые мешают продажам</h2>
          <span className={styles.subtitle}>
            Проверьте, что мешает поставщикам публиковать товары и принимать
            заказы.
          </span>
        </div>
        <div className={styles.total}>
          <strong>{data?.totalOpenItems ?? "—"}</strong>
          <span>открытых задач</span>
        </div>
        <DmButton appearance="secondary" onClick={() => void load()} disabled={busy}>
          {busy ? "Обновляем…" : "Обновить"}
        </DmButton>
      </div>

      {error ? (
        <ErrorState
          title="Очередь недоступна"
          description={error}
          action={
            <DmButton appearance="secondary" onClick={() => void load()}>
              Повторить
            </DmButton>
          }
        />
      ) : busy && !data ? (
        <LoadingState label="Собираем задачи" />
      ) : !hasItems ? (
        <EmptyState
          title="Очередь пуста"
          description="Нет критических задач, которые блокируют продажи или исполнение заказов."
        />
      ) : (
        <>
          <div className={styles.sections}>
            {data?.sections.map((section) => (
              <article className={styles.section} key={section.type}>
                <header>
                  <strong>{labels[section.type] ?? "Операционная задача"}</strong>
                  <b>{section.count}</b>
                </header>
                <StatusTag tone={priorityTone(section.priority)}>
                  {section.count
                    ? `Приоритет: ${priorityLabels[section.priority] ?? "не указан"}`
                    : "Новых задач нет"}
                </StatusTag>
              </article>
            ))}
          </div>
          <div className={styles.items}>
            <h3>Первые задачи в очереди</h3>
            {data?.sections.flatMap((section) =>
              section.items.slice(0, 2).map((item) => (
                <div className={styles.item} key={`${section.type}-${item.id}`}>
                  <strong>
                    {labels[section.type] ?? section.type}: {itemLabel(item)}
                  </strong>
                  {itemDate(item) ? (
                    <time>
                      {new Intl.DateTimeFormat("ru-KZ", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(itemDate(item)!))}
                    </time>
                  ) : null}
                </div>
              )),
            )}
          </div>
        </>
      )}

      <p className={styles.footer}>
        Очередь показывает общее состояние. Изменяйте договоры, проверки,
        импорты и заказы в соответствующих разделах. Все действия сохраняются
        в журнале.
      </p>
    </section>
  );
}
