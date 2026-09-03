"use client";

import { ArrowClockwise20Regular, Filter20Regular } from "@fluentui/react-icons";
import {
  DmButton,
  DmFeedback,
  DmField,
  DmInput,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@marketplace/ui";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminAuthHeaders } from "./admin-auth";
import styles from "./audit-operations.module.css";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  createdAt: string;
};
type AuditPage = {
  items: AuditLog[];
  total: number;
  page: number;
  pageCount: number;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "organization.created": "Организация создана",
    "trust.incident.updated": "Ограничение обновлено",
    "catalog.product.updated": "Карточка товара обновлена",
    "catalog.product.created": "Карточка товара создана",
    "marketplace.agreement.signed": "Договор подписан",
  };
  return labels[action] ?? action.replaceAll(".", " · ");
}

export function AuditOperations() {
  const [audit, setAudit] = useState<AuditPage>({
    items: [],
    total: 0,
    page: 1,
    pageCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (path: string) => {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: adminAuthHeaders(false),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`API вернул статус ${response.status}`);
    return response.json() as Promise<AuditPage>;
  }, []);

  const load = useCallback(
    async (path = "/audit?page=1&pageSize=12") => {
      setLoading(true);
      setError("");
      try {
        setAudit(await request(path));
        setHasLoaded(true);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось загрузить журнал действий",
        );
      } finally {
        setLoading(false);
      }
    },
    [request],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function filterAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams({ page: "1", pageSize: "12" });
    const entityType = String(data.get("entityType") ?? "").trim();
    const action = String(data.get("action") ?? "").trim();
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);
    setMessage("Фильтр журнала применён.");
    return load(`/audit?${params}`);
  }

  return (
    <section className={styles.section} aria-labelledby="audit-operations-title">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Критические действия</span>
          <h2 id="audit-operations-title">Журнал оператора</h2>
          <p>
            Проверяемая история изменений без возможности редактирования
            записей.
          </p>
        </div>
        <DmButton
          appearance="secondary"
          icon={<ArrowClockwise20Regular />}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Обновляем…" : "Обновить"}
        </DmButton>
      </div>

      {message && !error ? (
        <DmFeedback tone="success" title="Журнал обновлён" description={message} />
      ) : null}
      {error && hasLoaded ? (
        <DmFeedback
          tone="danger"
          title="Не удалось обновить журнал"
          description={error}
          alert
        />
      ) : null}

      {loading && !hasLoaded ? (
        <LoadingState label="Загружаем журнал критических действий" />
      ) : error && !hasLoaded ? (
        <ErrorState
          title="Журнал недоступен"
          description={error}
          action={
            <DmButton appearance="secondary" onClick={() => void load()}>
              Повторить
            </DmButton>
          }
        />
      ) : (
        <div className={styles.body}>
          <form
            className={styles.filter}
            onSubmit={(event) => void filterAudit(event)}
          >
            <DmField label="Раздел" hint="Например, Product">
              <DmInput name="entityType" placeholder="Product" />
            </DmField>
            <DmField label="Действие" hint="Например, updated">
              <DmInput name="action" placeholder="updated" />
            </DmField>
            <DmButton
              type="submit"
              appearance="secondary"
              icon={<Filter20Regular />}
              disabled={loading}
            >
              Применить фильтр
            </DmButton>
          </form>
          <div className={styles.summary}>
            {audit.total} событий · страница {audit.page} из{" "}
            {Math.max(audit.pageCount, 1)}
          </div>
          {audit.items.length ? (
            <div className={styles.timeline}>
              {audit.items.map((item) => (
                <article key={item.id}>
                  <i aria-hidden="true" />
                  <div>
                    <strong>{actionLabel(item.action)}</strong>
                    <span>
                      {item.entityType} · {item.entityId.slice(0, 8)} ·{" "}
                      {item.actorId
                        ? `оператор ${item.actorId.slice(0, 8)}`
                        : "системное действие"}
                    </span>
                  </div>
                  <time dateTime={item.createdAt}>
                    {new Intl.DateTimeFormat("ru-KZ", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(item.createdAt))}
                  </time>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="События не найдены"
              description="Измените фильтр или дождитесь следующего критического действия оператора."
            />
          )}
        </div>
      )}
    </section>
  );
}
