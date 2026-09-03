import { CloudArrowUp24Regular, ShieldCheckmark24Regular } from "@fluentui/react-icons";
import {
  DmButton,
  DmField,
  DmInput,
  DmSelect,
  DmTable,
  EmptyState,
  PageHeader,
  Section,
  StatusTag,
  formatDate,
  formatStatus,
} from "@marketplace/ui";
import styles from "../../page.module.css";
import type { ComplianceCheck, Credential } from "./types";
import { credentialTypeLabel, statusTone } from "./view-model";

export function SupplierCompliance({
  credentials,
  checks,
  credentialType,
  credentialNumber,
  credentialFile,
  busy,
  onTypeChange,
  onNumberChange,
  onFileChange,
  onSubmit,
}: {
  credentials: Credential[];
  checks: ComplianceCheck[];
  credentialType: string;
  credentialNumber: string;
  credentialFile: File | null;
  busy: string | null;
  onTypeChange: (value: string) => void;
  onNumberChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Регуляторика"
        title="Комплаенс и документы организации"
        description="Загрузите лицензии и регистрационные документы. Мы проверим срок действия и сохраним историю изменений."
      />
      <Section
        title="Добавить документ"
        description="После отправки документ появится со статусом «Ожидает проверки»"
      >
        <div className={styles.formRow}>
          <DmField label="Тип">
            <DmSelect value={credentialType} onChange={(_, data) => onTypeChange(data.value)}>
              <option value="REGISTRATION_CERTIFICATE">Регистрационное удостоверение</option>
              <option value="WHOLESALE_LICENSE">Оптовая лицензия</option>
              <option value="MEDICAL_DEVICE_SALE_NOTIFICATION">Уведомление о реализации медицинских изделий</option>
              <option value="DISTRIBUTOR_AUTHORIZATION">Авторизация дистрибьютора</option>
              <option value="QUALITY_CERTIFICATE">Сертификат качества</option>
              <option value="OTHER">Другой документ</option>
            </DmSelect>
          </DmField>
          <DmField label="Номер">
            <DmInput
              value={credentialNumber}
              onChange={(_, data) => onNumberChange(data.value)}
              placeholder="KZ-RC-2026-001"
            />
          </DmField>
          <DmField label="Файл PDF / изображение">
            <input
              className={styles.fileInput}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(event) => onFileChange(event.currentTarget.files?.[0] ?? null)}
            />
          </DmField>
          <DmButton
            appearance="primary"
            icon={<CloudArrowUp24Regular />}
            onClick={() => void onSubmit()}
            disabled={busy === "credential" || !credentialFile || credentialNumber.trim().length < 2}
          >
            {busy === "credential" ? "Отправляем…" : "Отправить"}
          </DmButton>
        </div>
        {!credentials.length ? (
          <EmptyState
            icon={<ShieldCheckmark24Regular />}
            title="Документы не добавлены"
            description="Добавьте лицензию или регистрационное удостоверение."
          />
        ) : (
          <div className={styles.credentialList}>
            {credentials.map((credential) => (
              <article className={styles.credential} key={credential.id}>
                <div>
                  <strong>
                    {credentialTypeLabel[credential.type] ?? "Документ"}. {credential.number}
                  </strong>
                  <p>
                    {credential.issuer ?? "Издатель не указан"}. Действует до{" "}
                    {formatDate(credential.validTo)}
                  </p>
                  {credential.rejectionReason ? <p>{credential.rejectionReason}</p> : null}
                </div>
                <StatusTag tone={statusTone(credential.status)}>
                  {formatStatus(credential.status)}
                </StatusTag>
              </article>
            ))}
          </div>
        )}
      </Section>
      <Section
        title="Последние автоматические проверки"
        description={`${checks.length} результатов`}
      >
        {!checks.length ? (
          <EmptyState
            icon={<ShieldCheckmark24Regular />}
            title="Проверок пока нет"
            description="Проверка запускается при публикации и оформлении заказа."
          />
        ) : (
          <DmTable
            caption="Последние результаты комплаенс-проверок"
            columns={[
              { key: "subject", label: "Объект" },
              { key: "risk", label: "Риск" },
              { key: "decision", label: "Решение" },
              { key: "status", label: "Статус" },
              { key: "date", label: "Дата" },
            ]}
          >
            {checks.slice(0, 50).map((check) => (
              <tr key={check.id}>
                <td data-label="Объект">
                  {check.offer?.productVariant?.product?.canonicalName ?? "Организация"}
                </td>
                <td data-label="Риск">
                  <StatusTag
                    tone={
                      check.riskLevel === "CRITICAL"
                        ? "danger"
                        : check.riskLevel === "HIGH"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {check.riskLevel}
                  </StatusTag>
                </td>
                <td data-label="Решение">{check.decision}</td>
                <td data-label="Статус">
                  <StatusTag tone={statusTone(check.status)}>
                    {formatStatus(check.status)}
                  </StatusTag>
                </td>
                <td data-label="Дата">{formatDate(check.evaluatedAt, true)}</td>
              </tr>
            ))}
          </DmTable>
        )}
      </Section>
    </div>
  );
}
