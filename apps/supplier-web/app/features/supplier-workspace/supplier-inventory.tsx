import { ArrowSync24Regular } from "@fluentui/react-icons/svg/arrow-sync";
import { Box24Regular } from "@fluentui/react-icons/svg/box";
import {
  DmButton,
  DmField,
  DmInput,
  DmTable,
  EmptyState,
  PageHeader,
  Section,
  StatusTag,
  formatDate,
  formatStatus,
} from "@marketplace/ui";
import styles from "../../page.module.css";
import type { Balance, DataOverride } from "./types";
import { statusTone } from "./view-model";

export function SupplierInventory({
  balances,
  overrides,
  quantityDrafts,
  busy,
  onQuantityChange,
  onSaveBalance,
  onRecompute,
}: {
  balances: Balance[];
  overrides: DataOverride[];
  quantityDrafts: Record<string, string>;
  busy: string | null;
  onQuantityChange: (balanceId: string, value: string) => void;
  onSaveBalance: (balance: Balance) => Promise<void>;
  onRecompute: () => Promise<void>;
}) {
  return (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Складской учёт"
        title="Остатки и партии"
        description="Доступное количество учитывает резервы, страховой запас и время последнего обновления."
        actions={
          <DmButton
            appearance="secondary"
            icon={<ArrowSync24Regular />}
            disabled={busy === "freshness"}
            onClick={() => void onRecompute()}
          >
            {busy === "freshness" ? "Пересчитываем…" : "Пересчитать"}
          </DmButton>
        }
      />
      <Section>
        {!balances.length ? (
          <EmptyState
            icon={<Box24Regular />}
            title="Нет складских остатков"
            description="Добавьте товар на склад или обновите остатки из 1С."
          />
        ) : (
          <DmTable
            caption="Складские остатки поставщика"
            columns={[
              { key: "product", label: "Товар и склад" },
              { key: "available", label: "Доступно" },
              { key: "reserved", label: "Резерв" },
              { key: "lots", label: "Партии" },
              { key: "freshness", label: "Актуальность" },
              { key: "stock", label: "На складе" },
            ]}
          >
            {balances.map((balance) => (
              <tr key={balance.id}>
                <td data-label="Товар и склад">
                  <strong>{balance.productVariant.product.canonicalName}</strong>
                  <small>
                    {balance.warehouse.name} · {balance.warehouse.code}
                  </small>
                </td>
                <td data-label="Доступно"><strong>{balance.quantityAvailable}</strong></td>
                <td data-label="Резерв">{balance.quantityReserved}</td>
                <td data-label="Партии">
                  {balance.lots.length}
                  <small>
                    {balance.lots[0]
                      ? `${balance.lots[0].lotNumber} до ${formatDate(balance.lots[0].expirationDate)}`
                      : "Без партий"}
                  </small>
                </td>
                <td data-label="Актуальность">
                  <StatusTag tone={statusTone(balance.freshnessStatus)}>
                    {formatStatus(balance.freshnessStatus)}
                  </StatusTag>
                  <small>{formatDate(balance.freshnessExpiresAt, true)}</small>
                </td>
                <td data-label="На складе">
                  <div className={styles.editCell}>
                    <DmField label={`Количество: ${balance.productVariant.product.canonicalName}`} className={styles.compactField}>
                      <DmInput
                        type="number"
                        min="0"
                        value={quantityDrafts[balance.id] ?? ""}
                        onChange={(_, data) => onQuantityChange(balance.id, data.value)}
                      />
                    </DmField>
                    <DmButton
                      appearance="primary"
                      onClick={() => void onSaveBalance(balance)}
                      disabled={busy === `balance:${balance.id}`}
                    >
                      {busy === `balance:${balance.id}` ? "Сохраняем…" : "Сохранить"}
                    </DmButton>
                  </div>
                </td>
              </tr>
            ))}
          </DmTable>
        )}
      </Section>
      {overrides.length ? (
        <Section
          title="Ручные переопределения"
          description="Данные, защищённые от автоматической перезаписи"
        >
          <DmTable
            caption="Ручные переопределения складских данных"
            columns={[
              { key: "target", label: "Тип" },
              { key: "mode", label: "Режим" },
              { key: "reason", label: "Причина" },
              { key: "status", label: "Статус" },
              { key: "created", label: "Создано" },
            ]}
          >
            {overrides.map((override) => (
              <tr key={override.id}>
                <td data-label="Тип">{override.target}</td>
                <td data-label="Режим">{override.mode}</td>
                <td data-label="Причина">{override.reason}</td>
                <td data-label="Статус">
                  <StatusTag tone={statusTone(override.status)}>
                    {formatStatus(override.status)}
                  </StatusTag>
                </td>
                <td data-label="Создано">{formatDate(override.createdAt, true)}</td>
              </tr>
            ))}
          </DmTable>
        </Section>
      ) : null}
    </div>
  );
}
