"use client";

import { ProgressBar } from "@fluentui/react-components";
import { CheckmarkCircle20Regular } from "@fluentui/react-icons/svg/checkmark-circle";
import { Circle20Regular } from "@fluentui/react-icons/svg/circle";
import { MarketplaceApiClient, type ApiContext } from "@marketplace/api-client";
import type { OrganizationOnboarding } from "@marketplace/schemas";
import { DmButton as Button, DmFeedback, DmField as Field, DmInput as Input, DmSelect as Select, LoadingState, OrganizationProfileForm, errorMessage } from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./onboarding-progress.module.css";

export function OnboardingProgress({ apiContext, supplierId, onNavigate }: { apiContext: ApiContext; supplierId: string; onNavigate: (section: string) => void }) {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", apiContext), [apiContext]);
  const [progress, setProgress] = useState<OrganizationOnboarding | null>(null);
  const [cities, setCities] = useState<Array<{ id: string; nameRu: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [warehouse, setWarehouse] = useState({ code: "MAIN", name: "Основной склад", cityId: "", addressLine: "" });
  const load = useCallback(async () => {
    try {
      const [value, locations] = await Promise.all([api.getOrganizationOnboarding(), api.get<Array<{ id: string; nameRu: string }>>("/catalog/cities")]);
      if (value.organization.organizationId !== supplierId || value.capability !== "SUPPLIER") throw new Error("Организация поставщика недоступна");
      setProgress(value); setCities(locations); setError(null);
    } catch (cause) { setError(errorMessage(cause)); }
  }, [api, supplierId]);
  useEffect(() => { void load(); const refresh = () => { void load(); }; window.addEventListener("dentmarket:onboarding-changed", refresh); return () => window.removeEventListener("dentmarket:onboarding-changed", refresh); }, [load]);
  if (!progress) return error ? <DmFeedback tone="danger" title="Не удалось проверить готовность" description={error} alert action={<Button onClick={() => void load()}>Повторить</Button>} /> : <LoadingState label="Проверяем готовность организации" />;
  const completed = progress.steps.filter(step => step.complete).length;
  const warehouseMissing = progress.steps.some(step => step.id === "warehouse" && !step.complete);
  return <section className={styles.panel} aria-label="Подключение поставщика">
    <header><div><p>Подключение организации</p><h2>{progress.ready ? "Организация готова к работе" : `${completed} из ${progress.steps.length} шагов завершено`}</h2></div><Button onClick={() => void load()}>Обновить статус</Button></header>
    <ProgressBar value={completed / progress.steps.length} aria-label="Прогресс подключения" />
    {error ? <DmFeedback tone="danger" title="Не удалось сохранить или обновить данные" description={error} alert action={<Button onClick={() => void load()}>Повторить обновление</Button>} /> : null}
    {feedback ? <DmFeedback tone="success" title={feedback} description="Статус подключения обновлён." /> : null}
    <div className={styles.steps}>{progress.steps.map(step => <div key={step.id} data-complete={step.complete}>
      <span aria-hidden>{step.complete ? <CheckmarkCircle20Regular /> : <Circle20Regular />}</span><div><strong>{step.label}</strong><small>{step.complete ? "Готово" : step.reason}</small></div>
      {step.id === "organization" && step.complete && progress.organization.canEdit ? <Button size="small" onClick={() => setEditing(!editing)}>{editing ? "Закрыть форму" : "Изменить анкету"}</Button> : null}
      {!step.complete && (step.action === "compliance" || step.action === "documents") ? <Button size="small" onClick={() => onNavigate(step.action)}>{step.action === "compliance" ? "Документы организации" : "Открыть условия"}</Button> : null}
    </div>)}</div>
    {!progress.organization.complete || editing ? <OrganizationProfileForm key={progress.organization.version} value={progress.organization} cities={cities} onSave={input => api.saveOrganizationProfile(input)} onSaved={() => { setEditing(false); setFeedback("Анкета сохранена"); window.dispatchEvent(new Event("dentmarket:onboarding-changed")); }} /> : null}
    {progress.organization.complete && warehouseMissing ? <form className={styles.formAction} onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(null); setFeedback(null);
      try { await api.post(`/suppliers/${supplierId}/warehouses`, { ...warehouse, timezone: "Asia/Almaty" }); setFeedback("Склад сохранён"); window.dispatchEvent(new Event("dentmarket:onboarding-changed")); }
      catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}><strong>Добавьте склад</strong><div className={styles.fields}>
      <Field label="Код склада" required><Input required minLength={2} maxLength={64} value={warehouse.code} onChange={(_, data) => setWarehouse(value => ({ ...value, code: data.value.toUpperCase() }))} /></Field>
      <Field label="Название склада" required><Input required minLength={2} value={warehouse.name} onChange={(_, data) => setWarehouse(value => ({ ...value, name: data.value }))} /></Field>
      <Field label="Город склада" required><Select required value={warehouse.cityId} onChange={(_, data) => setWarehouse(value => ({ ...value, cityId: data.value }))}><option value="">Выберите город</option>{cities.map(city => <option key={city.id} value={city.id}>{city.nameRu}</option>)}</Select></Field>
      <Field label="Адрес склада" required><Input required minLength={5} maxLength={500} value={warehouse.addressLine} onChange={(_, data) => setWarehouse(value => ({ ...value, addressLine: data.value }))} /></Field>
      <Button type="submit" appearance="primary" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить склад"}</Button>
    </div></form> : null}
    <footer>Принятие общих условий и допуск оператора — отдельные шаги. Для публикации каждого предложения дополнительно проверяются товар, документы и данные партии.</footer>
  </section>;
}
