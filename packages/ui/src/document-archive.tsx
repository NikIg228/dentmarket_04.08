"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Select,
  Spinner,
  Tag,
  Textarea,
} from "@fluentui/react-components";
import { ArrowDownload24Regular } from "@fluentui/react-icons/svg/arrow-download";
import { ArrowSync24Regular } from "@fluentui/react-icons/svg/arrow-sync";
import { Dismiss24Regular } from "@fluentui/react-icons/svg/dismiss";
import { Document24Regular } from "@fluentui/react-icons/svg/document";
import { Search24Regular } from "@fluentui/react-icons/svg/search";
import { useMemo, useState, type ReactNode } from "react";

export type DocumentArchiveParticipantView = {
  organizationId: string;
  role: string;
  organization: { id: string; displayName: string; legalName: string; bin: string };
};

export type DocumentArchiveItemView = {
  id: string;
  ownerOrganizationId: string;
  category: string;
  kind: string;
  format: string;
  source: string;
  status: string;
  accountingStatus: string;
  title: string;
  documentNumber: string;
  documentDate: string;
  amountMinor: string | null;
  currency: string | null;
  version: number;
  fileName: string | null;
  checksumSha256: string | null;
  immutableAt: string | null;
  generatedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
  supplierOrder: { id: string; orderNumber: string; paymentStatus: string } | null;
  participants: DocumentArchiveParticipantView[];
  signatures: Array<{ id: string; signerOrganizationId: string | null; signerName: string | null; method: string; status: string; signedAt: string | null }>;
  versions: Array<{ id: string; version: number; status: string; documentDate: string; createdAt: string }>;
};

export type DocumentArchiveSummaryView = {
  total: number;
  awaitingSignature: number;
  attention: number;
  thisMonth: number;
};

export type DocumentArchiveFilters = {
  q: string;
  category: string;
  status: string;
  accountingStatus: string;
  dateFrom: string;
  dateTo: string;
};

const categoryLabels: Record<string, string> = {
  CONTRACT: "Договоры",
  ORDER: "Заказы",
  PAYMENT: "Оплата",
  SHIPMENT: "Отгрузка",
  CLOSING: "Закрывающие",
  COMPLIANCE: "Разрешительные",
  OTHER: "Прочее",
};

const kindLabels: Record<string, string> = {
  MARKETPLACE_SUPPLIER_AGREEMENT: "Договор с площадкой",
  MARKETPLACE_BUYER_TERMS: "Условия для покупателя",
  FRAMEWORK_SUPPLY_AGREEMENT: "Рамочный договор поставки",
  CONTRACT_ADDENDUM: "Дополнительное соглашение",
  ORDER_SPECIFICATION: "Спецификация",
  ORDER_CONFIRMATION: "Подтверждение заказа",
  INVOICE: "Счёт на оплату",
  PAYMENT_CONFIRMATION: "Подтверждение оплаты",
  REFUND_CONFIRMATION: "Подтверждение возврата",
  WAYBILL: "Накладная",
  ACCEPTANCE_ACT: "Акт приёма-передачи",
  ACCOMPANYING_DOCUMENT: "Сопроводительный документ",
  TAX_CLOSING_DOCUMENT: "Закрывающий документ",
  INSTALLATION_ACT: "Акт монтажа",
  TRAINING_ACT: "Акт обучения",
  WARRANTY: "Гарантия",
  COMMISSIONING_ACT: "Акт ввода в эксплуатацию",
  REGISTRATION_CERTIFICATE: "Регистрационное удостоверение",
  LICENSE: "Лицензия",
  CERTIFICATE: "Сертификат",
  OTHER: "Прочий документ",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Черновик",
  GENERATING: "Формируется",
  GENERATED: "Готов",
  AWAITING_SIGNATURE: "Ожидает подписи",
  PARTIALLY_SIGNED: "Подписан частично",
  SIGNED: "Подписан",
  REJECTED: "Отклонён",
  EXPIRED: "Истёк",
  SUPERSEDED: "Есть новая версия",
  ARCHIVED: "Архивирован",
  FAILED: "Ошибка",
  NOT_APPLICABLE: "Не требуется",
  PENDING_REVIEW: "На проверке",
  REVIEWED: "Проверен",
  RECONCILED: "Сверен",
  DISPUTED: "Есть расхождение",
};

const formatDate = (value: string) => new Intl.DateTimeFormat("ru-KZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const formatMoney = (minor: string | null, currency: string | null) => {
  if (!minor || !currency) return "—";
  const amount = Number(minor) / 100;
  return Number.isSafeInteger(Number(minor))
    ? new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
    : `${minor} ${currency}`;
};

function DocumentStatus({ value }: { value: string }) {
  const tone = ["SIGNED", "GENERATED", "RECONCILED", "REVIEWED"].includes(value)
    ? "success"
    : ["FAILED", "REJECTED", "DISPUTED", "EXPIRED"].includes(value)
      ? "danger"
      : ["AWAITING_SIGNATURE", "PARTIALLY_SIGNED", "PENDING_REVIEW"].includes(value)
        ? "warning"
        : "brand";
  return <Tag appearance="outline" className={`dm-document-tag dm-document-tag-${tone}`}>{statusLabels[value] ?? value}</Tag>;
}

export type DocumentArchiveUploadInput = {
  kind: string;
  format: "PDF" | "DOCX";
  title: string;
  documentNumber: string;
  documentDate: string;
  supplierOrderId?: string;
  paymentIntentId?: string;
  paymentTransactionId?: string;
  refundId?: string;
  baseAgreementDocumentId?: string;
  amountMinor?: string;
  currency?: string;
  fileName: string;
  contentBase64: string;
  requiredSignatureCount: number;
};

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
  reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
  reader.readAsDataURL(file);
});

export function DocumentArchiveUpload({
  kinds,
  busy,
  onUpload,
}: {
  kinds: string[];
  busy: boolean;
  onUpload: (input: DocumentArchiveUploadInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState(kinds[0] ?? "OTHER");
  const [title, setTitle] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierOrderId, setSupplierOrderId] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("KZT");
  const [requiredSignatureCount, setRequiredSignatureCount] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file || !title.trim() || !documentNumber.trim()) return;
    if (["CONTRACT_ADDENDUM", "REFUND_CONFIRMATION"].includes(kind) && !referenceId.trim()) {
      setError("Для выбранного типа документа укажите ID связанного основания.");
      return;
    }
    if (file.size > 10_000_000) {
      setError("Размер файла не должен превышать 10 МБ.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "docx") {
      setError("Поддерживаются только PDF и DOCX.");
      return;
    }
    try {
      setError(null);
      const normalizedAmount = amount.replace(/[\s,.]/g, "");
      await onUpload({
        kind,
        format: extension === "pdf" ? "PDF" : "DOCX",
        title: title.trim(),
        documentNumber: documentNumber.trim(),
        documentDate: new Date(`${documentDate}T00:00:00.000Z`).toISOString(),
        supplierOrderId: supplierOrderId.trim() || undefined,
        paymentIntentId: kind === "PAYMENT_CONFIRMATION" ? referenceId.trim() || undefined : undefined,
        refundId: kind === "REFUND_CONFIRMATION" ? referenceId.trim() || undefined : undefined,
        baseAgreementDocumentId: kind === "CONTRACT_ADDENDUM" ? referenceId.trim() || undefined : undefined,
        amountMinor: normalizedAmount || undefined,
        currency: normalizedAmount ? currency : undefined,
        fileName: file.name,
        contentBase64: await fileToBase64(file),
        requiredSignatureCount: Number(requiredSignatureCount),
      });
      setOpen(false);
      setFile(null);
      setTitle("");
      setDocumentNumber("");
      setSupplierOrderId("");
      setReferenceId("");
      setAmount("");
      setRequiredSignatureCount("0");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить документ");
    }
  };

  return <>
    <Button appearance="primary" icon={<Document24Regular />} onClick={() => setOpen(true)}>Загрузить документ</Button>
    <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogSurface className="dm-document-dialog">
        <DialogBody>
          <DialogTitle>Новый документ</DialogTitle>
          <DialogContent className="dm-document-upload-form">
            <Field label="Тип документа" required><Select value={kind} onChange={(_, data) => setKind(data.value)}>{kinds.map((value) => <option key={value} value={value}>{kindLabels[value] ?? value}</option>)}</Select></Field>
            <Field label="Название" required><Input value={title} onChange={(_, data) => setTitle(data.value)} /></Field>
            <div className="dm-document-upload-row"><Field label="Номер" required><Input value={documentNumber} onChange={(_, data) => setDocumentNumber(data.value)} /></Field><Field label="Дата документа" required><Input type="date" value={documentDate} onChange={(_, data) => setDocumentDate(data.value)} /></Field></div>
            <Field label="ID заказа" hint="Необязательно. UUID заказа связывает файл с закупкой."><Input value={supplierOrderId} onChange={(_, data) => setSupplierOrderId(data.value)} /></Field>
            {kind === "CONTRACT_ADDENDUM" ? <Field label="ID основного договора" required hint="Дополнительное соглашение всегда связано с исходным договором."><Input value={referenceId} onChange={(_, data) => setReferenceId(data.value)} /></Field> : null}
            {kind === "PAYMENT_CONFIRMATION" ? <Field label="ID платежа" hint="Необязательно, если связанный заказ уже имеет подтверждённую оплату."><Input value={referenceId} onChange={(_, data) => setReferenceId(data.value)} /></Field> : null}
            {kind === "REFUND_CONFIRMATION" ? <Field label="ID возврата" required><Input value={referenceId} onChange={(_, data) => setReferenceId(data.value)} /></Field> : null}
            <div className="dm-document-upload-row"><Field label="Сумма в тиынах" hint="Например, 125000 = 1 250 ₸"><Input inputMode="numeric" value={amount} onChange={(_, data) => setAmount(data.value)} /></Field><Field label="Валюта"><Input maxLength={3} value={currency} onChange={(_, data) => setCurrency(data.value.toUpperCase())} /></Field></div>
            <Field label="Требуемые подписи"><Select value={requiredSignatureCount} onChange={(_, data) => setRequiredSignatureCount(data.value)}><option value="0">Не требуются</option><option value="1">Одна</option><option value="2">Две</option></Select></Field>
            <Field label="Файл PDF или DOCX" required><input className="dm-document-file-input" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field>
            {error ? <div className="dm-document-message dm-document-message-error" role="alert">{error}</div> : null}
          </DialogContent>
          <DialogActions><Button appearance="primary" disabled={busy || !file || !title.trim() || !documentNumber.trim()} onClick={() => void submit()}>{busy ? "Загружаем…" : "Загрузить"}</Button><Button onClick={() => setOpen(false)}>Отмена</Button></DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  </>;
}

export function DocumentArchiveWorkspace({
  roleLabel,
  organizationId,
  items,
  summary,
  filters,
  nextCursor,
  loading,
  error,
  busyDocumentId,
  uploadAction,
  onFiltersChange,
  onApplyFilters,
  onResetFilters,
  onRefresh,
  onLoadMore,
  onDownload,
  onOpenDocument,
  onAccountingStatus,
}: {
  roleLabel: string;
  organizationId: string;
  items: DocumentArchiveItemView[];
  summary: DocumentArchiveSummaryView | null;
  filters: DocumentArchiveFilters;
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  busyDocumentId: string | null;
  uploadAction?: ReactNode;
  onFiltersChange: (next: DocumentArchiveFilters) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onDownload: (document: DocumentArchiveItemView) => void;
  onOpenDocument: (documentId: string) => Promise<DocumentArchiveItemView>;
  onAccountingStatus?: (document: DocumentArchiveItemView, status: "REVIEWED" | "RECONCILED" | "DISPUTED", reason: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DocumentArchiveItemView | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  const [accountingStatus, setAccountingStatus] = useState<"REVIEWED" | "RECONCILED" | "DISPUTED">("REVIEWED");
  const [accountingReason, setAccountingReason] = useState("");
  const selected = useMemo(() => selectedDetail?.id === selectedId ? selectedDetail : items.find(({ id }) => id === selectedId) ?? null, [items, selectedDetail, selectedId]);
  const counterparties = selected?.participants.filter(({ organizationId: participantId }) => participantId !== organizationId) ?? [];
  const openDocument = (documentId: string) => {
    setSelectedId(documentId);
    setSelectedDetail(null);
    setDetailFailed(false);
    void onOpenDocument(documentId).then(setSelectedDetail).catch(() => setDetailFailed(true));
  };

  return (
    <div className="dm-document-archive">
      <header className="dm-document-archive-header">
        <div>
          <span className="dm-document-archive-eyebrow">Документолог · {roleLabel}</span>
          <h1>Документы</h1>
          <p>Договоры, счета, подтверждения оплаты и отгрузочные документы в одном защищённом архиве.</p>
        </div>
        <div className="dm-document-archive-actions">
          {uploadAction}
          <Button appearance="secondary" icon={<ArrowSync24Regular />} onClick={onRefresh} disabled={loading}>Обновить</Button>
        </div>
      </header>

      <div className="dm-document-summary" aria-label="Сводка по архиву">
        {[
          ["Всего документов", summary?.total ?? 0],
          ["Ожидают подписи", summary?.awaitingSignature ?? 0],
          ["Требуют внимания", summary?.attention ?? 0],
          ["За этот месяц", summary?.thisMonth ?? 0],
        ].map(([label, value]) => <div className="dm-document-summary-card" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
      </div>

      <form className="dm-document-filters" onSubmit={(event) => { event.preventDefault(); onApplyFilters(); }}>
        <Input aria-label="Поиск документов" contentBefore={<Search24Regular />} placeholder="Номер, название, заказ, контрагент или БИН" value={filters.q} onChange={(_, data) => onFiltersChange({ ...filters, q: data.value })} />
        <Select aria-label="Категория документа" value={filters.category} onChange={(_, data) => onFiltersChange({ ...filters, category: data.value })}>
          <option value="">Все категории</option>
          {Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </Select>
        <Select aria-label="Статус документа" value={filters.status} onChange={(_, data) => onFiltersChange({ ...filters, status: data.value })}>
          <option value="">Все статусы</option>
          <option value="AWAITING_SIGNATURE">Ожидают подписи</option>
          <option value="SIGNED">Подписаны</option>
          <option value="GENERATED">Готовы</option>
          <option value="FAILED">С ошибкой</option>
          <option value="ARCHIVED">Архивированы</option>
        </Select>
        <Select aria-label="Бухгалтерский статус" value={filters.accountingStatus} onChange={(_, data) => onFiltersChange({ ...filters, accountingStatus: data.value })}>
          <option value="">Любая проверка</option>
          <option value="PENDING_REVIEW">На проверке</option>
          <option value="REVIEWED">Проверены</option>
          <option value="RECONCILED">Сверены</option>
          <option value="DISPUTED">С расхождением</option>
        </Select>
        <Input aria-label="Документы с даты" type="date" value={filters.dateFrom} onChange={(_, data) => onFiltersChange({ ...filters, dateFrom: data.value })} />
        <Input aria-label="Документы по дату" type="date" value={filters.dateTo} onChange={(_, data) => onFiltersChange({ ...filters, dateTo: data.value })} />
        <Button type="submit" appearance="primary">Применить</Button>
        <Button type="button" appearance="subtle" onClick={onResetFilters}>Сбросить</Button>
      </form>

      {error ? <div className="dm-document-message dm-document-message-error" role="alert"><strong>Архив не загрузился</strong><span>{error}</span><Button onClick={onRefresh}>Повторить</Button></div> : null}
      {loading && !items.length ? <div className="dm-document-loading"><Spinner label="Загружаем документы" /></div> : null}
      {!loading && !error && !items.length ? <div className="dm-document-empty"><Document24Regular /><h2>Документов пока нет</h2><p>После оформления заказа, загрузки файла или заключения договора документы появятся здесь.</p></div> : null}

      {items.length ? (
        <div className="dm-document-table-wrap">
          <table className="dm-document-table">
            <caption className="dm-sr-only">Документы организации</caption>
            <thead><tr><th>Документ</th><th>Контрагент</th><th>Дата</th><th>Сумма</th><th>Статус</th><th><span className="dm-sr-only">Действия</span></th></tr></thead>
            <tbody>{items.map((document) => {
              const counterparty = document.participants.find(({ organizationId: participantId }) => participantId !== organizationId)?.organization;
              return <tr key={document.id} tabIndex={0} onDoubleClick={() => openDocument(document.id)} onKeyDown={(event) => { if (event.key === "Enter") openDocument(document.id); }}>
                <td data-label="Документ"><button className="dm-document-link" onClick={() => openDocument(document.id)}><strong>{document.title}</strong><span>{kindLabels[document.kind] ?? document.kind} · № {document.documentNumber} · v{document.version}</span></button></td>
                <td data-label="Контрагент">{counterparty ? <><strong>{counterparty.displayName}</strong><span className="dm-document-muted">БИН {counterparty.bin}</span></> : "—"}</td>
                <td data-label="Дата">{formatDate(document.documentDate)}</td>
                <td data-label="Сумма">{formatMoney(document.amountMinor, document.currency)}</td>
                <td data-label="Статус"><div className="dm-document-statuses"><DocumentStatus value={document.status} />{document.accountingStatus !== "NOT_APPLICABLE" ? <DocumentStatus value={document.accountingStatus} /> : null}</div></td>
                <td><Button appearance="subtle" icon={<ArrowDownload24Regular />} aria-label={`Скачать ${document.title}`} disabled={busyDocumentId === document.id} onClick={() => onDownload(document)} /></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : null}
      {nextCursor ? <div className="dm-document-load-more"><Button onClick={onLoadMore} disabled={loading}>{loading ? "Загружаем…" : "Показать ещё"}</Button></div> : null}

      <Dialog open={Boolean(selected)} onOpenChange={(_, data) => { if (!data.open) setSelectedId(null); }}>
        <DialogSurface className="dm-document-dialog">
          <DialogBody>
            <DialogTitle action={<Button appearance="subtle" icon={<Dismiss24Regular />} aria-label="Закрыть" onClick={() => setSelectedId(null)} />}>{selected?.title}</DialogTitle>
            {selected ? <DialogContent className="dm-document-detail">
              <dl>
                <div><dt>Номер</dt><dd>{selected.documentNumber}</dd></div>
                <div><dt>Тип</dt><dd>{kindLabels[selected.kind] ?? selected.kind}</dd></div>
                <div><dt>Дата</dt><dd>{formatDate(selected.documentDate)}</dd></div>
                <div><dt>Сумма</dt><dd>{formatMoney(selected.amountMinor, selected.currency)}</dd></div>
                <div><dt>Версия</dt><dd>{selected.version}</dd></div>
                <div><dt>Заказ</dt><dd>{selected.supplierOrder?.orderNumber ?? "Не связан"}</dd></div>
              </dl>
              <section><h3>Стороны документа</h3>{counterparties.length ? counterparties.map((party) => <p key={`${party.organizationId}:${party.role}`}><strong>{party.organization.displayName}</strong><span>БИН {party.organization.bin} · {party.role}</span></p>) : <p>Контрагент не указан.</p>}</section>
              <section><h3>Подписи</h3>{selected.signatures.length ? selected.signatures.map((signature) => <p key={signature.id}><strong>{signature.signerName ?? "Подписант"}</strong><span>{signature.method} · {statusLabels[signature.status] ?? signature.status}{signature.signedAt ? ` · ${formatDate(signature.signedAt)}` : ""}</span></p>) : <p>Подписи для документа не зарегистрированы.</p>}</section>
              <section><h3>История версий</h3>{selected.versions.length ? selected.versions.map((version) => <p key={version.id}><strong>Версия {version.version}</strong><span>{statusLabels[version.status] ?? version.status} · {formatDate(version.documentDate)}</span></p>) : <p>{detailFailed ? "Историю версий загрузить не удалось." : "Загружаем цепочку версий…"}</p>}</section>
              {onAccountingStatus && selected.accountingStatus !== "NOT_APPLICABLE" ? <section className="dm-document-accounting"><h3>Бухгалтерская обработка</h3><Select aria-label="Новый бухгалтерский статус" value={accountingStatus} onChange={(_, data) => setAccountingStatus(data.value as typeof accountingStatus)}><option value="REVIEWED">Проверен</option><option value="RECONCILED">Сверен</option><option value="DISPUTED">Есть расхождение</option></Select><Textarea aria-label="Комментарий к бухгалтерской отметке" placeholder="Основание изменения" value={accountingReason} onChange={(_, data) => setAccountingReason(data.value)} /><Button appearance="primary" disabled={accountingReason.trim().length < 2 || busyDocumentId === selected.id} onClick={() => void onAccountingStatus(selected, accountingStatus, accountingReason).then(() => setAccountingReason(""))}>Сохранить отметку</Button></section> : null}
            </DialogContent> : null}
            <DialogActions><Button appearance="primary" icon={<ArrowDownload24Regular />} disabled={!selected || busyDocumentId === selected?.id} onClick={() => selected && onDownload(selected)}>Скачать</Button><Button onClick={() => setSelectedId(null)}>Закрыть</Button></DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
