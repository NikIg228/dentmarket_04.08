"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Textarea,
} from "@fluentui/react-components";
import { CheckmarkCircle24Regular } from "@fluentui/react-icons";
import { formatMoney } from "@marketplace/ui";
import { useMemo, useState } from "react";
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
        setSubmitError(
          "Подтверждённое количество должно быть от нуля до заказанного.",
        );
        return;
      }
      if (acceptedQuantity < requestedQuantity && reason.length < 3) {
        setSubmitError(
          "Укажите причину для каждой позиции с уменьшенным количеством.",
        );
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
    <Dialog
      open={open}
      onOpenChange={(_, data) => {
        setOpen(data.open);
        if (data.open) {
          setDraft(initialDraft(order));
          setSubmitError(null);
        }
      }}
    >
      <DialogTrigger disableButtonEnhancement>
        <Button appearance="primary" icon={<CheckmarkCircle24Regular />}>
          Проверить и подтвердить
        </Button>
      </DialogTrigger>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Подтверждение заказа {order.orderNumber}</DialogTitle>
          <DialogContent className={styles.content}>
            <p className={styles.intro}>
              Проверьте доступное количество. Уменьшение позиции освободит
              лишний резерв и изменит итог заказа; причина будет видна клинике.
            </p>
            <div className={styles.items}>
              {order.items.map((item) => {
                const accepted = Number(
                  draft[item.id]?.acceptedQuantity ?? item.quantity,
                );
                const reduced =
                  Number.isFinite(accepted) && accepted < Number(item.quantity);
                return (
                  <section className={styles.item} key={item.id}>
                    <div className={styles.itemHeading}>
                      <strong>
                        {item.offer.productVariant.product.canonicalName}
                      </strong>
                      <span>Заказано: {quantityLabel(item.quantity)}</span>
                    </div>
                    <Field
                      label="Подтверждаемое количество"
                      validationState={
                        !Number.isFinite(accepted) ||
                        accepted < 0 ||
                        accepted > Number(item.quantity)
                          ? "error"
                          : "none"
                      }
                      validationMessage={
                        !Number.isFinite(accepted) ||
                        accepted < 0 ||
                        accepted > Number(item.quantity)
                          ? `Допустимо от 0 до ${quantityLabel(item.quantity)}`
                          : undefined
                      }
                    >
                      <Input
                        aria-label={`Подтверждаемое количество: ${item.offer.productVariant.product.canonicalName}`}
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
                    </Field>
                    {reduced ? (
                      <Field
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
                        <Textarea
                          aria-label={`Причина изменения: ${item.offer.productVariant.product.canonicalName}`}
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
                      </Field>
                    ) : null}
                  </section>
                );
              })}
            </div>
            <div className={styles.summary} aria-live="polite">
              <span>
                Новый итог:{" "}
                <strong>{formatMoney(preview, order.currency)}</strong>
              </span>
              {reduction > 0 ? (
                <span>
                  Уменьшение: {formatMoney(reduction, order.currency)}
                </span>
              ) : (
                <span>Заказ подтверждается полностью</span>
              )}
            </div>
            {submitError ? (
              <div className={styles.error} role="alert">
                {submitError}
              </div>
            ) : null}
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" disabled={submitting}>
                Вернуться к заказам
              </Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? "Сохраняем решение" : "Подтвердить заказ"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
