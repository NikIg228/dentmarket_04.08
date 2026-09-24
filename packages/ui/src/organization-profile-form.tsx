"use client";

import { Checkbox } from "@fluentui/react-components";
import type { OrganizationProfileFields, OrganizationProfileResponse, SaveOrganizationProfileInput } from "@marketplace/schemas";
import { useRef, useState, type FormEvent } from "react";
import { DmButton, DmField, DmInput, DmSelect, DmFeedback, errorMessage } from "./index";

type City = { id: string; nameRu: string; region?: { nameRu: string } };
const blankAddress = { cityId: "", line1: "", postalCode: null };

export function OrganizationProfileForm({ value, cities, onSave, onSaved }: {
  value: OrganizationProfileResponse; cities: City[];
  onSave: (input: SaveOrganizationProfileInput) => Promise<OrganizationProfileResponse>;
  onSaved: (value: OrganizationProfileResponse) => void;
}) {
  const [fields, setFields] = useState<OrganizationProfileFields>(value.profile ?? { contactName: "", phone: "", email: "", legalAddress: { ...blankAddress }, deliveryAddress: { ...blankAddress } });
  const [sameAddress, setSameAddress] = useState(Boolean(value.profile && JSON.stringify(value.profile.legalAddress) === JSON.stringify(value.profile.deliveryAddress)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !value.canEdit) return;
    const data = { ...fields, deliveryAddress: sameAddress ? fields.legalAddress : fields.deliveryAddress, expectedVersion: value.version };
    const fingerprint = JSON.stringify(data);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setError(null);
    try { onSaved(await onSave({ ...data, idempotencyKey: retry.current.key })); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const address = (kind: "legalAddress" | "deliveryAddress", title: string) => <fieldset className="mp-stack" disabled={busy || !value.canEdit}>
    <legend>{title}</legend>
    <DmField label={`${title}: город`} required><DmSelect required value={fields[kind].cityId} onChange={(_, data) => setFields(current => ({ ...current, [kind]: { ...current[kind], cityId: data.value } }))}>
      <option value="">Выберите город</option>{cities.map(city => <option value={city.id} key={city.id}>{city.nameRu}{city.region ? ` · ${city.region.nameRu}` : ""}</option>)}
    </DmSelect></DmField>
    <DmField label={`${title}: улица, дом, помещение`} required><DmInput required minLength={5} maxLength={500} value={fields[kind].line1} onChange={(_, data) => setFields(current => ({ ...current, [kind]: { ...current[kind], line1: data.value } }))} /></DmField>
    <DmField label={`${title}: индекс`}><DmInput maxLength={20} value={fields[kind].postalCode ?? ""} onChange={(_, data) => setFields(current => ({ ...current, [kind]: { ...current[kind], postalCode: data.value || null } }))} /></DmField>
  </fieldset>;
  return <form onSubmit={event => void submit(event)} className="mp-stack" aria-label="Анкета организации">
    <h2>Анкета организации</h2><p>{value.legalName} · БИН {value.bin}</p>
    <p>Укажите контакты для работы с заказами, юридический адрес и адрес доставки.</p>
    {!value.canEdit ? <DmFeedback tone="warning" title="Нужно участие владельца" description="Заполнить анкету может владелец или сотрудник с правом управления организацией." /> : null}
    <DmField label="Контактное лицо" required><DmInput required disabled={busy || !value.canEdit} minLength={2} maxLength={160} autoComplete="name" value={fields.contactName} onChange={(_, data) => setFields(current => ({ ...current, contactName: data.value }))} /></DmField>
    <DmField label="Контактный телефон" required><DmInput type="tel" required disabled={busy || !value.canEdit} minLength={7} maxLength={30} autoComplete="tel" value={fields.phone} onChange={(_, data) => setFields(current => ({ ...current, phone: data.value }))} /></DmField>
    <DmField label="Email организации" required><DmInput type="email" required disabled={busy || !value.canEdit} maxLength={254} autoComplete="email" value={fields.email} onChange={(_, data) => setFields(current => ({ ...current, email: data.value }))} /></DmField>
    {address("legalAddress", "Юридический адрес")}
    <Checkbox disabled={busy || !value.canEdit} checked={sameAddress} label="Адрес доставки совпадает с юридическим" onChange={(_, data) => setSameAddress(data.checked === true)} />
    {!sameAddress ? address("deliveryAddress", "Адрес доставки") : null}
    {error ? <DmFeedback tone="danger" title="Анкета не сохранена" description={error} alert /> : null}
    <p>Изменение реквизитов поставщика потребует повторного принятия условий и проверки допуска.</p>
    <DmButton type="submit" appearance="primary" disabled={busy || !value.canEdit || !cities.length}>{busy ? "Сохраняем…" : "Сохранить анкету и продолжить"}</DmButton>
  </form>;
}
