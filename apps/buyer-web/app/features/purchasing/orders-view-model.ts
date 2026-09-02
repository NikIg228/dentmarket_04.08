import type { SupplierOrder } from "./types";

const REVIEWABLE_STATUSES = new Set([
  "DELIVERED",
  "PARTIALLY_FULFILLED",
  "RETURN_DISPUTE",
  "REJECTED",
  "CANCELLED",
]);

export function isOrderReviewable(status: string) {
  return REVIEWABLE_STATUSES.has(status);
}

export function hasPartialDecision(order: SupplierOrder) {
  return order.items.some(
    (item) =>
      item.acceptedQuantity !== null &&
      Number(item.acceptedQuantity) < Number(item.quantity),
  );
}

export function summarizeOrders(orders: SupplierOrder[]) {
  const currencies = new Set(orders.map((order) => order.currency));
  return {
    total: orders.length,
    awaitingConfirmation: orders.filter(
      (order) => order.status === "AWAITING_CONFIRMATION",
    ).length,
    confirmed: orders.filter((order) => order.status === "CONFIRMED").length,
    volumeMinor: orders.reduce(
      (sum, order) => sum + BigInt(order.subtotalAmountMinor),
      BigInt(0),
    ),
    currency: currencies.size === 1 ? [...currencies][0] : "KZT",
    hasMixedCurrencies: currencies.size > 1,
  };
}
