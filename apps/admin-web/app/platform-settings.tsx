"use client";

import {
  ArrowClockwise20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import {
  DmButton,
  DmFeedback,
  ErrorState,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders } from "./admin-auth";
import styles from "./platform-settings.module.css";
import { summarizePilotSettings } from "./platform-settings-view-model";

type Readiness = {
  summary: {
    total: number;
    ready: number;
    externalDependency: number;
    liveVerified: number;
  };
};
type PaymentProvider = { id: string; code?: string; status?: string };
type ComplianceRule = { id: string; status: string };
type Target = "imports" | "orders" | "security";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const excludedCapabilities = [
  ["AI-помощник", "Не входит в первый пилот"],
  ["Billing и тарифные планы", "Не входят в первый пилот"],
  ["Публичный trust score", "Остаётся внутренним сигналом оператора"],
  ["Автоматические выплаты", "Требуют отдельного go-live решения"],
] as const;

export function PlatformSettings({
  onNavigate,
}: {
  onNavigate?: (target: Target) => void;
}) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");

  const request = useCallback(async <T,>(path: string): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: adminAuthHeaders(false),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`API вернул статус ${response.status}`);
    return response.json() as Promise<T>;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextReadiness, nextProviders, nextRules] = await Promise.all([
        request<Readiness>("/integrations/readiness"),
        request<PaymentProvider[]>("/payment-providers"),
        request<ComplianceRule[]>("/compliance/rules"),
      ]);
      setReadiness(nextReadiness);
      setProviders(nextProviders);
      setRules(nextRules);
      setHasLoaded(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить профиль пилота",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () =>
      summarizePilotSettings({
        channels: readiness?.summary ?? {
          total: 0,
          ready: 0,
          externalDependency: 0,
          liveVerified: 0,
        },
        paymentProviderCount: providers.length,
        activeComplianceRules: rules.filter(({ status }) => status === "ACTIVE")
          .length,
      }),
    [providers, readiness, rules],
  );

  return (
    <section className={styles.section} aria-labelledby="platform-settings-title">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <Settings20Regular /> Профиль запуска
          </span>
          <h2 id="platform-settings-title">Настройки закрытого пилота</h2>
          <p>
            Статусы доступности без опасных demo-операций и скрытого расширения
            scope.
          </p>
        </div>
        <DmButton
          appearance="secondary"
          icon={<ArrowClockwise20Regular />}
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Проверяем…" : "Обновить"}
        </DmButton>
      </div>

      {error && hasLoaded ? (
        <DmFeedback
          tone="danger"
          title="Не удалось обновить профиль"
          description={error}
          alert
        />
      ) : null}
      {loading && !hasLoaded ? (
        <LoadingState label="Проверяем настройки пилота" />
      ) : error && !hasLoaded ? (
        <ErrorState
          title="Настройки недоступны"
          description={error}
          action={
            <DmButton appearance="secondary" onClick={() => void load()}>
              Повторить
            </DmButton>
          }
        />
      ) : (
        <>
          <div className={styles.metrics} aria-label="Сводка профиля пилота">
            <div>
              <span>Каналы поставщиков</span>
              <strong>
                {summary.channelsReadyInside} / {summary.channelsConfigured}
              </strong>
              <small>готовы внутри платформы</small>
            </div>
            <div>
              <span>Проверены вживую</span>
              <strong>{summary.channelsLiveVerified}</strong>
              <small>внешних зависимостей: {summary.externalDependencies}</small>
            </div>
            <div>
              <span>Платёжный процесс</span>
              <strong>
                {summary.paymentProviderRegistered
                  ? "Есть кандидат"
                  : "Не назначен"}
              </strong>
              <small>провайдеров в реестре: {summary.paymentProviderCount}</small>
            </div>
            <div>
              <span>Правила комплаенса</span>
              <strong>{summary.activeComplianceRules}</strong>
              <small>активных правил</small>
            </div>
          </div>
          <div className={styles.grid}>
            <article>
              <h3>Где управлять рабочими данными</h3>
              <p>
                Настройки не дублируют операционные формы профильных разделов.
              </p>
              <div className={styles.routes}>
                <DmButton
                  appearance="secondary"
                  onClick={() => onNavigate?.("imports")}
                >
                  Подключения и загрузка
                </DmButton>
                <DmButton
                  appearance="secondary"
                  onClick={() => onNavigate?.("orders")}
                >
                  Заказы и договоры
                </DmButton>
                <DmButton
                  appearance="secondary"
                  onClick={() => onNavigate?.("security")}
                >
                  Контроль и аудит
                </DmButton>
              </div>
            </article>
            <article>
              <h3>Функции вне границы пилота</h3>
              <p>
                Код может оставаться в backend, но интерфейс не выдаёт его за
                готовую функцию.
              </p>
              <div className={styles.excluded}>
                {excludedCapabilities.map(([name, description]) => (
                  <div key={name}>
                    <span>
                      <strong>{name}</strong>
                      <small>{description}</small>
                    </span>
                    <StatusTag tone="neutral">Выключено</StatusTag>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
