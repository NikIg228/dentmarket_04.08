"use client";

import { Button, Spinner } from "@fluentui/react-components";
import type { MarketplaceApiClient, OrderDocumentResponse } from "@marketplace/api-client";
import { StatusTag, errorMessage, formatDate, formatStatus } from "@marketplace/ui";
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
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {success ? <div className={styles.success} role="status">{success}</div> : null}
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
      {documents.length < 3 ? (
        shipment ? (
          <Button appearance="primary" disabled={busy !== null} onClick={() => void generate()}>
            {busy === "generate" ? <Spinner size="tiny" label="Формируем" /> : "Сформировать документы"}
          </Button>
        ) : <p className={styles.notice}>Формирование станет доступно после передачи отгрузки перевозчику.</p>
      ) : null}
    </section>
  );
}
