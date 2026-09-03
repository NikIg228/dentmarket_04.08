import {
  Box24Regular,
  CloudArrowUp24Regular,
  DataTrending24Regular,
  PlugConnected24Regular,
} from "@fluentui/react-icons";
import type { ApiContext } from "@marketplace/api-client";
import {
  DmButton,
  DmField,
  EmptyState,
  PageHeader,
  Section,
  StatusTag,
  formatDate,
  formatStatus,
} from "@marketplace/ui";
import { ConnectorOnboarding } from "../../connector-onboarding";
import styles from "../../page.module.css";
import type {
  ExternalCatalogItem,
  ImportBatch,
  Integration,
} from "./types";
import {
  integrationModeLabel,
  integrationProviderLabel,
  statusTone,
} from "./view-model";

export function SupplierIntegrations({
  authenticated,
  supplierId,
  apiContext,
  integrations,
  importBatches,
  externalItems,
  selectedFile,
  busy,
  onFileChange,
  onUpload,
  onProcessBatch,
  onConfirmMatch,
}: {
  authenticated: boolean;
  supplierId: string;
  apiContext: ApiContext;
  integrations: Integration[];
  importBatches: ImportBatch[];
  externalItems: ExternalCatalogItem[];
  selectedFile: File | null;
  busy: string | null;
  onFileChange: (file: File | null) => void;
  onUpload: () => Promise<void>;
  onProcessBatch: (batch: ImportBatch) => Promise<void>;
  onConfirmMatch: (
    item: ExternalCatalogItem,
    productVariantId: string,
  ) => Promise<void>;
}) {
  return (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Обмен данными"
        title="Загрузка товаров"
        description="Загружайте прайсы файлами или подключите 1С и другую учётную систему."
      />
      {authenticated ? (
        <ConnectorOnboarding supplierId={supplierId} apiContext={apiContext} />
      ) : null}
      <Section
        title="Загрузить прайс или каталог"
        description="Мы сохраним исходный файл, распознаем строки и попросим подтвердить валюту перед публикацией."
      >
        <div className={styles.pdfUpload}>
          <DmField
            label="PDF поставщика"
            hint="До 20 МБ. Текстовые таблицы распознаются автоматически; сканы уходят на ручную проверку."
          >
            <input
              className={styles.fileInput}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
          </DmField>
          <DmButton
            appearance="primary"
            icon={<CloudArrowUp24Regular />}
            disabled={!selectedFile || busy === "pdf-import"}
            onClick={() => void onUpload()}
          >
            {busy === "pdf-import" ? "Извлекаем…" : "Загрузить и распознать"}
          </DmButton>
        </div>
        {importBatches.length ? (
          <div className={styles.importList}>
            {importBatches.slice(0, 10).map((batch) => (
              <article className={styles.importItem} key={batch.id}>
                <div>
                  <strong>{batch.fileName}</strong>
                  <p>
                    {batch.source.name} · {batch.totalRows} строк ·{" "}
                    {formatDate(batch.createdAt, true)}
                  </p>
                  {batch.extractionMetadata?.warnings?.map((warning) => (
                    <p className={styles.importWarning} key={warning}>{warning}</p>
                  ))}
                </div>
                <div className={styles.importActions}>
                  <StatusTag tone={statusTone(batch.status)}>
                    {formatStatus(batch.status)}
                  </StatusTag>
                  {batch.status === "MAPPED" && batch.totalRows > 0 ? (
                    <DmButton
                      appearance="secondary"
                      disabled={busy === `import:${batch.id}`}
                      onClick={() => void onProcessBatch(batch)}
                    >
                      {busy === `import:${batch.id}` ? "Обрабатываем…" : "Проверено, обработать"}
                    </DmButton>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CloudArrowUp24Regular />}
            title="Файлы ещё не загружены"
            description="Добавьте прайс поставщика. После обработки здесь появятся найденные строки."
          />
        )}
      </Section>
      <Section
        title="Проверка карточки"
        description="Перед добавлением товара мы проверим, нет ли его уже в каталоге."
      >
        {externalItems.length ? (
          <div className={styles.importList}>
            {externalItems.slice(0, 30).map((item) => {
              const candidate =
                item.matchCandidates.find((entry) => entry.status === "PROPOSED") ??
                item.matchCandidates[0];
              return (
                <article className={styles.importItem} key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.supplierSku || "Без артикула"} ·{" "}
                      {item.matchedVariant
                        ? `привязано к «${item.matchedVariant.product.canonicalName}»`
                        : candidate
                          ? `найдено совпадение «${candidate.productVariant.product.canonicalName}» (${Math.round(Number(candidate.score) * 100)}%)`
                          : item.productCandidate
                            ? "новая карточка ожидает модерации"
                            : "совпадений нет"}
                    </p>
                  </div>
                  <div className={styles.importActions}>
                    {item.matchedVariant ? (
                      <StatusTag tone="success">Привязано</StatusTag>
                    ) : candidate ? (
                      <DmButton
                        appearance="secondary"
                        disabled={busy === `match:${item.id}`}
                        onClick={() =>
                          void onConfirmMatch(item, candidate.productVariant.id)
                        }
                      >
                        {busy === `match:${item.id}` ? "Связываем…" : "Использовать карточку"}
                      </DmButton>
                    ) : (
                      <StatusTag tone="warning">Модерация</StatusTag>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Box24Regular />}
            title="Позиций для проверки пока нет"
            description="После обработки прайса здесь появятся существующие карточки, возможные совпадения и новые кандидаты."
          />
        )}
      </Section>
      <Section title="Подключённые системы">
        {!integrations.length ? (
          <EmptyState
            icon={<PlugConnected24Regular />}
            title="Подключений пока нет"
            description="Напишите команде DentMarket, чтобы подключить 1С, или обновляйте товары вручную."
          />
        ) : (
          <div className={styles.integrationList}>
            {integrations.map((integration) => (
              <article className={styles.integration} key={integration.id}>
                <div>
                  <strong>{integration.displayName}</strong>
                  <p>
                    {integrationProviderLabel[integration.provider] ?? integration.provider}.{" "}
                    {integrationModeLabel[integration.mode] ?? integration.mode}.{" "}
                    {integration.bindings.length} привязок, {integration._count.jobs} заданий
                  </p>
                  <p>
                    {integration.lastSuccessAt
                      ? `Последний успех ${formatDate(integration.lastSuccessAt, true)}`
                      : integration.lastError ?? "Товары ещё не обновлялись"}
                  </p>
                </div>
                <StatusTag tone={statusTone(integration.status)}>
                  {formatStatus(integration.status)}
                </StatusTag>
              </article>
            ))}
          </div>
        )}
      </Section>
      <Section title="Способы загрузки данных">
        <div className={styles.healthGrid}>
          <div className={styles.healthItem}>
            <CloudArrowUp24Regular />
            <strong>Загрузка прайса</strong>
            <p>Распознавание строк и проверка валюты перед публикацией.</p>
          </div>
          <div className={styles.healthItem}>
            <PlugConnected24Regular />
            <strong>Прямое подключение</strong>
            <p>Автоматическое обновление данных и повторная отправка при ошибке.</p>
          </div>
          <div className={styles.healthItem}>
            <DataTrending24Regular />
            <strong>1С Connector Agent</strong>
            <p>Регистрация агента, heartbeat, очередь заданий и версионирование.</p>
          </div>
        </div>
      </Section>
    </div>
  );
}
