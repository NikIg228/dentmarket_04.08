"use client";

import {
  ArrowClockwise20Regular,
  CheckmarkCircle20Regular,
  ShieldError20Regular,
} from "@fluentui/react-icons";
import { MarketplaceApiClient } from "@marketplace/api-client";
import {
  DmButton,
  DmFeedback,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatAdminStatus } from "./admin-labels";
import { adminApiContext } from "./admin-auth";
import styles from "./trust-operations.module.css";
import { summarizeTrustOperations } from "./trust-operations-view-model";

type Supplier = {
  organizationId: string;
  organization: { displayName: string };
};
type Incident = {
  id: string;
  impactedOrganizationId: string | null;
  type: string;
  severity: string;
  status: string;
  actionType: string;
  explanation: string;
  remediation: string;
  restorationCondition: string;
  actionExpiresAt: string | null;
  version: number;
  appeals: Array<{ id: string; status: string; reason: string }>;
};
type Rating = {
  supplierOrganizationId: string;
  status: string;
  score: string | null;
  eventCount: number;
  confidence: string;
  computedAt: string;
};
type Warehouse = { id: string; geoStatus: string };

const incidentTypeLabels: Record<string, string> = {
  MATCHING_ERROR: "Ошибка сопоставления товара",
  STALE_PRICE: "Устаревшая цена",
  UNRELIABLE_STOCK: "Недостоверный остаток",
  PACKAGING_ERROR: "Ошибка упаковки",
  INCOMPLETE_DOCUMENTS: "Неполные документы",
  DELIVERY_FAILURE: "Срыв доставки",
  SUSPICIOUS_PROMOTION: "Проверка акции",
  FAKE_REVIEW: "Проверка отзыва",
  UNVERIFIED_LOCATION: "Адрес не подтверждён",
  PAYMENT_DETAILS_CHANGE: "Изменение реквизитов",
};
const severityLabels: Record<string, string> = {
  CRITICAL: "Критический",
  HIGH: "Высокий",
  NORMAL: "Обычный",
  LOW: "Низкий",
};
const actionLabels: Record<string, string> = {
  HARD_BLOCK: "Операции заблокированы",
  NONE: "Без ограничений",
  REVIEW_REQUIRED: "Нужна проверка оператора",
  HIDDEN: "Публикация скрыта",
};
const severityTone = (severity: string) =>
  severity === "CRITICAL" || severity === "HIGH"
    ? "danger" as const
    : severity === "NORMAL"
      ? "warning" as const
      : "info" as const;

export function TrustOperations() {
  const api = useMemo(
    () =>
      new MarketplaceApiClient(
        process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api",
        adminApiContext(),
      ),
    [],
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [ratings, setRatings] = useState<Array<Rating & { name: string }>>([]);
  const [warehouseStats, setWarehouseStats] = useState({ total: 0, verified: 0 });
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    description: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [supplierData, nextIncidents] = await Promise.all([
        api.get<Supplier[]>("/suppliers"),
        api.get<Incident[]>("/trust/incidents"),
      ]);
      const [nextRatings, warehouseGroups] = await Promise.all([
        Promise.all(
          supplierData.map(async ({ organizationId, organization }) => ({
            ...(await api.get<Rating>(
              `/trust/ratings/suppliers/${organizationId}`,
            )),
            name: organization.displayName,
          })),
        ),
        Promise.all(
          supplierData.map(({ organizationId }) =>
            api.get<Warehouse[]>(`/suppliers/${organizationId}/warehouses`),
          ),
        ),
      ]);
      const warehouses = warehouseGroups.flat();
      setSuppliers(supplierData);
      setIncidents(nextIncidents);
      setRatings(nextRatings);
      setWarehouseStats({
        total: warehouses.length,
        verified: warehouses.filter(({ geoStatus }) => geoStatus === "VERIFIED")
          .length,
      });
      setHasLoaded(true);
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить операционные проверки",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () =>
      summarizeTrustOperations({
        incidents,
        ratingStatuses: ratings.map(({ status }) => status),
        warehouseStats,
      }),
    [incidents, ratings, warehouseStats],
  );
  const openIncidents = incidents.filter(({ status }) => status !== "RESOLVED");

  const resolve = async (incident: Incident) => {
    setBusy(incident.id);
    setFeedback(null);
    try {
      await api.patch(`/trust/incidents/${incident.id}`, {
        version: incident.version,
        status: "RESOLVED",
        actionType: "NONE",
        resolution: "Условие восстановления выполнено.",
      });
      await load();
      setFeedback({
        tone: "success",
        description: "Ограничение закрыто, операционные данные обновлены.",
      });
    } catch (cause) {
      setFeedback({
        tone: "danger",
        description:
          cause instanceof Error
            ? cause.message
            : "Не удалось закрыть ограничение",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.section} aria-labelledby="trust-operations-title">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <ShieldError20Regular /> Операционный контроль
          </span>
          <h2 id="trust-operations-title">Риски и восстановление поставщиков</h2>
          <p>
            Ограничения, обращения и подтверждение исправлений в одном рабочем
            контуре.
          </p>
        </div>
        <DmButton
          appearance="secondary"
          icon={<ArrowClockwise20Regular />}
          onClick={() => void load()}
          disabled={loading || busy !== null}
        >
          {loading ? "Обновляем…" : "Обновить"}
        </DmButton>
      </div>

      {feedback ? (
        <DmFeedback
          tone={feedback.tone}
          title={feedback.tone === "success" ? "Данные обновлены" : "Действие не выполнено"}
          description={feedback.description}
          alert={feedback.tone === "danger"}
        />
      ) : null}
      {loadError && hasLoaded ? (
        <DmFeedback
          tone="danger"
          title="Не удалось обновить раздел"
          description={loadError}
          alert
        />
      ) : null}

      {loading && !hasLoaded ? (
        <LoadingState label="Загружаем операционные проверки" />
      ) : loadError && !hasLoaded ? (
        <ErrorState
          title="Контроль рисков недоступен"
          description={loadError}
          action={
            <DmButton appearance="secondary" onClick={() => void load()}>
              Повторить
            </DmButton>
          }
        />
      ) : (
        <>
          <div className={styles.metrics} aria-label="Сводка контроля рисков">
            <div>
              <span>Открытые ограничения</span>
              <strong>{summary.open}</strong>
              <small>жёстких блокировок: {summary.hardBlocks}</small>
            </div>
            <div>
              <span>Обращения</span>
              <strong>{summary.pendingAppeals}</strong>
              <small>ожидают решения</small>
            </div>
            <div>
              <span>Подтверждённые склады</span>
              <strong>{summary.verifiedWarehouses} / {summary.totalWarehouses}</strong>
              <small>прошли геопроверку</small>
            </div>
            <div>
              <span>Внутренний рейтинг</span>
              <strong>{summary.calculatedRatings} / {ratings.length}</strong>
              <small>рассчитан по событиям</small>
            </div>
          </div>

          <div className={styles.layout}>
            <div className={styles.queuePane}>
              <div className={styles.paneHeading}>
                <div>
                  <h3>Открытые ограничения</h3>
                  <p>Закрывайте блокировку только после выполнения условия восстановления.</p>
                </div>
                <StatusTag tone={summary.hardBlocks > 0 ? "danger" : "success"}>
                  {summary.hardBlocks > 0
                    ? `Жёстких: ${summary.hardBlocks}`
                    : "Критических нет"}
                </StatusTag>
              </div>
              {openIncidents.length ? (
                <div className={styles.queue}>
                  {openIncidents.map((incident) => (
                    <article key={incident.id}>
                      <header>
                        <div>
                          <strong>
                            {incidentTypeLabels[incident.type] ?? "Требуется проверка"}
                          </strong>
                          <span>
                            {suppliers.find(
                              ({ organizationId }) =>
                                organizationId === incident.impactedOrganizationId,
                            )?.organization.displayName ?? "DentMarket"}
                          </span>
                        </div>
                        <StatusTag tone={severityTone(incident.severity)}>
                          {severityLabels[incident.severity] ?? "Приоритет не указан"}
                        </StatusTag>
                      </header>
                      <p>{incident.explanation}</p>
                      <dl>
                        <div>
                          <dt>Текущее ограничение</dt>
                          <dd>
                            {actionLabels[incident.actionType] ??
                              formatAdminStatus(incident.actionType)}
                          </dd>
                        </div>
                        <div>
                          <dt>Что исправить</dt>
                          <dd>{incident.remediation}</dd>
                        </div>
                        <div>
                          <dt>Условие восстановления</dt>
                          <dd>{incident.restorationCondition}</dd>
                        </div>
                      </dl>
                      <footer>
                        <span>
                          {incident.appeals.length
                            ? `Обращений: ${incident.appeals.length}`
                            : "Обращений нет"}
                        </span>
                        <DmButton
                          appearance="primary"
                          icon={<CheckmarkCircle20Regular />}
                          disabled={busy !== null || loading}
                          onClick={() => void resolve(incident)}
                        >
                          {busy === incident.id
                            ? "Закрываем…"
                            : "Подтвердить восстановление"}
                        </DmButton>
                      </footer>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Открытых ограничений нет"
                  description="Новые операционные риски появятся здесь после проверки каталога, остатков, документов или исполнения заказа."
                />
              )}
            </div>

            <div className={styles.ratingPane}>
              <div className={styles.paneHeading}>
                <div>
                  <h3>Внутренний сигнал оператора</h3>
                  <p>Используется для контроля качества и не публикуется как trust score.</p>
                </div>
              </div>
              {ratings.length ? (
                <div className={styles.ratings}>
                  {ratings.map((rating) => (
                    <div key={rating.supplierOrganizationId}>
                      <span>{rating.name}</span>
                      <strong>
                        {rating.status === "CALCULATED" && rating.score !== null
                          ? Number(rating.score).toFixed(1)
                          : "Нет оценки"}
                      </strong>
                      <small>
                        {rating.eventCount ?? 0} подтверждённых событий
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Рейтинг ещё не рассчитан"
                  description="Сначала нужны подтверждённые операционные события поставщиков."
                />
              )}
              <aside>
                <strong>Граница пилота</strong>
                <p>
                  Публичный trust score и расширенные рекомендации не входят в
                  первый пилот. Этот блок остаётся внутренним диагностическим
                  сигналом оператора.
                </p>
              </aside>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
