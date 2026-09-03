"use client";

import {
  DmButton,
  DmFeedback,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusTag,
} from "@marketplace/ui";
import { MarketplaceApiClient } from "@marketplace/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./agreement-operations.module.css";
import { adminApiContext } from "./admin-auth";
import {
  agreementSignatureTone,
  buildAgreementAction,
  type AgreementSigning,
} from "./agreement-operations-view-model";

type Agreement = {
  id: string;
  agreementNumber: string;
  supplierOrganizationId: string;
  createdAt: string;
  document: { checksumSha256: string | null };
  signing: AgreementSigning;
};

type Feedback = {
  tone: "success" | "warning" | "danger";
  title: string;
  description: string;
};

const dateFormatter = new Intl.DateTimeFormat("ru-KZ", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AgreementOperations() {
  const api = useMemo(
    () =>
      new MarketplaceApiClient(
        process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api",
        adminApiContext(),
      ),
    [],
  );
  const [items, setItems] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(
        await api.get<Agreement[]>("/marketplace-agreements/operator/pending"),
      );
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : "Не удалось загрузить договоры",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sign = async (agreement: Agreement) => {
    setBusy(agreement.id);
    setFeedback(null);
    try {
      const result = await api.post<{
        signature: { status: string };
        signingUrl?: string | null;
      }>(
        `/marketplace-agreements/${agreement.id}/sign`,
        { signerName: "DentMarket KZ", expiresInMinutes: 60 },
      );
      if (result.signingUrl) {
        window.open(result.signingUrl, "_blank", "noopener,noreferrer");
      }
      await refresh();
      setFeedback({
        tone:
          result.signingUrl || result.signature.status === "SIGNED"
            ? "success"
            : "warning",
        title: "Запрос на подпись создан",
        description: result.signingUrl
          ? "Сессия ЭЦП открыта в новой вкладке. После подписания обновите список."
          : result.signature.status === "SIGNED"
            ? "ЭЦП подтверждена сервисом подписи."
            : "Сессия создана, но ссылка на подписание не получена. Обновите список или повторите действие.",
      });
    } catch (cause) {
      setFeedback({
        tone: "danger",
        title: "Не удалось открыть ЭЦП",
        description:
          cause instanceof Error ? cause.message : "Повторите попытку позднее.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.panel} id="agreements" aria-label="Договоры с поставщиками">
      <header>
        <div>
          <p>Договоры с поставщиками</p>
          <h2>Ожидают подписи ЭЦП</h2>
        </div>
        <DmButton
          appearance="secondary"
          onClick={() => {
            setFeedback(null);
            void refresh();
          }}
          disabled={loading || Boolean(busy)}
        >
          Обновить
        </DmButton>
      </header>

      {feedback ? (
        <div className={styles.feedback}>
          <DmFeedback
            tone={feedback.tone}
            title={feedback.title}
            description={feedback.description}
            alert={feedback.tone === "danger"}
          />
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Проверяем договоры" />
      ) : loadError ? (
        <ErrorState
          title="Договоры недоступны"
          description={loadError}
          action={
            <DmButton appearance="secondary" onClick={() => void refresh()}>
              Повторить
            </DmButton>
          }
        />
      ) : !items.length ? (
        <EmptyState
          title="Новых договоров нет"
          description="Все доступные договоры уже подписаны командой DentMarket."
        />
      ) : (
        <div className={styles.list}>
          {items.map((item) => {
            const action = buildAgreementAction(item.signing, busy === item.id);
            return (
              <article key={item.id}>
                <div className={styles.identity}>
                  <strong>{item.agreementNumber}</strong>
                  <span>ID поставщика: {item.supplierOrganizationId}</span>
                  <small>Создан {dateFormatter.format(new Date(item.createdAt))}</small>
                  {item.document.checksumSha256 ? (
                    <small>Контрольная сумма: {item.document.checksumSha256.slice(0, 12)}…</small>
                  ) : null}
                </div>
                <div className={styles.signatures} aria-label="Статус подписей">
                  <StatusTag tone={agreementSignatureTone(item.signing.supplierSigned)}>
                    Поставщик: {item.signing.supplierSigned ? "подписал" : "ожидается"}
                  </StatusTag>
                  <StatusTag tone={agreementSignatureTone(item.signing.operatorSigned)}>
                    DentMarket: {item.signing.operatorSigned ? "подписал" : "ожидается"}
                  </StatusTag>
                </div>
                <div className={styles.action}>
                  <DmButton
                    appearance="primary"
                    disabled={action.disabled || Boolean(busy)}
                    onClick={() => void sign(item)}
                  >
                    {action.label}
                  </DmButton>
                  {!item.signing.available && item.signing.reason ? (
                    <small>Причина: {item.signing.reason}</small>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer>Договор начнёт действовать после двух подтверждённых подписей.</footer>
    </section>
  );
}
