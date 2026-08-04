import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export function calculateLineTotal(
  unitPriceMinor: string | number,
  quantity: string | number,
) {
  return new Prisma.Decimal(unitPriceMinor)
    .mul(quantity)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateAllocation(
  grossAmountMinor: string | number,
  feeBasisPoints = 200,
) {
  const gross = BigInt(String(grossAmountMinor));
  const fee = (gross * BigInt(feeBasisPoints) + 5_000n) / 10_000n;
  return {
    gross: gross.toString(),
    fee: fee.toString(),
    net: (gross - fee).toString(),
  };
}

export function resolveSupplierOrderState(
  items: Array<{
    quantity: string | number;
    acceptedQuantity: string | number;
  }>,
) {
  if (items.length === 0)
    throw new BadRequestException(
      "Supplier order must contain at least one item",
    );
  let accepted = 0;
  let fullyAccepted = 0;
  for (const item of items) {
    const requested = Number(item.quantity);
    const decision = Number(item.acceptedQuantity);
    if (!Number.isFinite(decision) || decision < 0 || decision > requested)
      throw new BadRequestException(
        "Accepted quantity must be between zero and requested quantity",
      );
    if (decision > 0) accepted += 1;
    if (decision === requested) fullyAccepted += 1;
  }
  if (accepted === 0) return "REJECTED" as const;
  if (fullyAccepted === items.length) return "CONFIRMED" as const;
  return "PARTIALLY_CONFIRMED" as const;
}

export function quantityMatchesOffer(
  quantity: number,
  minimum: string | number,
  increment: string | number,
) {
  const delta = quantity - Number(minimum);
  if (delta < -1e-9) return false;
  const steps = delta / Number(increment);
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

export type CartLineSnapshot = {
  resolvedAt: string;
  offerVersion: number;
  source: string;
  ruleId: string | null;
  unitPriceMinor: string;
  quantity: string;
  totalPriceMinor: string;
  currency: string;
  minimumOrderQuantity: string;
  orderIncrement: string;
  availableQuantity: string | null;
  fulfillmentStatus: "AVAILABLE" | "INSUFFICIENT_STOCK" | "OUT_OF_STOCK";
};

export type CartLineChange = "PRICE" | "STOCK" | "AVAILABILITY" | "OFFER_RULES";

function optionalString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

export function cartItemSnapshot(item: {
  quantity: string | number | { toString(): string };
  unitPriceMinor: string | number | { toString(): string };
  totalPriceMinor: string | number | { toString(): string };
  currency: string;
  pricingSnapshot: unknown;
}): CartLineSnapshot {
  const raw =
    item.pricingSnapshot &&
    typeof item.pricingSnapshot === "object" &&
    !Array.isArray(item.pricingSnapshot)
      ? (item.pricingSnapshot as Record<string, unknown>)
      : {};
  return {
    resolvedAt: optionalString(raw.resolvedAt) ?? new Date(0).toISOString(),
    offerVersion: Number(raw.offerVersion ?? 0),
    source: optionalString(raw.source) ?? "UNKNOWN",
    ruleId: optionalString(raw.ruleId),
    unitPriceMinor: String(item.unitPriceMinor),
    quantity: String(item.quantity),
    totalPriceMinor: String(item.totalPriceMinor),
    currency: item.currency,
    minimumOrderQuantity: optionalString(raw.minimumOrderQuantity) ?? "1",
    orderIncrement: optionalString(raw.orderIncrement) ?? "1",
    availableQuantity: optionalString(raw.availableQuantity),
    fulfillmentStatus:
      raw.fulfillmentStatus === "OUT_OF_STOCK" ||
      raw.fulfillmentStatus === "INSUFFICIENT_STOCK"
        ? raw.fulfillmentStatus
        : "AVAILABLE",
  };
}

export function compareCartLineSnapshots(
  previous: CartLineSnapshot,
  current: CartLineSnapshot,
) {
  const changes: CartLineChange[] = [];
  if (
    previous.unitPriceMinor !== current.unitPriceMinor ||
    previous.totalPriceMinor !== current.totalPriceMinor ||
    previous.currency !== current.currency
  )
    changes.push("PRICE");
  // Old carts did not store inventory. The first validation establishes that
  // baseline instead of reporting a change that cannot be proven.
  if (
    previous.availableQuantity !== null &&
    previous.availableQuantity !== current.availableQuantity
  )
    changes.push("STOCK");
  if (previous.fulfillmentStatus !== current.fulfillmentStatus)
    changes.push("AVAILABILITY");
  if (
    previous.minimumOrderQuantity !== current.minimumOrderQuantity ||
    previous.orderIncrement !== current.orderIncrement
  )
    changes.push("OFFER_RULES");
  return changes;
}
