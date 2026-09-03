"use client";

import {
  DmButton,
  DmFeedback,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders } from "./admin-auth";
import {
  catalogQualityGapCount,
  noResultQueries,
} from "./catalog-workflow-view-model";
import styles from "./page.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

type Quality = {
  cards: number;
  indexed: number;
  missingVariants: number;
  missingCategories: number;
  missingIndustries: number;
  bySource: Array<{ source: string; count: number }>;
};

type SearchAnalytics = {
  days: number;
  queries: Array<{
    query: string;
    searches: number;
    noResults: number;
    avgResults: number;
  }>;
};

export function CatalogQuality() {
  const [quality, setQuality] = useState<Quality | null>(null);
  const [analytics, setAnalytics] = useState<SearchAnalytics | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const headers = adminAuthHeaders(false);
      const [qualityResponse, analyticsResponse] = await Promise.all([
        fetch(`${apiUrl}/catalog/quality`, { headers }),
        fetch(`${apiUrl}/marketplace/search/analytics?days=30`, { headers }),
      ]);
      if (!qualityResponse.ok || !analyticsResponse.ok) {
        throw new Error("API не вернул полный отчёт качества каталога");
      }
      setQuality((await qualityResponse.json()) as Quality);
      setAnalytics((await analyticsResponse.json()) as SearchAnalytics);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось проверить качество каталога",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const missingQueries = useMemo(
    () => noResultQueries(analytics?.queries ?? []),
    [analytics],
  );

  return (
    <section className={styles.panel} aria-labelledby="catalog-quality-title">
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle} id="catalog-quality-title">
            Качество каталога и поиск
          </h2>
          <span className={styles.muted}>
            Структурные пропуски и запросы клиник без результата
          </span>
        </div>
        <DmButton appearance="secondary" onClick={() => void load()} disabled={busy}>
          {busy ? "Проверяем…" : "Обновить"}
        </DmButton>
      </div>

      {error && quality ? (
        <DmFeedback
          tone="warning"
          title="Не удалось обновить отчёт"
          description={`${error}. Ниже показаны последние успешно загруженные данные.`}
        />
      ) : null}
      {error && !quality ? (
        <ErrorState
          title="Отчёт качества недоступен"
          description={error}
          action={
            <DmButton appearance="secondary" onClick={() => void load()}>
              Повторить
            </DmButton>
          }
        />
      ) : null}
      {busy && !quality ? <LoadingState label="Проверяем каталог" /> : null}

      {quality ? (
        <div className={styles.moduleGrid}>
          <article className={styles.module}>
            <strong>{quality.cards.toLocaleString("ru-KZ")}</strong>
            <div className={styles.moduleDescription}>канонических карточек</div>
          </article>
          <article className={styles.module}>
            <strong>{quality.indexed.toLocaleString("ru-KZ")}</strong>
            <div className={styles.moduleDescription}>в поисковом индексе</div>
          </article>
          <article className={styles.module}>
            <strong>{catalogQualityGapCount(quality)}</strong>
            <div className={styles.moduleDescription}>структурных пропусков</div>
          </article>
        </div>
      ) : null}

      {analytics && missingQueries.length ? (
        <div className={styles.qualityTable}>
          <h3 className={styles.panelTitle}>Запросы без результата за 30 дней</h3>
          {missingQueries.map((row) => (
            <div className={styles.qualityRow} key={row.query}>
              <div className={styles.qualityCopy}>
                <strong>{row.query}</strong>
                <span className={styles.qualityMeta}>
                  {row.noResults} без результата из {row.searches} запросов
                </span>
              </div>
              <span className={styles.muted}>
                {Math.round(row.avgResults)} в среднем
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {analytics && !missingQueries.length ? (
        <EmptyState
          title="Неудовлетворённых запросов нет"
          description="За выбранный период клиники находили результаты по всем зафиксированным запросам."
        />
      ) : null}
    </section>
  );
}
