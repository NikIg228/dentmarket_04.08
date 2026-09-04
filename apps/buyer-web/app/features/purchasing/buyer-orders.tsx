"use client";

import { Box24Regular } from "@fluentui/react-icons/svg/box";
import { CheckmarkCircle24Regular } from "@fluentui/react-icons/svg/checkmark-circle";
import { ClipboardTaskListLtr24Regular } from "@fluentui/react-icons/svg/clipboard-task-list-ltr";
import { ShoppingBag24Regular } from "@fluentui/react-icons/svg/shopping-bag";
import type { MarketplaceApiClient } from "@marketplace/api-client";
import {
  DmButton,
  DmInput,
  DmSelect,
  DmTable,
  EmptyState,
  Metric,
  PageHeader,
  Section,
  StatusTag,
  formatDate,
  formatMoney,
  formatStatus,
} from "@marketplace/ui";
import { Fragment } from "react";
import { OrderDecisionDetails } from "../../order-decision-details";
import { OrderDocuments } from "../../order-documents";
import { OrderShipments } from "../../order-shipments";
import {
  hasPartialDecision,
  isOrderReviewable,
  summarizeOrders,
} from "./orders-view-model";
import styles from "./buyer-orders.module.css";
import type { ReviewDraft, SupplierOrder } from "./types";

type BuyerOrdersProps = {
  orders: SupplierOrder[];
  api: MarketplaceApiClient;
  busy: string | null;
  submittedReviews: string[];
  reviewDraft: (orderId: string) => ReviewDraft;
  onReviewDraftChange: (orderId: string, draft: ReviewDraft) => void;
  onSubmitReview: (orderId: string) => void;
};

function orderTone(
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["COMPLETED", "CONFIRMED", "DELIVERED"].includes(status)) {
    return "success";
  }
  if (["FAILED", "REJECTED", "CANCELLED", "EXPIRED"].includes(status)) {
    return "danger";
  }
  if (["AWAITING_CONFIRMATION", "PENDING"].includes(status)) {
    return "warning";
  }
  return "info";
}

export function BuyerOrders({
  orders,
  api,
  busy,
  submittedReviews,
  reviewDraft,
  onReviewDraftChange,
  onSubmitReview,
}: BuyerOrdersProps) {
  const summary = summarizeOrders(orders);

  return (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Исполнение"
        title="Заказы"
        description="Одна корзина автоматически разделяется на отдельные заказы поставщикам. Здесь собраны статусы, изменения, отгрузки и документы."
      />
      <div className="mp-metrics">
        <Metric
          label="Всего заказов"
          value={summary.total}
          detail="По всем поставщикам"
          icon={<ClipboardTaskListLtr24Regular />}
        />
        <Metric
          label="Ждут подтверждения"
          value={summary.awaitingConfirmation}
          detail="Резерв уже создан"
          icon={<Box24Regular />}
        />
        <Metric
          label="Подтверждены"
          value={summary.confirmed}
          detail="Готовы к отгрузке"
          icon={<CheckmarkCircle24Regular />}
        />
        <Metric
          label="Объём закупок"
          value={
            summary.hasMixedCurrencies
              ? "Несколько валют"
              : formatMoney(summary.volumeMinor, summary.currency)
          }
          detail="Включая текущие заказы"
          icon={<ShoppingBag24Regular />}
        />
      </div>
      <Section>
        {!orders.length ? (
          <EmptyState
            icon={<ClipboardTaskListLtr24Regular />}
            title="Заказов ещё нет"
            description="Оформленные корзины появятся здесь."
          />
        ) : (
          <DmTable
            className={styles.ordersTable}
            caption="Заказы клиники по поставщикам"
            columns={[
              { key: "order", label: "Заказ" },
              { key: "supplier", label: "Поставщик" },
              { key: "items", label: "Позиции" },
              { key: "total", label: "Сумма" },
              { key: "status", label: "Статус" },
              { key: "created", label: "Создан" },
            ]}
          >
                {orders.map((order) => {
                  const draft = reviewDraft(order.id);
                  const reviewSubmitted = submittedReviews.includes(order.id);
                  return (
                    <Fragment key={order.id}>
                      <tr className={styles.orderRow}>
                        <td data-label="Заказ">
                          <strong>{order.orderNumber}</strong>
                          <small className="mp-mono">{order.id.slice(0, 8)}</small>
                        </td>
                        <td data-label="Поставщик">{order.supplier.displayName}</td>
                        <td data-label="Позиции">{order.items.length}</td>
                        <td data-label="Сумма">
                          {formatMoney(order.subtotalAmountMinor, order.currency)}
                        </td>
                        <td data-label="Статус">
                          <StatusTag tone={orderTone(order.status)}>
                            {formatStatus(order.status)}
                          </StatusTag>
                        </td>
                        <td data-label="Создан">{formatDate(order.createdAt, true)}</td>
                      </tr>
                      {hasPartialDecision(order) ? (
                        <tr className={styles.detailRow}>
                          <td colSpan={6}>
                            <OrderDecisionDetails order={order} />
                          </td>
                        </tr>
                      ) : null}
                      {order.shipments?.length ? (
                        <tr className={styles.detailRow}>
                          <td colSpan={6}>
                            <OrderShipments shipments={order.shipments} />
                          </td>
                        </tr>
                      ) : null}
                      {order.documents?.length ? (
                        <tr className={styles.detailRow}>
                          <td colSpan={6}>
                            <OrderDocuments
                              orderNumber={order.orderNumber}
                              documents={order.documents}
                              api={api}
                            />
                          </td>
                        </tr>
                      ) : null}
                      {isOrderReviewable(order.status) ? (
                        <tr className={styles.detailRow}>
                          <td colSpan={6}>
                            <div className={styles.reviewForm}>
                              <div>
                                <strong>
                                  {reviewSubmitted
                                    ? "Отзыв отправлен"
                                    : "Оцените исполнение заказа"}
                                </strong>
                                <span>
                                  {reviewSubmitted
                                    ? "Оценка будет учтена в рейтинге поставщика."
                                    : "Оцените соответствие цены, наличия и поставки."}
                                </span>
                              </div>
                              {!reviewSubmitted ? (
                                <div className={styles.reviewControls}>
                                  <DmSelect
                                    aria-label={`Оценка заказа ${order.orderNumber}`}
                                    value={String(draft.rating)}
                                    onChange={(_, data) =>
                                      onReviewDraftChange(order.id, {
                                        ...draft,
                                        rating: Number(data.value),
                                      })
                                    }
                                  >
                                    <option value="5">5, отлично</option>
                                    <option value="4">4, хорошо</option>
                                    <option value="3">3, нормально</option>
                                    <option value="2">2, плохо</option>
                                    <option value="1">1, очень плохо</option>
                                  </DmSelect>
                                  <DmInput
                                    aria-label={`Комментарий к заказу ${order.orderNumber}`}
                                    value={draft.comment}
                                    onChange={(_, data) =>
                                      onReviewDraftChange(order.id, {
                                        ...draft,
                                        comment: data.value,
                                      })
                                    }
                                    placeholder="Комментарий о поставке, цене или наличии"
                                  />
                                  <DmButton
                                    onClick={() => onSubmitReview(order.id)}
                                    disabled={busy === `review:${order.id}`}
                                  >
                                    {busy === `review:${order.id}`
                                      ? "Отправляем"
                                      : "Оставить отзыв"}
                                  </DmButton>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
          </DmTable>
        )}
      </Section>
    </div>
  );
}
