"use client";

import { useState } from "react";
import type { MarketplaceApiClient, SupplierImportBatchResponse, SupplierImportDiagnosticsResponse } from "@marketplace/api-client";
import type { SupplierColumnMappingInput } from "@marketplace/schemas";
import { DmButton, DmField, DmInput, DmSelect, DmTable, ErrorState, Section, StatusTag, errorMessage, formatStatus } from "@marketplace/ui";
import type { SupplierDataSource } from "./types";

const fields = [
  ["externalId", "Код строки или артикул", "externalId"],
  ["name", "Название товара", "name"],
  ["supplierSku", "Артикул поставщика", "supplierSku"],
  ["gtin", "Штрихкод", "gtin"],
  ["priceMinor", "Цена в тиынах", "priceMinor"],
  ["currency", "Валюта", "currency"],
  ["quantityOnHand", "Остаток", "quantityOnHand"],
  ["unit", "Единица измерения", "unit"],
] as const;

export function SpreadsheetImport({ api, supplierId, sources, onChanged }: {
  api: MarketplaceApiClient;
  supplierId: string;
  sources: SupplierDataSource[];
  onChanged: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(([key, , initial]) => [key, initial])));
  const [batch, setBatch] = useState<SupplierImportBatchResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<SupplierImportDiagnosticsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSource, setCreatedSource] = useState<SupplierDataSource | null>(null);
  const [reason, setReason] = useState("");
  const fileType = file?.name.toLowerCase().endsWith(".xlsx") ? "EXCEL" : "CSV";
  const availableSources = [...sources, ...(createdSource && !sources.some(source => source.id === createdSource.id) ? [createdSource] : [])]
    .filter(source => source.type === fileType && source.status === "ACTIVE");
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  const preview = () => run(async () => {
    if (!file || !/\.(csv|xlsx)$/i.test(file.name)) throw new Error("Выберите файл CSV или XLSX.");
    if (!file.size || file.size > 20_000_000) throw new Error("Файл должен быть непустым и не больше 20 МБ.");
    if (!mapping.externalId?.trim() || !mapping.name?.trim()) throw new Error("Укажите названия колонок кода и товара.");
    let selected = availableSources.find(source => source.id === sourceId);
    if (sourceId && !selected) throw new Error("Выберите источник для этого формата файла.");
    if (!selected) {
      selected = await api.post<SupplierDataSource>(`/suppliers/${supplierId}/data-sources`, {
        name: `Прайс ${fileType === "EXCEL" ? "Excel" : "CSV"}`, type: fileType,
      });
      setCreatedSource(selected); setSourceId(selected.id);
    }
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("Не удалось прочитать файл. Выберите его повторно."));
      reader.readAsDataURL(file);
    });
    const created = await api.createSupplierImportBatch(supplierId, {
      sourceId: selected.id, fileName: file.name, fileType, contentBase64,
      columnMapping: Object.fromEntries(Object.entries(mapping).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])) as SupplierColumnMappingInput,
    });
    setBatch(created); setDiagnostics(null);
    setBatch(await api.getSupplierImportBatch(supplierId, created.id));
    await onChanged();
  });
  const refresh = () => run(async () => {
    if (!batch) return;
    setBatch(await api.getSupplierImportBatch(supplierId, batch.id));
    setDiagnostics(await api.getSupplierImportDiagnostics(supplierId, batch.id));
  });
  const process = () => run(async () => {
    if (!batch) return;
    setBatch(await api.processSupplierImportBatch(supplierId, batch.id));
    setBatch(await api.getSupplierImportBatch(supplierId, batch.id));
    setDiagnostics(await api.getSupplierImportDiagnostics(supplierId, batch.id));
    await onChanged();
  });
  const rollback = () => run(async () => {
    if (!batch) return;
    await api.rollbackSupplierImportBatch(supplierId, batch.id, { reason: reason.trim(), expectedUpdatedAt: batch.updatedAt });
    setBatch(await api.getSupplierImportBatch(supplierId, batch.id));
    setDiagnostics(null); await onChanged();
  });
  const previewRows = batch?.rows ?? [];
  const requiredColumns = [mapping.externalId.trim(), mapping.name.trim()];
  const missingColumns = batch?.status === "MAPPED" && previewRows.length > 0
    ? requiredColumns.filter(column => !Object.hasOwn(previewRows[0]!.rawData, column)) : [];

  return <Section title="Импорт Excel / CSV" description="Сначала просмотр файла, затем обработка и проверка сопоставлений. Загрузка сама по себе не публикует товары.">
    <div className="mp-stack">
      {error ? <ErrorState description={error} /> : null}
      {!batch ? <>
        <DmField label="Таблица поставщика" hint="CSV с запятыми или первый лист XLSX; до 20 МБ и 5 000 строк данных.">
          <input aria-label="Таблица поставщика" type="file" accept=".csv,.xlsx" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setSourceId(""); }} />
        </DmField>
        <DmField label="Источник прайса" hint="Для обновления прежних строк выбирайте тот же источник и сохраняйте их коды.">
          <DmSelect value={sourceId} disabled={busy} onChange={(_, data) => setSourceId(data.value)}>
            <option value="">Создать новый источник</option>
            {availableSources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
          </DmSelect>
        </DmField>
        <p>Укажите точные заголовки колонок вашего файла. Обязательны код и название; ненужные поля очистите. Цена — целое число тиынов: 125000 = 1 250 ₸. Валюта — KZT.</p>
        {fields.map(([key, label]) => <DmField key={key} label={`Колонка: ${label}`}>
          <DmInput value={mapping[key]} disabled={busy} onChange={(_, data) => setMapping(current => ({ ...current, [key]: data.value }))} />
        </DmField>)}
        <DmButton appearance="primary" disabled={busy || !file} onClick={() => void preview()}>{busy ? "Читаем файл…" : "Загрузить для просмотра"}</DmButton>
      </> : <>
        <h3>{batch.fileName}</h3>
        <p role="status">Всего строк: {batch.totalRows}. Показано: {previewRows.length} (не более 200).</p>
        <StatusTag>{batch.status === "MAPPED" ? "Ожидает проверки и обработки" : formatStatus(batch.status)}</StatusTag>
        {previewRows.length ? <DmTable caption="Предварительный просмотр строк файла" columns={[{ key: "number", label: "Строка файла" }, { key: "data", label: "Данные" }, { key: "status", label: "Результат" }]}>
          {previewRows.map(row => <tr key={row.id}>
            <td data-label="Строка файла">{row.rowNumber}</td>
            <td data-label="Данные" style={{ overflowWrap: "anywhere" }}>{Object.entries(row.rawData).map(([key, value]) => <div key={key}><strong>{key}:</strong> {String(value ?? "")}</div>)}</td>
            <td data-label="Результат">{row.status === "RAW" ? "Загружено" : formatStatus(row.status)}{row.errorMessage ? <p>{row.errorMessage}</p> : null}</td>
          </tr>)}
        </DmTable> : <p>Просмотр ещё не загружен. Нажмите «Обновить результат».</p>}
        {missingColumns.length ? <p role="alert">Не найдены обязательные колонки: {missingColumns.join(", ")}. Исправьте названия и загрузите файл заново.</p> : null}
        {diagnostics ? <p role="status">Обработано: {diagnostics.processedRows}. Ошибок: {diagnostics.errorRows}. Требуют сопоставления: {diagnostics.byStatus.MATCH_PENDING ?? 0}. Публикация проверяется отдельно.</p> : null}
        <div className="mp-stack">
          <DmButton disabled={busy} onClick={() => void refresh()}>Обновить результат</DmButton>
          {batch.status === "MAPPED" ? <DmButton appearance="primary" disabled={busy || !previewRows.length || missingColumns.length > 0} onClick={() => void process()}>Данные проверены — обработать</DmButton> : null}
          {["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(batch.status) ? <>
            <DmField label="Причина отката" hint="От 10 до 500 символов. Откат отменяет результаты этой загрузки с сохранением истории. Сервер проверит, допустим ли откат."><DmInput value={reason} maxLength={500} disabled={busy} onChange={(_, data) => setReason(data.value)} /></DmField>
            <DmButton disabled={busy || reason.trim().length < 10} onClick={() => void rollback()}>Подтвердить откат этой загрузки</DmButton>
          </> : null}
          <DmButton disabled={busy} onClick={() => { setBatch(null); setDiagnostics(null); setFile(null); setReason(""); }}>Загрузить другой файл</DmButton>
        </div>
      </>}
    </div>
  </Section>;
}
