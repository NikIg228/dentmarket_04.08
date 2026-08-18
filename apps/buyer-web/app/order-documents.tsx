"use client";

import { Button } from "@fluentui/react-components";
import type { MarketplaceApiClient, OrderDocumentResponse } from "@marketplace/api-client";
import { StatusTag, errorMessage, formatDate, formatStatus } from "@marketplace/ui";
import { useState } from "react";
import styles from "./order-documents.module.css";

const kindLabel: Record<string, string> = {
  ORDER_SPECIFICATION: "Спецификация",
  INVOICE: "Счёт",
  WAYBILL: "Накладная",
};

export function OrderDocuments({
  orderNumber,
  documents,
  api,
}: {
  orderNumber: string;
  documents: OrderDocumentResponse[];
  api: MarketplaceApiClient;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!documents.length) return null;

  const download = async (document: OrderDocumentResponse) => {
    setBusy(document.id);
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
    <section className={styles.panel} aria-label={`Документы заказа ${orderNumber}`}>
      <header>
        <strong>Документы заказа</strong>
        <span>{documents.length}/3</span>
      </header>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <div className={styles.list}>
        {documents.map((document) => (
          <article className={styles.document} key={document.id}>
            <div>
              <strong>{kindLabel[document.kind] ?? document.title}</strong>
              <p>{document.documentNumber} · {document.format} · {formatDate(document.createdAt, true)}</p>
            </div>
            <StatusTag tone={document.status === "FAILED" ? "danger" : "success"}>{formatStatus(document.status)}</StatusTag>
            <Button appearance="secondary" disabled={busy !== null || !document.fileName} onClick={() => void download(document)}>
              {busy === document.id ? "Скачиваем…" : "Скачать"}
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
