export type OrderConfirmationDecision = { itemId: string; acceptedQuantity: number; reason?: string };
export type ConfirmableOrder = {
  id: string;
  orderNumber: string;
  version?: number;
  status?: string;
  subtotalAmountMinor: string;
  currency: string;
  items: Array<{
    id: string; quantity: string; unitPriceMinor: string;
    offer: { productVariant: { product: { canonicalName: string } } };
  }>;
};
export type ConfirmationDraft = Record<string, { acceptedQuantity: string; reason: string }>;

export function initialConfirmationDraft(order: ConfirmableOrder): ConfirmationDraft {
  return Object.fromEntries(order.items.map(item => [item.id, { acceptedQuantity: item.quantity, reason: "" }]));
}

export function confirmationSnapshot(order: ConfirmableOrder) {
  return JSON.stringify([order.id, order.version, order.status, order.subtotalAmountMinor, order.currency,
    order.items.map(item => [item.id, item.quantity, item.unitPriceMinor])]);
}

export function confirmationQuantity(value: string | undefined, requested: string) {
  if (value == null || !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0 && quantity <= Math.min(1_000_000, Number(requested)) ? quantity : null;
}

// Match the existing API's positive per-line ROUND_HALF_UP. Money never enters Number.
export function confirmationLineMinor(price: string, quantity: number): bigint {
  const [mantissa, exponent = "0"] = String(quantity).split("e");
  const [integer, fraction = ""] = mantissa!.split(".");
  const scale = fraction.length - Number(exponent);
  const units = BigInt(integer! + fraction) * (scale < 0 ? BigInt("10") ** BigInt(-scale) : BigInt("1"));
  const denominator = scale > 0 ? BigInt("10") ** BigInt(scale) : BigInt("1");
  return (BigInt(price) * units + denominator / BigInt("2")) / denominator;
}

export function confirmationPreview(order: ConfirmableOrder, draft: ConfirmationDraft) {
  let total = BigInt("0"), anyAccepted = false, partial = false;
  for (const item of order.items) {
    const quantity = confirmationQuantity(draft[item.id]?.acceptedQuantity, item.quantity);
    if (quantity === null || !/^\d+$/.test(item.unitPriceMinor)) return null;
    total += confirmationLineMinor(item.unitPriceMinor, quantity);
    anyAccepted ||= quantity > 0;
    partial ||= quantity < Number(item.quantity);
  }
  const difference = BigInt(order.subtotalAmountMinor) - total;
  return { total, reduction: difference > BigInt("0") ? difference : BigInt("0"), rejected: !anyAccepted, partial };
}

export function formatConfirmationMoney(minor: bigint, currency: string) {
  const major = (minor / BigInt("100")).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const fraction = (minor % BigInt("100")).toString().padStart(2, "0").replace(/0+$/, "");
  return `${major}${fraction ? `,${fraction}` : ""} ${currency === "KZT" ? "₸" : currency}`;
}

export function confirmationOutcomeMessage(status: string) {
  if (status === "REJECTED") return "Заказ отклонён, причины переданы клинике";
  if (status === "PARTIALLY_CONFIRMED") return "Заказ подтверждён частично, итог и резерв пересчитаны";
  if (status === "CONFIRMED") return "Заказ подтверждён полностью";
  return "Решение по заказу сохранено";
}
