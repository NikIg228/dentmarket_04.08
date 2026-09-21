"use client";

import { useEffect, useRef } from "react";
import { Spinner } from "@fluentui/react-components";
import { Alert24Regular } from "@fluentui/react-icons/svg/alert";
import { ArrowSync24Regular } from "@fluentui/react-icons/svg/arrow-sync";
import { Cart24Regular } from "@fluentui/react-icons/svg/cart";
import { CheckmarkCircle24Regular } from "@fluentui/react-icons/svg/checkmark-circle";
import { ShoppingBag24Regular } from "@fluentui/react-icons/svg/shopping-bag";
import {
  DmButton,
  DmConflictState,
  DmTable,
  EmptyState,
  PageHeader,
  Section,
  formatMoney,
} from "@marketplace/ui";
import {
  cartTotalMinor,
  cartValidationPresentation,
} from "./cart-view-model";
import styles from "./buyer-cart.module.css";
import type { Cart, CartValidation } from "./types";
import type { MarketplaceApiClient } from "@marketplace/api-client";
import { CartQuantityEditor, useCartCorrection } from "./cart-correction";

type BuyerCartProps = {
  api: MarketplaceApiClient;
  onCartChanged: (cart: Cart) => void;
  onValidated: (value: CartValidation | null) => void;
  cart: Cart | null;
  validation: CartValidation | null;
  validationLoading: boolean;
  busy: string | null;
  onRefresh: () => void;
  onBrowseCatalog: () => void;
  onAcceptChanges: () => void;
  onCheckout: () => void;
};

function ValidationIcon({
  tone,
  loading,
}: {
  tone: "neutral" | "success" | "warning" | "danger";
  loading: boolean;
}) {
  if (loading) return <Spinner size="tiny" />;
  if (tone === "success") return <CheckmarkCircle24Regular />;
  if (tone === "neutral") return <ArrowSync24Regular />;
  return <Alert24Regular />;
}

export function BuyerCart({
  api, onCartChanged, onValidated,
  cart,
  validation,
  validationLoading,
  busy,
  onRefresh,
  onBrowseCatalog,
  onAcceptChanges,
  onCheckout,
}: BuyerCartProps) {
  const editor = useCartCorrection({ cart, api, onChanged: onCartChanged, onValidated });
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editor.pending && editor.notice === "Позиция удалена из корзины.") root.current?.querySelector<HTMLButtonElement>('[data-cart-refresh]')?.focus();
  }, [editor.pending, editor.notice]);
  const locked = Boolean(busy) || editor.pending || cart?.status !== "ACTIVE" || Boolean(cart.checkout);
  const checkedValidation = validation?.cartId === cart?.id && validation?.cartVersion === cart?.version ? validation : null;
  const validationByItem = new Map(
    (checkedValidation?.items ?? []).map((item) => [item.cartItemId, item]),
  );
  const presentation = cartValidationPresentation(
    checkedValidation,
    validationLoading || editor.pending,
  );

  return (
    <div className="mp-stack" ref={root}>
      <PageHeader
        eyebrow="Заказ"
        title="Корзина клиники"
        description="Перед резервированием система повторно проверяет цену, остаток и доступность каждой позиции."
        actions={
          <DmButton data-cart-refresh icon={<ArrowSync24Regular />} disabled={Boolean(busy) || editor.pending} onClick={cart ? () => void editor.reload() : onRefresh}>
            Обновить корзину
          </DmButton>
        }
      />
      {editor.pending ? <p role="status">Сохраняем и проверяем корзину…</p> : null}
      {editor.error ? <p role="alert">{editor.error}</p> : null}
      {editor.notice ? <p role="status">{editor.notice}</p> : null}
      {Object.entries(editor.drafts).filter(([id]) => !cart?.items.some(item => item.id === id)).map(([id, draft]) => <p key={id} role="alert">Позиция больше не находится в корзине. Несохранённое количество: {draft.value}. <DmButton onClick={() => editor.discard(id)}>Отменить ввод удалённой позиции</DmButton></p>)}
      {!cart?.items.length ? (
        <Section>
          <EmptyState
            icon={<Cart24Regular />}
            title="Корзина пока пуста"
            description="Добавьте товары из каталога, чтобы собрать заказ нескольким поставщикам."
            action={
              <DmButton appearance="primary" onClick={onBrowseCatalog}>
                Перейти в каталог
              </DmButton>
            }
          />
        </Section>
      ) : (
        <Section
          title={`${cart.items.length} позиций`}
          description="Актуальная версия корзины"
          className={styles.cartSection}
        >
          <div className={styles.validationState}>
            <DmConflictState
              tone={presentation.tone}
              title={
                presentation.blocking ? "Нужно проверить" : "Проверка корзины"
              }
              description={presentation.message}
              icon={
                <ValidationIcon
                  tone={presentation.tone}
                  loading={validationLoading}
                />
              }
              blocking={presentation.blocking}
            />
          </div>

          <DmTable
            caption="Позиции корзины и результат повторной проверки цены и остатка"
            columns={[
              { key: "product", label: "Товар" },
              { key: "supplier", label: "Поставщик" },
              { key: "quantity", label: "Количество" },
              { key: "price", label: "Цена" },
              { key: "total", label: "Сумма" },
            ]}
          >
                {cart.items.map((item) => {
                  const itemValidation = validationByItem.get(item.id);
                  const current = itemValidation?.current;
                  const priceChanged =
                    itemValidation?.changes.includes("PRICE") ?? false;
                  const stockChanged =
                    itemValidation?.changes.includes("STOCK") ?? false;
                  const unavailable =
                    itemValidation?.status === "UNAVAILABLE" ||
                    (current !== undefined && current !== null && current.fulfillmentStatus !== "AVAILABLE");

                  return (
                    <tr
                      key={item.id}
                      className={
                        unavailable
                          ? styles.unavailableRow
                          : itemValidation?.status === "CHANGED"
                            ? styles.changedRow
                            : undefined
                      }
                    >
                      <td data-label="Товар">
                        <strong>
                          {item.offer?.productVariant?.product?.canonicalName ??
                            `Позиция ${item.offerId.slice(0, 8)}`}
                        </strong>
                        <small className="mp-mono">
                          {item.offerId.slice(0, 12)}
                        </small>
                        {itemValidation?.message ? (
                          <small
                            className={
                              unavailable ? styles.issue : styles.changeMessage
                            }
                          >
                            {itemValidation.message}
                          </small>
                        ) : null}
                      </td>
                      <td data-label="Поставщик">
                        {item.offer?.supplier?.organization?.displayName ??
                          "Поставщик"}
                      </td>
                      <td data-label="Количество">
                        <CartQuantityEditor id={item.id} name={item.offer?.productVariant?.product?.canonicalName ?? `Позиция ${item.offerId.slice(0, 8)}`} quantity={item.quantity} editor={editor} disabled={locked} />
                        <small
                          className={
                            stockChanged ? styles.changeMessage : undefined
                          }
                        >
                          Остаток: {itemValidation?.previous.availableQuantity ?? "—"}
                          {stockChanged || unavailable
                            ? ` → ${current?.availableQuantity ?? "0"}`
                            : ""}
                        </small>
                      </td>
                      <td data-label="Цена">
                        <div className={styles.valueChange}>
                          {priceChanged ? (
                            <del>
                              {formatMoney(
                                itemValidation?.previous.unitPriceMinor ??
                                  item.unitPriceMinor,
                                itemValidation?.previous.currency ?? item.currency,
                              )}
                            </del>
                          ) : null}
                          <strong>
                            {formatMoney(
                              current?.unitPriceMinor ?? item.unitPriceMinor,
                              current?.currency ?? item.currency,
                            )}
                          </strong>
                        </div>
                      </td>
                      <td data-label="Сумма">
                        <div className={styles.valueChange}>
                          {priceChanged ? (
                            <del>
                              {formatMoney(
                                itemValidation?.previous.totalPriceMinor ??
                                  item.totalPriceMinor,
                                itemValidation?.previous.currency ?? item.currency,
                              )}
                            </del>
                          ) : null}
                          <strong>
                            {formatMoney(
                              current?.totalPriceMinor ?? item.totalPriceMinor,
                              current?.currency ?? item.currency,
                            )}
                          </strong>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </DmTable>

          <div className={styles.checkoutBar}>
            <div>
              <span>Итого по корзине</span>
              <strong>{formatMoney(cartTotalMinor(cart, checkedValidation), cart.currency)}</strong>
              <small>Финальная сумма фиксируется после успешного резерва.</small>
            </div>
            <div className={styles.checkoutActions}>
              {editor.hasDrafts ? <p role="status">Сохраните или отмените введённое количество перед оформлением.</p> : null}
              {checkedValidation?.hasChanges ? (
                <DmButton
                  appearance={
                    checkedValidation.requiresAcceptance ? "primary" : "secondary"
                  }
                  icon={<ArrowSync24Regular />}
                  onClick={onAcceptChanges}
                  disabled={locked || editor.hasDrafts || validationLoading}
                >
                  {busy === "reprice"
                    ? "Применяем изменения"
                    : "Принять изменения"}
                </DmButton>
              ) : null}
              <DmButton
                appearance="primary"
                size="large"
                icon={<ShoppingBag24Regular />}
                onClick={onCheckout}
                disabled={
                  locked || editor.hasDrafts ||
                  validationLoading ||
                  !checkedValidation?.canCheckout
                }
              >
                {busy === "checkout" ? "Резервируем" : "Оформить заказ"}
              </DmButton>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
