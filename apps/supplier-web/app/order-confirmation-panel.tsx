"use client";

import { CheckmarkCircle24Regular } from "@fluentui/react-icons/svg/checkmark-circle";
import {
  DmButton,
  DmDialog,
  DmFeedback,
  DmField,
  DmInput,
  DmTextarea,
} from "@marketplace/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./order-confirmation-panel.module.css";
import {
  confirmationPreview, confirmationQuantity, confirmationSnapshot,
  formatConfirmationMoney, initialConfirmationDraft,
  type ConfirmableOrder, type OrderConfirmationDecision,
} from "./order-confirmation-model";
export type { ConfirmableOrder, OrderConfirmationDecision } from "./order-confirmation-model";

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
  const submitLock = useRef(false);
  const [draftOrder, setDraftOrder] = useState(order);
  const [draft, setDraft] = useState(() => initialConfirmationDraft(order));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Disabling the submitting button can move focus to body. Restore it inside
    // the dialog after an error so keyboard users can read it and press Escape.
    if (open && submitError && !submitting) errorRef.current?.focus();
  }, [open, submitError, submitting]);

  const preview = useMemo(() => confirmationPreview(draftOrder, draft), [draftOrder, draft]);
  const stale = confirmationSnapshot(draftOrder) !== confirmationSnapshot(order);
  const returnFocus = () => window.requestAnimationFrame(() => {
    const trigger = triggerContainerRef.current?.querySelector("button");
    (trigger ?? document.getElementById(`supplier-order-${order.id}`))?.focus();
  });

  const changeOpen = (nextOpen: boolean) => {
    if (submitLock.current) return;
    setOpen(nextOpen);
    if (!nextOpen) returnFocus();
  };

  const submit = async () => {
    if (submitLock.current || stale) return;
    const decisions: OrderConfirmationDecision[] = [];
    for (const item of draftOrder.items) {
      const acceptedQuantity = confirmationQuantity(draft[item.id]?.acceptedQuantity, item.quantity);
      const requestedQuantity = Number(item.quantity);
      const reason = draft[item.id]?.reason.trim() ?? "";
      if (
        acceptedQuantity === null
      ) {
        setSubmitError("Подтверждённое количество должно быть от нуля до заказанного.");
        return;
      }
      if (acceptedQuantity < requestedQuantity && reason.length < 3) {
        setSubmitError("Укажите причину для каждой позиции с уменьшенным количеством.");
        return;
      }
      if (reason.length > 500) {
        setSubmitError("Причина должна содержать не более 500 символов.");
        return;
      }
      decisions.push({
        itemId: item.id,
        acceptedQuantity,
        ...(reason ? { reason } : {}),
      });
    }
    submitLock.current = true; setSubmitting(true);
    setSubmitError(null);
    try {
      const error = await onConfirm(decisions);
      if (error) {
        setSubmitError(error);
        return;
      }
      setOpen(false);
      // Successful decisions remove this panel; the surviving order list owns focus.
    } catch {
      setSubmitError("Не удалось сохранить решение. Черновик сохранён — проверьте соединение и повторите попытку.");
    } finally {
      submitLock.current = false; setSubmitting(false);
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
        description="Проверьте доступное количество. Уменьшение освободит лишний резерв и изменит итог заказа; причина будет видна клинике. Черновик сохраняется при закрытии окна, пока вы остаётесь на этой странице."
        actions={
          <>
            <DmButton appearance="secondary" disabled={submitting} onClick={() => changeOpen(false)}>
              Вернуться к заказам
            </DmButton>
            <DmButton appearance="primary" onClick={() => void submit()} disabled={submitting || stale || preview === null}>
              {submitting ? "Сохраняем решение…" : "Подтвердить заказ"}
            </DmButton>
          </>
        }
      >
        <div className={styles.content}>
          {stale ? <DmFeedback tone="warning" title="Заказ обновился" description="Черновик сохранён, но относится к прежней версии заказа. Сверьте данные перед новым решением." alert /> : null}
          {stale ? <DmButton disabled={submitting} onClick={() => { setDraftOrder(order); setDraft(initialConfirmationDraft(order)); setSubmitError(null); }}>Начать заново по актуальному заказу</DmButton> : null}
          <div className={styles.items}>
            {draftOrder.items.map((item) => {
              const accepted = confirmationQuantity(draft[item.id]?.acceptedQuantity, item.quantity);
              const invalid = accepted === null;
              const reduced =
                accepted !== null && accepted < Number(item.quantity);
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
                      disabled={submitting || stale}
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
                        disabled={submitting || stale}
                        maxLength={500}
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
            <span>Новый итог: <strong>{preview ? formatConfirmationMoney(preview.total, draftOrder.currency) : "Уточните количество"}</strong></span>
            <span>
              {preview === null ? "Проверьте заполненные поля"
                : preview.rejected ? "Все позиции отклоняются"
                : preview.reduction > BigInt(0)
                  ? `Уменьшение: ${formatConfirmationMoney(preview.reduction, draftOrder.currency)}`
                  : preview.partial ? "Состав изменён, сумма не изменилась"
                  : "Заказ подтверждается полностью"}
            </span>
          </div>
          {submitError ? (
            <div ref={errorRef} tabIndex={-1} role="group" aria-label="Ошибка подтверждения заказа">
              <DmFeedback
                tone="danger"
                title="Заказ не подтверждён"
                description={submitError}
                alert
              />
            </div>
          ) : null}
        </div>
      </DmDialog>
    </>
  );
}
