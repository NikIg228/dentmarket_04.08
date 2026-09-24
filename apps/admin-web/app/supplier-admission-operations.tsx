"use client";

import { Checkbox } from "@fluentui/react-components";
import { MarketplaceApiClient } from "@marketplace/api-client";
import type { OrganizationOnboarding, SupplierTermsAcceptance, ReviewSupplierAdmissionInput } from "@marketplace/schemas";
import { DmButton, DmField, DmInput, DmFeedback, EmptyState, ErrorState, LoadingState, StatusTag, errorMessage, formatDate } from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApiContext } from "./admin-auth";
import styles from "./agreement-operations.module.css";

const labels = { PENDING: "Ожидает проверки", APPROVED: "Поставщик допущен к работе", REJECTED: "Допуск отклонён", SUSPENDED: "Допуск приостановлен" };

export function SupplierAdmissionOperations() {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", adminApiContext()), []);
  const [items, setItems] = useState<SupplierTermsAcceptance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems((await api.getSupplierAdmissions()).items); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  const download = async (id: string) => {
    setBusy(true); setError(null);
    try { const file = await api.downloadSupplierTerms(id); const url = URL.createObjectURL(file.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.fileName ?? "supplier-terms.txt"; anchor.click(); URL.revokeObjectURL(url); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <section className={styles.panel} id="agreements" aria-label="Договоры и допуск поставщиков">
    <h2>Договоры и допуск поставщиков</h2><p>Принятие договора и проверка поставщика — отдельные этапы. Для допуска проверьте организацию и полномочия представителя.</p>
    <DmButton disabled={busy} onClick={() => void load()}>Обновить список</DmButton>
    {feedback ? <DmFeedback tone="success" title="Решение сохранено" description={feedback} /> : null}
    {error ? <ErrorState description={error} /> : null}
    {loading ? <LoadingState label="Загружаем принятые договоры" /> : !items.length && !error ? <EmptyState title="Заявок пока нет" description="Поставщики появятся здесь после принятия опубликованных условий." /> : items.map((item) => <article key={item.id} className="mp-stack">
      <h3>{item.legalName} · БИН {item.bin}</h3>
      <div className="mp-inline-actions"><StatusTag tone="success">Договор принят</StatusTag><StatusTag tone={item.admissionStatus === "APPROVED" ? "success" : "warning"}>{labels[item.admissionStatus]}</StatusTag></div>
      <p>{item.representativeName} · {item.representativeAuthority} · {formatDate(item.acceptedAt, true)}</p>
      <p>Документы: {item.documents.map((document) => `${document.title} (${document.version})`).join("; ")}</p>
      {item.reviewReason ? <p>Последнее решение: {item.reviewReason}</p> : null}
      <div className="mp-inline-actions"><DmButton disabled={busy} onClick={() => void download(item.id)}>Скачать принятые условия</DmButton><DmButton disabled={busy} onClick={() => setSelected(item.id)}>Проверить поставщика</DmButton></div>
      {selected === item.id ? <AdmissionReview key={`${item.id}:${item.version}`} api={api} item={item} busy={busy} onSubmit={async (input) => {
        setBusy(true); setError(null); setFeedback(null);
        try { await api.reviewSupplierAdmission(item.id, input); setSelected(null); setFeedback(`${item.legalName}: ${labels[input.status]}`); await load(); }
        catch (cause) { setError(errorMessage(cause)); }
        finally { setBusy(false); }
      }} /> : null}
    </article>)}
  </section>;
}

function AdmissionReview({ api, item, busy, onSubmit }: { api: MarketplaceApiClient; item: SupplierTermsAcceptance; busy: boolean; onSubmit: (input: ReviewSupplierAdmissionInput) => Promise<void> }) {
  const [organizationVerified, setOrganizationVerified] = useState(false);
  const [representativeVerified, setRepresentativeVerified] = useState(false);
  const [reason, setReason] = useState("");
  const [onboarding, setOnboarding] = useState<OrganizationOnboarding | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cities, setCities] = useState<Array<{ id: string; nameRu: string }>>([]);
  const load = useCallback(async () => {
    setLoadError(null);
    try { const [value, locations] = await Promise.all([api.getOperatorOrganizationOnboarding(item.organizationId), api.get<Array<{ id: string; nameRu: string }>>("/catalog/cities")]); setOnboarding(value); setCities(locations); }
    catch (cause) { setOnboarding(null); setLoadError(errorMessage(cause)); }
  }, [api, item.organizationId]);
  useEffect(() => { void load(); }, [load]);
  const ready = onboarding?.steps.filter(step => step.id !== "admission").every(step => step.complete) ?? false;
  const profile = onboarding?.organization.profile;
  const address = (value: NonNullable<typeof profile>["legalAddress"]) => [cities.find(city => city.id === value.cityId)?.nameRu, value.line1, value.postalCode].filter(Boolean).join(", ");
  const submit = (status: ReviewSupplierAdmissionInput["status"]) => onSubmit({ expectedVersion: item.version, status, organizationVerified, representativeVerified, reason: reason.trim() });
  return <div className="mp-stack">
    {loadError ? <DmFeedback tone="danger" title="Не удалось загрузить анкету" description={loadError} action={<DmButton onClick={() => void load()}>Повторить</DmButton>} /> : !onboarding ? <LoadingState label="Проверяем анкету и документы" /> : null}
    {profile ? <dl><dt>Контактное лицо</dt><dd>{profile.contactName} · {profile.phone} · {profile.email}</dd><dt>Юридический адрес</dt><dd>{address(profile.legalAddress)}</dd><dt>Адрес доставки</dt><dd>{address(profile.deliveryAddress)}</dd></dl> : null}
    {onboarding?.steps.filter(step => step.id !== "admission" && !step.complete).map(step => <DmFeedback key={step.id} tone="warning" title={step.label} description={step.reason ?? "Шаг ещё не завершён"} />)}
    <Checkbox checked={organizationVerified} onChange={(_, data) => setOrganizationVerified(data.checked === true)} label="Организация и реквизиты проверены" />
    <Checkbox checked={representativeVerified} onChange={(_, data) => setRepresentativeVerified(data.checked === true)} label="Полномочия представителя проверены" />
    <DmField label="Основание решения" hint="Укажите результат проверки либо необходимые исправления."><DmInput value={reason} maxLength={1000} onChange={(_, data) => setReason(data.value)} /></DmField>
    <div className="mp-inline-actions">
      <DmButton appearance="primary" disabled={busy || !ready || reason.trim().length < 3 || !organizationVerified || !representativeVerified} onClick={() => void submit("APPROVED")}>Допустить к работе</DmButton>
      <DmButton disabled={busy || reason.trim().length < 3} onClick={() => void submit("REJECTED")}>Отклонить допуск</DmButton>
      {item.admissionStatus === "APPROVED" ? <DmButton disabled={busy || reason.trim().length < 3} onClick={() => void submit("SUSPENDED")}>Приостановить допуск</DmButton> : null}
    </div>
  </div>;
}
