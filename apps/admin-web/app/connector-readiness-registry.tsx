"use client";

import { ArrowClockwise20Regular } from "@fluentui/react-icons/svg/arrow-clockwise";
import { PlugConnected20Regular } from "@fluentui/react-icons/svg/plug-connected";
import {
  DmButton,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { useCallback, useEffect, useState } from "react";
import styles from "./connector-readiness-registry.module.css";
import { adminAuthHeaders } from "./admin-auth";

type Entry = {
  id: string;
  providerCode: string;
  displayName: string;
  readinessStatus: "READY" | "PARTIAL" | "BLOCKED";
  goLiveStatus:
    | "INTERNAL_READY"
    | "CONNECTOR_NEEDED"
    | "PILOT"
    | "LIVE_VERIFIED"
    | "BLOCKED";
  environment: string;
  directions: Record<string, string>;
  credentialsRequired: boolean;
  externalConnectorRequired: boolean;
  limitations?: string[] | null;
  evidence?: string[] | null;
  runbookPath?: string | null;
  owner: string;
  lastVerifiedAt?: string | null;
};
type Response = {
  entries: Entry[];
  summary: {
    total: number;
    ready: number;
    externalDependency: number;
    liveVerified: number;
  };
  rule: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const labels: Record<string, string> = {
  READY: "Готово внутри",
  PARTIAL: "Частично",
  BLOCKED: "Заблокировано",
  INTERNAL_READY: "Внутренняя часть готова",
  CONNECTOR_NEEDED: "Нужно внешнее подключение",
  PILOT: "Пилот",
  LIVE_VERIFIED: "Работа подтверждена",
};
const directionLabels: Record<string, string> = {
  CATALOG: "Каталог",
  PRICE: "Цены",
  STOCK: "Остатки",
  INVENTORY: "Остатки",
  LOT: "Партии",
  ORDER: "Заказы",
  RESERVATION: "Резервы",
  SHIPMENT: "Отгрузки",
  DOCUMENT: "Документы",
};
const directionModeLabels: Record<string, string> = {
  READ: "получение",
  PULL: "получение",
  WRITE: "отправка",
  PUSH: "отправка",
  READ_WRITE: "двусторонний обмен",
  BIDIRECTIONAL: "двусторонний обмен",
};
const readinessTone = (status: Entry["readinessStatus"] | Entry["goLiveStatus"]) =>
  status === "READY" || status === "LIVE_VERIFIED" || status === "INTERNAL_READY"
    ? "success" as const
    : status === "BLOCKED"
      ? "danger" as const
      : status === "PARTIAL" || status === "CONNECTOR_NEEDED"
        ? "warning" as const
        : "info" as const;

export function ConnectorReadinessRegistry() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/integrations/readiness`, {
        headers: adminAuthHeaders(false),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await response.text());
      setData((await response.json()) as Response);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось проверить готовность подключений",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.panel} aria-labelledby="connector-readiness-title">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <PlugConnected20Regular /> Подключения поставщиков
          </div>
          <h2 id="connector-readiness-title">Готовность каналов поставщика</h2>
          <p>
            Внутренняя реализация и подтверждённый запуск разделены. Статус
            «Работа подтверждена» появляется только после реального сквозного
            прогона.
          </p>
        </div>
        <DmButton
          appearance="secondary"
          icon={<ArrowClockwise20Regular />}
          onClick={() => void load()}
          disabled={loading}
        >
          Обновить
        </DmButton>
      </div>

      {data ? (
        <div className={styles.summary} aria-label="Сводка готовности">
          <span><strong>{data.summary.total}</strong> каналов</span>
          <span><strong>{data.summary.ready}</strong> готовы внутри</span>
          <span><strong>{data.summary.externalDependency}</strong> ждут внешнее подключение</span>
          <span><strong>{data.summary.liveVerified}</strong> проверены вживую</span>
        </div>
      ) : null}

      {loading && !data ? (
        <LoadingState label="Проверяем реестр подключений" />
      ) : error ? (
        <ErrorState
          title="Реестр недоступен"
          description={error}
          action={
            <DmButton appearance="secondary" onClick={() => void load()}>
              Повторить
            </DmButton>
          }
        />
      ) : !data?.entries.length ? (
        <EmptyState
          title="Каналы ещё не зарегистрированы"
          description="Добавьте подключение поставщика или проверьте конфигурацию реестра готовности."
        />
      ) : (
        <div className={styles.grid}>
          {data.entries.map((entry) => {
            const activeDirections = Object.entries(entry.directions).filter(
              ([, mode]) => mode !== "NONE",
            );
            return (
              <article className={styles.card} key={entry.id}>
                <div className={styles.cardTop}>
                  <div>
                    <strong>{entry.displayName}</strong>
                    <code>{entry.providerCode}</code>
                  </div>
                  <div className={styles.badges}>
                    <StatusTag tone={readinessTone(entry.readinessStatus)}>
                      {labels[entry.readinessStatus]}
                    </StatusTag>
                    <StatusTag tone={readinessTone(entry.goLiveStatus)}>
                      {labels[entry.goLiveStatus]}
                    </StatusTag>
                  </div>
                </div>
                <div className={styles.meta}>
                  <span>Среда: {entry.environment}</span>
                  <span>Ответственный: {entry.owner}</span>
                  {entry.credentialsRequired ? <span>Нужны учётные данные</span> : null}
                  {entry.externalConnectorRequired ? <span>Нужен внешний агент</span> : null}
                </div>
                <div className={styles.directions}>
                  {activeDirections.map(([name, mode]) => (
                    <span key={name}>
                      {directionLabels[name] ?? "Другие данные"} ·{" "}
                      {directionModeLabels[mode] ?? "режим не указан"}
                    </span>
                  ))}
                </div>
                {entry.limitations?.length ? (
                  <ul>
                    {entry.limitations.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
                <div className={styles.footer}>
                  <span>
                    {entry.lastVerifiedAt
                      ? `Проверено ${new Date(entry.lastVerifiedAt).toLocaleDateString("ru-KZ")}`
                      : "Работа подключения не подтверждена"}
                  </span>
                  <span>{entry.runbookPath ?? "Инструкция не назначена"}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
