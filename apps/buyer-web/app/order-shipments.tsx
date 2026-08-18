import { StatusTag, formatDate, formatStatus } from "@marketplace/ui";
import styles from "./order-shipments.module.css";

export type BuyerShipment = {
  id: string;
  shipmentNumber: string;
  status: string;
  trackingNumber: string | null;
  carrierName: string | null;
  updatedAt: string;
  warehouse?: { name: string };
};

function tone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["READY", "DELIVERED"].includes(status)) return "success";
  if (["FAILED", "CANCELLED", "RETURNED"].includes(status)) return "danger";
  if (["DRAFT", "PLANNED", "PACKING"].includes(status)) return "warning";
  return "info";
}

export function OrderShipments({ shipments }: { shipments: BuyerShipment[] }) {
  if (!shipments.length) return null;
  return (
    <section className={styles.panel} aria-label="Статусы отгрузок">
      <strong>Отгрузки</strong>
      <div className={styles.list}>
        {shipments.map((shipment) => (
          <article className={styles.item} key={shipment.id}>
            <div>
              <strong>{shipment.shipmentNumber}</strong>
              <p>{shipment.warehouse?.name ?? "Склад"} · {shipment.carrierName || "перевозчик уточняется"}{shipment.trackingNumber ? ` · трек ${shipment.trackingNumber}` : ""}</p>
              <small>Обновлено {formatDate(shipment.updatedAt, true)}</small>
            </div>
            <StatusTag tone={tone(shipment.status)}>{formatStatus(shipment.status)}</StatusTag>
          </article>
        ))}
      </div>
    </section>
  );
}
