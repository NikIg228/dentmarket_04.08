"use client";

import { Spinner } from "@fluentui/react-components";
import {
  Alert24Regular,
  ArrowSync24Regular,
  Cart24Regular,
  CheckmarkCircle24Regular,
  ShoppingBag24Regular,
} from "@fluentui/react-icons";
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

type BuyerCartProps = {
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
  cart,
  validation,
  validationLoading,
  busy,
  onRefresh,
  onBrowseCatalog,
  onAcceptChanges,
  onCheckout,
}: BuyerCartProps) {
  const validationByItem = new Map(
    (validation?.items ?? []).map((item) => [item.cartItemId, item]),
  );
  const presentation = cartValidationPresentation(
    validation,
    validationLoading,
  );

  return (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Заказ"
        title="Корзина клиники"
        description="Перед резервированием система повторно проверяет цену, остаток и доступность каждой позиции."
        actions={
          <DmButton icon={<ArrowSync24Regular />} onClick={onRefresh}>
            Обновить
          </DmButton>
        }
      />
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
                    current?.fulfillmentStatus !== "AVAILABLE";

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
                        <strong>{item.quantity}</strong>
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
              <strong>{formatMoney(cartTotalMinor(cart, validation), cart.currency)}</strong>
              <small>Финальная сумма фиксируется после успешного резерва.</small>
            </div>
            <div className={styles.checkoutActions}>
              {validation?.hasChanges ? (
                <DmButton
                  appearance={
                    validation.requiresAcceptance ? "primary" : "secondary"
                  }
                  icon={<ArrowSync24Regular />}
                  onClick={onAcceptChanges}
                  disabled={busy === "reprice" || validationLoading}
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
                  busy === "checkout" ||
                  validationLoading ||
                  !validation?.canCheckout
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
