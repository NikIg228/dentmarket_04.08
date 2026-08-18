"use client";

import { Button, Field, Input, Select, Spinner } from "@fluentui/react-components";
import type { MarketplaceApiClient, OrderDocumentResponse } from "@marketplace/api-client";
import { StatusTag, errorMessage, formatDate, formatStatus } from "@marketplace/ui";
import { useMemo, useState } from "react";
import styles from "./shipment-panel.module.css";

export type ShipmentRecord = {
  id: string;
  shipmentNumber: string;
  status: string;
  version: number;
  method: string;
  trackingNumber: string | null;
  carrierName: string | null;
  updatedAt: string;
  warehouse?: { name: string; code: string };
  items: Array<{
    id: string;
    supplierOrderItemId: string;
    quantity: string;
    deliveredQuantity: string;
  }>;
};

export type ShipmentOrder = {
  id: string;
  supplierOrganizationId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotalAmountMinor: string;
  currency: string;
  createdAt: string;
  buyer: { displayName: string };
  items: Array<{
    id: string;
    warehouseId: string;
    warehouse?: { name: string; code: string };
    quantity: string;
    acceptedQuantity: string | null;
    decisionReason: string | null;
    unitPriceMinor: string;
    status: string;
    offer: { productVariant: { product: { canonicalName: string } } };
  }>;
  shipments?: ShipmentRecord[];
  documents?: OrderDocumentResponse[];
};

const nextStatus: Record<string, { status: string; label: string }> = {
  DRAFT: { status: "PLANNED", label: "Запланировать" },
  PLANNED: { status: "PACKING", label: "Начать сборку" },
  PACKING: { status: "READY", label: "Готово к отправке" },
  READY: { status: "DISPATCHED", label: "Передать перевозчику" },
  DISPATCHED: { status: "IN_TRANSIT", label: "Отметить «В пути»" },
};

function tone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["READY", "DELIVERED"].includes(status)) return "success";
  if (["FAILED", "CANCELLED", "RETURNED"].includes(status)) return "danger";
  if (["DRAFT", "PLANNED", "PACKING"].includes(status)) return "warning";
  return "info";
}

export function ShipmentPanel({
  order,
  api,
  onChanged,
}: {
  order: ShipmentOrder;
  api: MarketplaceApiClient;
  onChanged: () => Promise<void>;
}) {
  const shipments = order.shipments ?? [];
  const warehouses = useMemo(
    () => [...new Map(order.items.map((item) => [item.warehouseId, item.warehouse])).entries()],
    [order.items],
  );
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.[0] ?? "");
  const [recipientName, setRecipientName] = useState(order.buyer.displayName);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [trackingByShipment, setTrackingByShipment] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const remainingItems = order.items
    .filter((item) => item.warehouseId === warehouseId)
    .map((item) => {
      const accepted = Number(item.acceptedQuantity ?? 0);
      const planned = shipments
        .filter((shipment) => !["CANCELLED", "RETURNED"].includes(shipment.status))
        .flatMap((shipment) => shipment.items)
        .filter((shipmentItem) => shipmentItem.supplierOrderItemId === item.id)
        .reduce((sum, shipmentItem) => sum + Number(shipmentItem.quantity), 0);
      return { item, quantity: accepted - planned };
    })
    .filter(({ quantity }) => quantity > 0);

  const createShipment = async () => {
    if (!recipientName.trim() || !warehouseId || remainingItems.length === 0) return;
    setBusy("create");
    setError(null);
    setSuccess(null);
    try {
      await api.createShipment(order.id, {
        warehouseId,
        method: "CARRIER",
        recipientName: recipientName.trim(),
        destinationAddress: recipientAddress.trim() ? { line1: recipientAddress.trim() } : null,
        carrierName: carrierName.trim() || null,
        items: remainingItems.map(({ item, quantity }) => ({ supplierOrderItemId: item.id, quantity })),
        fulfillmentSteps: [],
      });
      await onChanged();
      setSuccess("Отгрузка создана. Запланируйте её и обновляйте статус по факту.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const transition = async (shipment: ShipmentRecord) => {
    const action = nextStatus[shipment.status];
    if (!action) return;
    const trackingNumber = (trackingByShipment[shipment.id] ?? shipment.trackingNumber ?? "").trim();
    if (action.status === "DISPATCHED" && shipment.method === "CARRIER" && !trackingNumber) {
      setError("Перед отправкой через перевозчика укажите трек-номер.");
      return;
    }
    setBusy(`transition:${shipment.id}`);
    setError(null);
    setSuccess(null);
    try {
      await api.transitionShipment(shipment.id, {
        version: shipment.version,
        status: action.status as "PLANNED" | "PACKING" | "READY" | "DISPATCHED" | "IN_TRANSIT",
        trackingNumber: trackingNumber || undefined,
        carrierName: carrierName.trim() || shipment.carrierName || undefined,
      });
      await onChanged();
      setSuccess(`Статус отгрузки обновлён: ${formatStatus(action.status)}.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.panel} aria-label={`Отгрузки заказа ${order.orderNumber}`}>
      <header className={styles.header}>
        <div><strong>Отгрузки</strong><p>Статусы синхронизируются с заказом и уведомляют клинику.</p></div>
        <span>{shipments.length}</span>
      </header>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {success ? <div className={styles.success} role="status">{success}</div> : null}
      {shipments.length ? (
        <div className={styles.list}>
          {shipments.map((shipment) => {
            const action = nextStatus[shipment.status];
            const needsTracking = action?.status === "DISPATCHED" && shipment.method === "CARRIER";
            return (
              <article className={styles.shipment} key={shipment.id}>
                <div className={styles.shipmentMain}>
                  <div><strong>{shipment.shipmentNumber}</strong><p>{shipment.warehouse?.name ?? "Склад"} · обновлено {formatDate(shipment.updatedAt, true)}</p></div>
                  <StatusTag tone={tone(shipment.status)}>{formatStatus(shipment.status)}</StatusTag>
                </div>
                <p>{shipment.carrierName || "Перевозчик не указан"}{shipment.trackingNumber ? ` · трек ${shipment.trackingNumber}` : ""}</p>
                {needsTracking ? (
                  <Field label={`Трек-номер: ${shipment.shipmentNumber}`}>
                    <Input value={trackingByShipment[shipment.id] ?? shipment.trackingNumber ?? ""} onChange={(_, data) => setTrackingByShipment((value) => ({ ...value, [shipment.id]: data.value }))} />
                  </Field>
                ) : null}
                {action ? (
                  <Button appearance="secondary" disabled={busy !== null} onClick={() => void transition(shipment)}>
                    {busy === `transition:${shipment.id}` ? "Сохраняем…" : action.label}
                  </Button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : <p className={styles.empty}>Отгрузка ещё не создана.</p>}
      {order.paymentStatus !== "PAID" ? (
        <p className={styles.notice}>Создание отгрузки станет доступно после подтверждения оплаты.</p>
      ) : remainingItems.length ? (
        <div className={styles.form}>
          <Field label="Склад"><Select value={warehouseId} onChange={(_, data) => setWarehouseId(data.value)}>{warehouses.map(([id, warehouse]) => <option value={id} key={id}>{warehouse?.name ?? `Склад ${id.slice(0, 8)}`}</option>)}</Select></Field>
          <Field label="Получатель"><Input value={recipientName} onChange={(_, data) => setRecipientName(data.value)} /></Field>
          <Field label="Адрес доставки"><Input value={recipientAddress} onChange={(_, data) => setRecipientAddress(data.value)} /></Field>
          <Field label="Перевозчик (необязательно)"><Input value={carrierName} onChange={(_, data) => setCarrierName(data.value)} /></Field>
          <Button appearance="primary" disabled={busy !== null || !recipientName.trim()} onClick={() => void createShipment()}>{busy === "create" ? <Spinner size="tiny" label="Создаём" /> : "Создать отгрузку"}</Button>
        </div>
      ) : null}
    </section>
  );
}
