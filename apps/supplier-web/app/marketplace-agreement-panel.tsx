"use client";

import { Spinner } from "@fluentui/react-components";
import { CheckmarkCircle24Regular } from "@fluentui/react-icons/svg/checkmark-circle";
import { Document24Regular } from "@fluentui/react-icons/svg/document";
import { ShieldCheckmark24Regular } from "@fluentui/react-icons/svg/shield-checkmark";
import { Warning24Regular } from "@fluentui/react-icons/svg/warning";
import { MarketplaceApiClient, type ApiContext } from "@marketplace/api-client";
import { NcalayerClient } from "@marketplace/eds-client";
import { DmButton, DmField, DmInput, ErrorState, PageHeader, Section, StatusTag, errorMessage, formatDate, formatStatus } from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./marketplace-agreement-panel.module.css";
import { agreementSigningMode, agreementSigningStep, signingErrorMessage } from "./marketplace-agreement-signing";

const DEMO_SUPPLIER_USER_ID = "00000000-0000-4000-8000-000000000510";

type Agreement = {
  id: string;
  agreementNumber: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  renewalMode: string;
  autoRenew: boolean;
  renewalCount: number;
  lastRenewedAt: string | null;
  document: { id: string; status: string; checksumSha256: string | null; signatures: Array<{ id: string; signerOrganizationId: string | null; signerName: string | null; status: string; method: string; signedAt: string | null; externalSessionId?: string | null }> };
  signing: { available: boolean; party: "SUPPLIER" | "OPERATOR" | null; alreadySigned: boolean; supplierSigned: boolean; operatorSigned: boolean; reason: string | null };
};

type CurrentAgreement = { signingRequired: boolean; signingAvailable?: boolean; agreement: Agreement | null; previousAgreement?: { agreementNumber: string; status: string; endsAt: string | null } | null };
type SigningPhase = "idle" | "creating" | "ncalayer" | "verifying" | "redirecting";

export function MarketplaceAgreementPanel({ supplierId, supplierName = "Поставщик", apiContext }: { supplierId: string; supplierName?: string; apiContext?: ApiContext }) {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", apiContext ?? { actorId: DEMO_SUPPLIER_USER_ID, organizationId: supplierId }), [apiContext, supplierId]);
  const [state, setState] = useState<CurrentAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [signingPhase, setSigningPhase] = useState<SigningPhase>("idle");
  const [nonRenewalReason, setNonRenewalReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setState(await api.get<CurrentAgreement>("/marketplace-agreements/current")); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [api, supplierId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const initiate = async () => {
    setBusy(true); setError(null);
    try { await api.post("/marketplace-agreements", { renewalMode: "AUTO_ANNUAL" }); await refresh(); window.dispatchEvent(new Event("dentmarket:onboarding-changed")); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  const sign = async () => {
    if (!state?.agreement) return;
    setBusy(true); setError(null); setFeedback(null); setSigningPhase("creating");
    try {
      const mode = agreementSigningMode(navigator.userAgent);
      const result = await api.post<{ signature: { id: string; status: string }; signingUrl?: string | null }>(`/marketplace-agreements/${state.agreement.id}/sign`, { signerName: supplierName, expiresInMinutes: 60, signingMode: mode });
      const step = agreementSigningStep(mode, result);
      if (step.kind === "redirect") {
        setSigningPhase("redirecting");
        window.location.assign(step.url);
        return;
      }
      if (step.kind === "local") {
        setSigningPhase("ncalayer");
        const document = await api.download(`/documents/${state.agreement.document.id}/download`);
        const bytes = new Uint8Array(await document.blob.arrayBuffer());
        const signed = await new NcalayerClient({ locale: "ru" }).signCmsDetached(bytes);
        if (!state.agreement.document.checksumSha256 || signed.dataChecksumSha256.toLowerCase() !== state.agreement.document.checksumSha256.toLowerCase()) throw new Error("Хеш документа изменился перед подписанием. Обновите страницу и повторите попытку.");
        setSigningPhase("verifying");
        await api.post("/documents/signatures/browser", { signatureId: step.signatureId, signedContainerBase64: signed.signedContainerBase64, dataChecksumSha256: signed.dataChecksumSha256 });
        setFeedback("ЭЦП проверена. Статус договора обновлён.");
      }
      await refresh();
      window.dispatchEvent(new Event("dentmarket:onboarding-changed"));
    } catch (cause) { setError(signingErrorMessage(cause)); }
    finally { setBusy(false); setSigningPhase("idle"); }
  };

  const requestNonRenewal = async () => {
    if (!state?.agreement || nonRenewalReason.trim().length < 3) return;
    setBusy(true); setError(null);
    try { await api.post(`/marketplace-agreements/${state.agreement.id}/non-renewal`, { reason: nonRenewalReason.trim() }); setNonRenewalReason(""); await refresh(); window.dispatchEvent(new Event("dentmarket:onboarding-changed")); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  const download = async () => {
    if (!state?.agreement) return;
    setBusy(true); setError(null);
    try {
      const result = await api.download(`/documents/${state.agreement.document.id}/download`);
      const url = URL.createObjectURL(result.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.fileName ?? `${state.agreement.agreementNumber}.pdf`; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  if (loading) return <div className={styles.loading}><Spinner label="Проверяем договор" /></div>;
  if (error && !state) return <ErrorState description={error} action={<DmButton onClick={() => void refresh()}>Повторить</DmButton>} />;
  const agreement = state?.agreement;
  const active = agreement && ["ACTIVE", "NON_RENEWING"].includes(agreement.status);
  const signingLabel = signingPhase === "creating" ? "Создаём сессию…" : signingPhase === "ncalayer" ? "Ожидаем NCALayer…" : signingPhase === "verifying" ? "Проверяем ЭЦП…" : signingPhase === "redirecting" ? "Переходим к подписи…" : "Подписать договор ЭЦП";

  return <div className={styles.stack}>
    <PageHeader eyebrow="Документы" title="Договор с DentMarket" description="Подпишите договор через ЭЦП. Он действует 12 месяцев и продлевается ежегодно." actions={<DmButton appearance="secondary" icon={<Document24Regular />} disabled={!agreement || busy} onClick={() => void download()}>Скачать договор</DmButton>} />
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    {feedback ? <div className={styles.success} role="status">{feedback}</div> : null}
    {!agreement ? <Section>
      <div className={styles.callout}>
        <span className={styles.warning}><Warning24Regular /></span>
        <div><h2>Подпишите договор</h2><p>До подписания нельзя публиковать предложения и подтверждать новые заказы.</p>{state?.previousAgreement ? <small>Предыдущий договор {state.previousAgreement.agreementNumber}: {formatStatus(state.previousAgreement.status)}</small> : null}</div>
        <DmButton appearance="primary" disabled={busy} onClick={() => void initiate()}>{busy ? "Формируем…" : "Сформировать договор"}</DmButton>
      </div>
    </Section> : <>
      <div className={styles.hero} data-active={active ? "true" : "false"}>
        <span className={styles.heroIcon}>{active ? <ShieldCheckmark24Regular /> : <Document24Regular />}</span>
        <div><span className={styles.kicker}>{agreement.agreementNumber}</span><h2>{active ? "Договор действует" : "Договор ожидает подписания"}</h2><p>{active ? `Коммерческий доступ открыт до ${formatDate(agreement.endsAt)}. Окно повторной подписи недоступно.` : "Активация произойдёт автоматически после двух валидных подписей ЭЦП."}</p></div>
        <StatusTag tone={active ? "success" : "warning"}>{formatStatus(agreement.status)}</StatusTag>
      </div>
      <div className={styles.columns}>
        <Section title="Подписи ЭЦП" description="Обе стороны подписывают одну и ту же версию документа.">
          <div className={styles.signatures}>
            <SignatureRow label="Поставщик" signed={agreement.signing.supplierSigned} />
            <SignatureRow label="DentMarket KZ" signed={agreement.signing.operatorSigned} />
          </div>
          {agreement.signing.available && agreement.signing.party === "SUPPLIER" ? <div className={styles.action}><DmButton appearance="primary" disabled={busy} onClick={() => void sign()}>{busy ? signingLabel : "Подписать договор ЭЦП"}</DmButton></div> : null}
          {!active && agreement.signing.reason === "awaiting_counterparty" ? <p className={styles.hint}>Эта сторона уже подписала документ. Ожидаем вторую ЭЦП.</p> : null}
        </Section>
        <Section title="Срок и пролонгация" description="Повторная подпись нужна только при изменении обязательных условий или завершении договора.">
          <dl className={styles.details}><div><dt>Начало</dt><dd>{formatDate(agreement.startsAt)}</dd></div><div><dt>Окончание</dt><dd>{formatDate(agreement.endsAt)}</dd></div><div><dt>Режим</dt><dd>{agreement.renewalMode === "AUTO_ANNUAL" ? "Автоматически каждый год" : "Ежегодное подтверждение"}</dd></div><div><dt>Продлений</dt><dd>{agreement.renewalCount}</dd></div></dl>
          {agreement.status === "ACTIVE" ? <div className={styles.action}><DmField label="Не продлевать после окончания" hint="Договор продолжит действовать до указанной даты."><DmInput value={nonRenewalReason} onChange={(_, data) => setNonRenewalReason(data.value)} placeholder="Укажите причину" /></DmField><DmButton appearance="secondary" disabled={busy || nonRenewalReason.trim().length < 3} onClick={() => void requestNonRenewal()}>Отключить пролонгацию</DmButton></div> : agreement.status === "NON_RENEWING" ? <p className={styles.hint}>Автопролонгация отключена. Договор действует до {formatDate(agreement.endsAt)}.</p> : null}
        </Section>
      </div>
    </>}
  </div>;
}

function SignatureRow({ label, signed }: { label: string; signed: boolean }) {
  return <div className={styles.signature}><span data-signed={signed ? "true" : "false"}>{signed ? <CheckmarkCircle24Regular /> : <Warning24Regular />}</span><div><strong>{label}</strong><small>{signed ? "ЭЦП проверена" : "Ожидает подписи"}</small></div><StatusTag tone={signed ? "success" : "warning"}>{signed ? "Подписано" : "Ожидает"}</StatusTag></div>;
}
