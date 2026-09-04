"use client";

import { CheckmarkCircle24Regular } from "@fluentui/react-icons/svg/checkmark-circle";
import {
  DmButton,
  DmDialog,
  DmFeedback,
  DmField,
  DmInput,
  DmTextarea,
  formatMoney,
} from "@marketplace/ui";
import { useMemo, useRef, useState } from "react";
import styles from "./order-confirmation-panel.module.css";

export type OrderConfirmationDecision = {
  itemId: string;
  acceptedQuantity: number;
  reason?: string;
};

export type ConfirmableOrder = {
  id: string;
  orderNumber: string;
  subtotalAmountMinor: string;
  currency: string;
  items: Array<{
    id: string;
    quantity: string;
    unitPriceMinor: string;
    offer: { productVariant: { product: { canonicalName: string } } };
  }>;
};

type Draft = Record<string, { acceptedQuantity: string; reason: string }>;

function initialDraft(order: ConfirmableOrder): Draft {
  return Object.fromEntries(
    order.items.map((item) => [
      item.id,
      { acceptedQuantity: item.quantity, reason: "" },
    ]),
  );
}

function quantityLabel(value: string | number) {
  return new Intl.NumberFormat("ru-KZ", {
    maximumFractionDigits: 6,
  }).format(Number(value));
}

export function OrderConfirmationPanel({
  order,
  onConfirm,
}: {
  order: ConfirmableOrder;
  onConfirm: (decisions: OrderConfirmationDecision[]) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const triggerContainerRef = useRef<HTMLSpanElement>(null);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(order));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      order.items.reduce((sum, item) => {
        const accepted = Number(draft[item.id]?.acceptedQuantity ?? 0);
        if (!Number.isFinite(accepted) || accepted < 0) return sum;
        return sum + accepted * Number(item.unitPriceMinor);
      }, 0),
    [draft, order.items],
  );
  const reduction = Math.max(0, Number(order.subtotalAmountMinor) - preview);

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraft(initialDraft(order));
      setSubmitError(null);
    } else {
      queueMicrotask(() =>
        triggerContainerRef.current?.querySelector("button")?.focus(),
      );
    }
  };

  const submit = async () => {
    const decisions: OrderConfirmationDecision[] = [];
    for (const item of order.items) {
      const acceptedQuantity = Number(draft[item.id]?.acceptedQuantity);
      const requestedQuantity = Number(item.quantity);
      const reason = draft[item.id]?.reason.trim() ?? "";
      if (
        !Number.isFinite(acceptedQuantity) ||
        acceptedQuantity < 0 ||
        acceptedQuantity > requestedQuantity
      ) {
        setSubmitError("Подтверждённое количество должно быть от нуля до заказанного.");
        return;
      }
      if (acceptedQuantity < requestedQuantity && reason.length < 3) {
        setSubmitError("Укажите причину для каждой позиции с уменьшенным количеством.");
        return;
      }
      decisions.push({
        itemId: item.id,
        acceptedQuantity,
        ...(reason ? { reason } : {}),
      });
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const error = await onConfirm(decisions);
      if (error) {
        setSubmitError(error);
        return;
      }
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <span ref={triggerContainerRef}>
        <DmButton
          appearance="primary"
          icon={<CheckmarkCircle24Regular />}
          onClick={() => changeOpen(true)}
        >
          Проверить и подтвердить
        </DmButton>
      </span>
      <DmDialog
        open={open}
        onOpenChange={changeOpen}
        title={`Подтверждение заказа ${order.orderNumber}`}
        description="Проверьте доступное количество. Уменьшение освободит лишний резерв и изменит итог заказа; причина будет видна клинике."
        actions={
          <>
            <DmButton appearance="secondary" disabled={submitting} onClick={() => changeOpen(false)}>
              Вернуться к заказам
            </DmButton>
            <DmButton appearance="primary" onClick={() => void submit()} disabled={submitting}>
              {submitting ? "Сохраняем решение…" : "Подтвердить заказ"}
            </DmButton>
          </>
        }
      >
        <div className={styles.content}>
          <div className={styles.items}>
            {order.items.map((item) => {
              const accepted = Number(
                draft[item.id]?.acceptedQuantity ?? item.quantity,
              );
              const invalid =
                !Number.isFinite(accepted) ||
                accepted < 0 ||
                accepted > Number(item.quantity);
              const reduced =
                Number.isFinite(accepted) && accepted < Number(item.quantity);
              const productName = item.offer.productVariant.product.canonicalName;
              return (
                <section className={styles.item} key={item.id}>
                  <div className={styles.itemHeading}>
                    <strong>{productName}</strong>
                    <span>Заказано: {quantityLabel(item.quantity)}</span>
                  </div>
                  <DmField
                    label="Подтверждаемое количество"
                    validationState={invalid ? "error" : "none"}
                    validationMessage={
                      invalid
                        ? `Допустимо от 0 до ${quantityLabel(item.quantity)}`
                        : undefined
                    }
                  >
                    <DmInput
                      aria-label={`Подтверждаемое количество: ${productName}`}
                      type="number"
                      min={0}
                      max={Number(item.quantity)}
                      step="any"
                      value={draft[item.id]?.acceptedQuantity ?? ""}
                      onChange={(_, data) =>
                        setDraft((current) => ({
                          ...current,
                          [item.id]: {
                            ...current[item.id],
                            acceptedQuantity: data.value,
                          },
                        }))
                      }
                    />
                  </DmField>
                  {reduced ? (
                    <DmField
                      label="Причина изменения для клиники"
                      required
                      validationState={
                        (draft[item.id]?.reason.trim().length ?? 0) >= 3
                          ? "none"
                          : "error"
                      }
                      validationMessage={
                        (draft[item.id]?.reason.trim().length ?? 0) >= 3
                          ? undefined
                          : "Минимум 3 символа"
                      }
                    >
                      <DmTextarea
                        aria-label={`Причина изменения: ${productName}`}
                        resize="vertical"
                        value={draft[item.id]?.reason ?? ""}
                        onChange={(_, data) =>
                          setDraft((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              reason: data.value,
                            },
                          }))
                        }
                      />
                    </DmField>
                  ) : null}
                </section>
              );
            })}
          </div>
          <div className={styles.summary} aria-live="polite">
            <span>Новый итог: <strong>{formatMoney(preview, order.currency)}</strong></span>
            <span>
              {reduction > 0
                ? `Уменьшение: ${formatMoney(reduction, order.currency)}`
                : "Заказ подтверждается полностью"}
            </span>
          </div>
          {submitError ? (
            <DmFeedback
              tone="danger"
              title="Заказ не подтверждён"
              description={submitError}
              alert
            />
          ) : null}
        </div>
      </DmDialog>
    </>
  );
}
