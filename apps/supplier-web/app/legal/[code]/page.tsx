"use client";

import { MarketplaceApiClient } from "@marketplace/api-client";
import type { SupplierLegalBundle } from "@marketplace/schemas";
import { DmButton, ErrorState, LoadingState } from "@marketplace/ui";
import { use, useEffect, useState } from "react";
import styles from "../../supplier-terms.module.css";

export default function SupplierLegalPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [bundle, setBundle] = useState<SupplierLegalBundle | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false; setBundle(null); setError(false);
    const api = new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", {});
    void api.getSupplierLegalDocuments().then((value) => { if (!cancelled) setBundle(value); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [code, attempt]);
  const document = bundle?.documents.find((item) => item.code === code);
  return <main className={styles.legalPage}><a href="/">← Кабинет поставщика</a>
    {error ? <ErrorState description="Не удалось загрузить документ" action={<DmButton onClick={() => setAttempt((value) => value + 1)}>Повторить</DmButton>} /> : !bundle ? <LoadingState label="Загружаем документ" /> : !document ? <h1>Документ не найден</h1> : <>
      <h1>{document.title}</h1><p>{document.status === "DRAFT" ? "Документ готовится" : `Редакция ${document.version}`}</p>
      {document.content ? <article className={styles.text}>{document.content}</article> : <p>Текст пока не опубликован.</p>}
    </>}
  </main>;
}
