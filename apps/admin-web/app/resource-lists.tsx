"use client";

import { ArrowClockwise20Regular } from "@fluentui/react-icons/svg/arrow-clockwise";
import {
  DmButton,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { useCallback, useEffect, useState } from "react";
import { adminAuthHeaders } from "./admin-auth";
import {
  getOrganizationSummary,
  getProductSummary,
  type ResourceOrganization,
  type ResourceProduct,
} from "./resource-lists-view-model";
import styles from "./resource-lists.module.css";

type LoadState<T> = {
  status: "loading" | "ready" | "error";
  data: T;
  message?: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

export function ResourceLists() {
  const [organizations, setOrganizations] = useState<
    LoadState<ResourceOrganization[]>
  >({ status: "loading", data: [] });
  const [products, setProducts] = useState<LoadState<ResourceProduct[]>>({
    status: "loading",
    data: [],
  });

  const load = useCallback(async () => {
    setOrganizations((current) => ({ ...current, status: "loading" }));
    setProducts((current) => ({ ...current, status: "loading" }));
    const loadResource = async <T,>(path: string): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        headers: adminAuthHeaders(false),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`API вернул статус ${response.status}`);
      return response.json() as Promise<T>;
    };
    const [organizationResult, productResult] = await Promise.allSettled([
      loadResource<ResourceOrganization[]>("/organizations"),
      loadResource<ResourceProduct[]>("/catalog/products"),
    ]);
    setOrganizations(
      organizationResult.status === "fulfilled"
        ? { status: "ready", data: organizationResult.value }
        : {
            status: "error",
            data: [],
            message:
              "Не удалось загрузить организации. Проверьте API и PostgreSQL.",
          },
    );
    setProducts(
      productResult.status === "fulfilled"
        ? { status: "ready", data: productResult.value }
        : {
            status: "error",
            data: [],
            message:
              "Не удалось загрузить каталог. Проверьте API и PostgreSQL.",
          },
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loading =
    organizations.status === "loading" || products.status === "loading";

  return (
    <section className={styles.section} aria-label="Операционные данные">
      <div className={styles.sectionHeader}>
        <div>
          <h2>Операционные данные</h2>
          <p>Последние организации и мастер-карточки из API.</p>
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
      <div className={styles.columns}>
        <ResourcePanel
          title="Организации"
          state={organizations}
          empty="Организации пока не созданы."
        >
          {organizations.data.slice(0, 6).map((organization) => {
            const summary = getOrganizationSummary(organization);
            return (
              <article className={styles.row} key={organization.id}>
                <div>
                  <strong>{summary.displayName}</strong>
                  <span>{summary.legalName}</span>
                </div>
                <div className={styles.rowMeta}>
                  <span>{summary.bin}</span>
                  <span>{summary.capabilities}</span>
                </div>
              </article>
            );
          })}
        </ResourcePanel>
        <ResourcePanel
          title="Центральный каталог"
          state={products}
          empty="Мастер-карточки пока не созданы."
        >
          {products.data.slice(0, 6).map((product) => {
            const summary = getProductSummary(product);
            return (
              <article className={styles.row} key={product.id}>
                <div>
                  <strong>{summary.canonicalName}</strong>
                  <span>{summary.categories}</span>
                </div>
                <div className={styles.rowMeta}>
                  <StatusTag tone={summary.statusTone}>
                    {summary.statusLabel}
                  </StatusTag>
                  <span>{summary.productType}</span>
                  <span>Вариантов: {summary.variants}</span>
                </div>
              </article>
            );
          })}
        </ResourcePanel>
      </div>
    </section>
  );
}

function ResourcePanel<T>({
  title,
  state,
  empty,
  children,
}: {
  title: string;
  state: LoadState<T[]>;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.panel} aria-busy={state.status === "loading"}>
      <div className={styles.panelHeader}>
        <h3>{title}</h3>
        <span>{state.status === "ready" ? state.data.length : ""}</span>
      </div>
      {state.status === "loading" && (
        <LoadingState label={`Загружаем: ${title.toLocaleLowerCase("ru-KZ")}`} />
      )}
      {state.status === "error" && (
        <ErrorState
          title="Источник недоступен"
          description={state.message ?? "Не удалось загрузить данные."}
        />
      )}
      {state.status === "ready" && state.data.length === 0 && (
        <EmptyState title="Нет данных" description={empty} />
      )}
      {state.status === "ready" && state.data.length > 0 && (
        <div className={styles.rows}>{children}</div>
      )}
    </div>
  );
}
