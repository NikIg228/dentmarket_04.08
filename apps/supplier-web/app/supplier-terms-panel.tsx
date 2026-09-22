"use client";

import { Checkbox } from "@fluentui/react-components";
import { MarketplaceApiClient, type ApiContext } from "@marketplace/api-client";
import type { SupplierTermsState } from "@marketplace/schemas";
import { DmButton, DmField, DmInput, DmFeedback, ErrorState, LoadingState, Section, StatusTag, errorMessage, formatDate } from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SupplierTermsReader } from "./supplier-terms-reader";
import styles from "./supplier-terms.module.css";

export function SupplierTermsPanel({ apiContext }: { apiContext: ApiContext }) {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", apiContext), [apiContext]);
  const [state, setState] = useState<SupplierTermsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null); setState(null);
    try { setState(await api.getSupplierTerms()); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  const download = async () => {
    if (!state?.acceptance) return;
    setBusy(true); setError(null);
    try {
      const result = await api.downloadSupplierTerms(state.acceptance.id);
      const url = URL.createObjectURL(result.blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = result.fileName ?? "supplier-terms.txt"; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  if (loading) return <LoadingState label="Загружаем договор и статус допуска" />;
  if (!state) return <ErrorState description={error ?? "Не удалось загрузить договор"} action={<DmButton onClick={() => void load()}>Повторить</DmButton>} />;
  return <Section title="Договор с площадкой" description="Общие условия работы продавца и проверка поставщика оператором.">
    <div className={styles.stack}>
      <div className={styles.statuses}>
        <StatusTag tone={state.contractAccepted ? "success" : "warning"}>{state.contractAccepted ? "Договор принят" : "Договор не принят"}</StatusTag>
        <StatusTag tone={state.admitted ? "success" : "warning"}>{state.admitted ? "Поставщик допущен к работе" : "Поставщик не допущен к работе"}</StatusTag>
      </div>
      {state.legacyAgreementActive ? <p>Ранее оформленный договор действует. Его экземпляр доступен в архиве документов.</p> : null}
      {state.acceptance ? <div>
        <p>Принято {formatDate(state.acceptance.acceptedAt, true)} · {state.acceptance.representativeName} · {state.acceptance.legalName}</p>
        {state.acceptance.admissionStatus === "PENDING" ? <p>Оператор проверяет организацию и полномочия представителя. Принятие договора само по себе не открывает продажи.</p> : null}
        {state.acceptance.reviewReason ? <p>Решение оператора: {state.acceptance.reviewReason}</p> : null}
        <DmButton disabled={busy} onClick={() => void download()}>Скачать принятые условия</DmButton>
      </div> : null}
      {error ? <DmFeedback tone="danger" title="Действие не выполнено" description={error} alert /> : null}
      <DmButton appearance="secondary" disabled={busy} onClick={() => void load()}>Обновить статус</DmButton>
      {!state.contractAccepted ? <AcceptanceForm key={`${apiContext.organizationId}:${state.organization.version}:${state.bundle.hash}`} state={state} busy={busy} onAccept={async (viewed, authority) => {
        setBusy(true); setError(null);
        try {
          await api.acceptSupplierTerms({ organizationVersion: state.organization.version, bundleHash: state.bundle.hash, reviewedDocuments: state.bundle.documents.filter((document) => viewed.has(document.hash)).map(({ code, hash }) => ({ code, hash })), acknowledged: true, actsForOrganization: true, representativeAuthority: authority });
          await load(); window.dispatchEvent(new Event("dentmarket:onboarding-changed"));
        } catch (cause) { setError(errorMessage(cause)); }
        finally { setBusy(false); }
      }} /> : null}
    </div>
  </Section>;
}

function AcceptanceForm({ state, busy, onAccept }: { state: SupplierTermsState; busy: boolean; onAccept: (viewed: Set<string>, authority: string) => Promise<void> }) {
  const [selected, setSelected] = useState(0);
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [authority, setAuthority] = useState("");
  const onViewed = useCallback((hash: string) => setViewed((previous) => new Set(previous).add(hash)), []);
  const document = state.bundle.documents[selected];
  const allViewed = state.bundle.documents.length > 0 && state.bundle.documents.every((item) => viewed.has(item.hash));
  return <div className={styles.stack}>
    <p>Организация: <strong>{state.organization.legalName}</strong> · БИН {state.organization.bin}. Представитель: {state.organization.representativeName}.</p>
    {!state.bundle.available ? <DmFeedback tone="warning" title="Документы готовятся" description="Юридические тексты пока не опубликованы. Принятие договора станет доступно после их публикации." /> : null}
    <p id="terms-reading-help">Просмотрите содержимое каждого документа. Документы о персональных данных имеют отдельное назначение и не заменяют договор с продавцом.</p>
    <nav className={styles.documentTabs} aria-label="Документы для ознакомления">{state.bundle.documents.map((item, index) => <DmButton key={item.code} appearance={index === selected ? "primary" : "secondary"} aria-pressed={index === selected} onClick={() => setSelected(index)}>{item.title}{viewed.has(item.hash) ? " — просмотрено" : ""}</DmButton>)}</nav>
    {document ? <article>
      <h3>{document.title}</h3><p>{document.status === "DRAFT" ? "Черновик" : `Редакция ${document.version}`} · <a href={`/legal/${document.code}`} target="_blank" rel="noreferrer">Открыть страницу документа</a></p>
      <SupplierTermsReader key={document.hash} document={document} onViewed={onViewed} />
    </article> : null}
    <p role="status" aria-live="polite">Просмотрено документов: {viewed.size} из {state.bundle.documents.length}</p>
    <DmField label="Основание полномочий" hint="Например, руководитель на основании устава или представитель по доверенности."><DmInput value={authority} maxLength={500} onChange={(_, data) => setAuthority(data.value)} /></DmField>
    <Checkbox checked={confirmed} onChange={(_, data) => setConfirmed(data.checked === true)} label="Принимаю договор, тарифы и правила от имени организации; подтверждаю свои полномочия и ознакомление с документами о персональных данных." />
    <p id="terms-submit-help">Кнопка станет доступна после просмотра всех документов и подтверждения полномочий. После принятия потребуется допуск оператора.</p>
    <DmButton appearance="primary" aria-describedby="terms-submit-help" disabled={busy || !state.bundle.available || !allViewed || !confirmed || authority.trim().length < 3} onClick={() => void onAccept(viewed, authority.trim())}>{busy ? "Сохраняем…" : "Ознакомлен"}</DmButton>
  </div>;
}
