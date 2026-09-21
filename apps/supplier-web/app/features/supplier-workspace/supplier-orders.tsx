import { ClipboardTaskListLtr24Regular } from "@fluentui/react-icons/svg/clipboard-task-list-ltr";
import type { MarketplaceApiClient } from "@marketplace/api-client";
import {
  DmTable,
  EmptyState,
  PageHeader,
  Section,
  StatusTag,
  formatDate,
  formatMoney,
  formatStatus,
} from "@marketplace/ui";
import { Fragment, useEffect, useState } from "react";
import {
  OrderConfirmationPanel,
  type OrderConfirmationDecision,
} from "../../order-confirmation-panel";
import { OrderDocumentPanel } from "../../order-document-panel";
import { ShipmentPanel } from "../../shipment-panel";
import type { SupplierOrder } from "./types";
import { statusTone } from "./view-model";

export function SupplierOrders({
  orders,
  api,
  onConfirm,
  onChanged,
}: {
  orders: SupplierOrder[];
  api: MarketplaceApiClient;
  onConfirm: (
    order: SupplierOrder,
    decisions: OrderConfirmationDecision[],
  ) => Promise<string | null>;
  onChanged: () => Promise<void>;
}) {
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusOrderId) return;
    // The confirmation trigger unmounts on success. Restore focus from its
    // surviving parent, after the updated row and dialog removal are committed.
    const frame = requestAnimationFrame(() => {
      document.getElementById(`supplier-order-${focusOrderId}`)?.focus();
      setFocusOrderId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusOrderId, orders]);
  return (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Исполнение"
        title="Заказы покупателей"
        description="Подтвердите доступное количество, затем создайте отгрузку и комплект документов."
      />
      <Section>
        {!orders.length ? (
          <EmptyState
            icon={<ClipboardTaskListLtr24Regular />}
            title="Заказов пока нет"
            description="Новые заказы появятся после резервирования покупателем."
          />
        ) : (
          <DmTable
            caption="Заказы покупателей"
            columns={[
              { key: "order", label: "Заказ" },
              { key: "buyer", label: "Покупатель" },
              { key: "items", label: "Состав" },
              { key: "total", label: "Сумма" },
              { key: "status", label: "Статус" },
              { key: "action", label: "Действие" },
            ]}
          >
            {orders.map((order) => (
              <Fragment key={order.id}>
                <tr id={`supplier-order-${order.id}`} tabIndex={-1}>
                  <td data-label="Заказ">
                    <strong>{order.orderNumber}</strong>
                    <small>{formatDate(order.createdAt, true)}</small>
                  </td>
                  <td data-label="Покупатель">{order.buyer.displayName}</td>
                  <td data-label="Состав">
                    {order.items
                      .map((item) => item.offer.productVariant.product.canonicalName)
                      .join(", ")}
                  </td>
                  <td data-label="Сумма">
                    {formatMoney(order.subtotalAmountMinor, order.currency)}
                  </td>
                  <td data-label="Статус">
                    <StatusTag tone={statusTone(order.status)}>
                      {formatStatus(order.status)}
                    </StatusTag>
                  </td>
                  <td data-label="Действие">
                    {order.status === "AWAITING_CONFIRMATION" ? (
                      <OrderConfirmationPanel
                        order={order}
                        onConfirm={async (decisions) => {
                          const error = await onConfirm(order, decisions);
                          if (!error) setFocusOrderId(order.id);
                          return error;
                        }}
                      />
                    ) : (
                      <span className="mp-muted">Решение принято</span>
                    )}
                  </td>
                </tr>
                {order.status !== "AWAITING_CONFIRMATION" &&
                order.status !== "REJECTED" ? (
                  <tr>
                    <td data-label="Исполнение" colSpan={6}>
                      <ShipmentPanel order={order} api={api} onChanged={onChanged} />
                      <OrderDocumentPanel order={order} api={api} onChanged={onChanged} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </DmTable>
        )}
      </Section>
    </div>
  );
}
