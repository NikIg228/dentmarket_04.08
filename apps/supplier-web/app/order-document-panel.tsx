"use client";

import { Spinner } from "@fluentui/react-components";
import type { MarketplaceApiClient, OrderDocumentResponse } from "@marketplace/api-client";
import {
  DmButton as Button,
  DmFeedback,
  StatusTag,
  errorMessage,
  formatDate,
  formatStatus,
} from "@marketplace/ui";
import { useState } from "react";
import styles from "./order-document-panel.module.css";

const kindLabel: Record<string, string> = {
  ORDER_SPECIFICATION: "Спецификация",
  INVOICE: "Счёт",
  WAYBILL: "Накладная",
};

type DocumentOrder = {
  id: string;
  orderNumber: string;
  status?: string;
  documents?: OrderDocumentResponse[];
  shipments?: Array<{ id: string; status: string }>;
};

export function OrderDocumentPanel({
  order,
  api,
  onChanged,
}: {
  order: DocumentOrder;
  api: MarketplaceApiClient;
  onChanged: () => Promise<void>;
}) {
  const documents = order.documents ?? [];
  const shipment = order.shipments?.find(({ status }) =>
    ["DISPATCHED", "IN_TRANSIT", "PARTIALLY_DELIVERED", "DELIVERED"].includes(status),
  );
  const prepaymentDocumentsReady = ["ORDER_SPECIFICATION", "INVOICE"].every((kind) => documents.some((document) => document.kind === kind));
  const canPrepare = !order.status || !["DRAFT", "AWAITING_CONFIRMATION", "REJECTED", "CANCELLED"].includes(order.status);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const generate = async () => {
    if (!shipment) return;
    setBusy("generate");
    setError(null);
    setSuccess(null);
    try {
      await api.generateOrderDocumentPack(order.id, { shipmentId: shipment.id });
      await onChanged();
      setSuccess("Комплект сформирован из подтверждённых данных заказа.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const prepare = async () => {
    setBusy("prepare");
    setError(null);
    setSuccess(null);
    try {
      await api.prepareOrderDocuments(order.id);
      await onChanged();
      setSuccess("Спецификация и счёт сформированы. Счёт можно передать клинике до оплаты.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const download = async (document: OrderDocumentResponse) => {
    setBusy(`download:${document.id}`);
    setError(null);
    try {
      const result = await api.download(`/documents/${document.id}/download`);
      const url = URL.createObjectURL(result.blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName ?? `${document.documentNumber}.${document.format.toLowerCase()}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.panel} aria-label={`Документы заказа ${order.orderNumber}`}>
      <header className={styles.header}>
        <div>
          <strong>Документы заказа</strong>
          <p>Спецификация, счёт и накладная формируются из зафиксированных данных.</p>
        </div>
        <span>{documents.length}/3</span>
      </header>
      {error ? <DmFeedback tone="danger" title="Документы не обновлены" description={error} alert /> : null}
      {success ? <DmFeedback tone="success" title="Комплект обновлён" description={success} /> : null}
      {documents.length ? (
        <div className={styles.list}>
          {documents.map((document) => (
            <article className={styles.document} key={document.id}>
              <div>
                <strong>{kindLabel[document.kind] ?? document.title}</strong>
                <p>{document.documentNumber} · {document.format} · {formatDate(document.createdAt, true)}</p>
              </div>
              <StatusTag tone={document.status === "FAILED" ? "danger" : "success"}>{formatStatus(document.status)}</StatusTag>
              <Button appearance="secondary" disabled={busy !== null || !document.fileName} onClick={() => void download(document)}>
                {busy === `download:${document.id}` ? "Скачиваем…" : "Скачать"}
              </Button>
            </article>
          ))}
        </div>
      ) : <p className={styles.empty}>Комплект ещё не сформирован.</p>}
      {!prepaymentDocumentsReady && canPrepare ? (
        <Button appearance="primary" disabled={busy !== null} onClick={() => void prepare()}>
          {busy === "prepare" ? <Spinner size="tiny" label="Формируем" /> : "Сформировать спецификацию и счёт"}
        </Button>
      ) : !prepaymentDocumentsReady ? <p className={styles.notice}>Счёт и спецификация станут доступны после подтверждения заказа.</p> : documents.length < 3 ? (
        shipment ? (
          <Button appearance="primary" disabled={busy !== null} onClick={() => void generate()}>
            {busy === "generate" ? <Spinner size="tiny" label="Формируем" /> : "Сформировать документы"}
          </Button>
        ) : <p className={styles.notice}>Формирование станет доступно после передачи отгрузки перевозчику.</p>
      ) : null}
    </section>
  );
}
