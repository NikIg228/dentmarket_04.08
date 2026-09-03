import { Document24Regular, Money24Regular } from "@fluentui/react-icons";
import {
  DmButton,
  DmTable,
  EmptyState,
  PageHeader,
  Section,
  StatusTag,
  formatDate,
  formatStatus,
} from "@marketplace/ui";
import styles from "../../page.module.css";
import type { DocumentRecord, MerchantAccount } from "./types";
import { statusTone } from "./view-model";

export function SupplierDocuments({
  documents,
  merchantAccounts,
  busy,
  onDownload,
}: {
  documents: DocumentRecord[];
  merchantAccounts: MerchantAccount[];
  busy: string | null;
  onDownload: (document: DocumentRecord) => Promise<void>;
}) {
  return (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Документооборот"
        title="Документы"
        description="Счета, спецификации и накладные с электронными подписями и историей версий."
      />
      <Section>
        {!documents.length ? (
          <EmptyState
            icon={<Document24Regular />}
            title="Документов пока нет"
            description="Сформированные счета, спецификации и накладные появятся здесь."
          />
        ) : (
          <div className={styles.documentList}>
            {documents.map((document) => (
              <article className={styles.document} key={document.id}>
                <div>
                  <strong>{document.title}</strong>
                  <p>
                    {document.kind} · {document.format} ·{" "}
                    {document.documentNumber ?? "без номера"} ·{" "}
                    {formatDate(document.createdAt, true)}
                  </p>
                </div>
                <div className="mp-inline-actions">
                  <StatusTag tone={statusTone(document.status)}>
                    {formatStatus(document.status)}
                  </StatusTag>
                  <DmButton
                    appearance="secondary"
                    onClick={() => void onDownload(document)}
                    disabled={busy === `document:${document.id}`}
                  >
                    {busy === `document:${document.id}` ? "Скачиваем…" : "Скачать"}
                  </DmButton>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
      <Section
        title="Платёжный профиль"
        description="Готовность к приёму и выплате средств"
      >
        {!merchantAccounts.length ? (
          <EmptyState
            icon={<Money24Regular />}
            title="Платёжный профиль не подключён"
            description="Для настройки напишите команде DentMarket."
          />
        ) : (
          <DmTable
            caption="Платёжные профили поставщика"
            columns={[
              { key: "provider", label: "Сервис оплаты" },
              { key: "onboarding", label: "Подключение" },
              { key: "verification", label: "Проверка" },
              { key: "payout", label: "Выплаты" },
              { key: "merchant", label: "Merchant ID" },
            ]}
          >
            {merchantAccounts.map((account) => (
              <tr key={account.id}>
                <td data-label="Сервис оплаты">{account.provider.name}</td>
                <td data-label="Подключение">
                  <StatusTag tone={statusTone(account.onboardingStatus)}>
                    {formatStatus(account.onboardingStatus)}
                  </StatusTag>
                </td>
                <td data-label="Проверка">
                  <StatusTag tone={statusTone(account.verificationStatus)}>
                    {formatStatus(account.verificationStatus)}
                  </StatusTag>
                </td>
                <td data-label="Выплаты">
                  <StatusTag tone={statusTone(account.payoutStatus)}>
                    {formatStatus(account.payoutStatus)}
                  </StatusTag>
                </td>
                <td data-label="Merchant ID" className="mp-mono">
                  {account.externalMerchantId || "Не назначен"}
                </td>
              </tr>
            ))}
          </DmTable>
        )}
      </Section>
    </div>
  );
}
