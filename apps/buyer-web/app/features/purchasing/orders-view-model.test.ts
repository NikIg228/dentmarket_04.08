import { describe, expect, it } from "vitest";
import {
  hasPartialDecision,
  isOrderReviewable,
  summarizeOrders,
} from "./orders-view-model";
import type { SupplierOrder } from "./types";

const order = (overrides: Partial<SupplierOrder> = {}): SupplierOrder => ({
  id: "order-1",
  buyerOrganizationId: "buyer-1",
  orderNumber: "DM-001",
  status: "AWAITING_CONFIRMATION",
  subtotalAmountMinor: "9007199254740993",
  currency: "KZT",
  createdAt: "2026-09-02T00:00:00.000Z",
  supplier: { displayName: "Demo Dental" },
  items: [
    {
      id: "line-1",
      quantity: "3",
      acceptedQuantity: "2",
      decisionReason: "Остаток изменился",
      status: "PARTIALLY_CONFIRMED",
      offer: {
        productVariant: { product: { canonicalName: "Перчатки" } },
      },
    },
  ],
  ...overrides,
});

describe("buyer orders view model", () => {
  it("summarizes order states and precise minor-unit volume", () => {
    const result = summarizeOrders([
      order(),
      order({
        id: "order-2",
        status: "CONFIRMED",
        subtotalAmountMinor: "7",
      }),
    ]);
    expect(result).toMatchObject({
      total: 2,
      awaitingConfirmation: 1,
      confirmed: 1,
      volumeMinor: BigInt("9007199254741000"),
      currency: "KZT",
    });
  });

  it("detects supplier quantity changes", () => {
    expect(hasPartialDecision(order({ status: "PARTIALLY_CONFIRMED" }))).toBe(true);
  });

  it.each(["DRAFT", "AWAITING_CONFIRMATION", "RESERVED", "REJECTED", "CANCELLED"])(
    "%s is not a partial decision even when accepted quantity is zero",
    (status) => expect(hasPartialDecision(order({ status, items: order().items.map(item => ({ ...item, acceptedQuantity: "0" })) }))).toBe(false),
  );

  it("distinguishes full confirmation and preserves partial decisions after shipment", () => {
    expect(hasPartialDecision(order({ status: "CONFIRMED", items: order().items.map(item => ({ ...item, acceptedQuantity: item.quantity })) }))).toBe(false);
    expect(hasPartialDecision(order({ status: "SHIPPED" }))).toBe(true);
  });

  it("only enables reviews for terminal buyer-visible states", () => {
    expect(isOrderReviewable("DELIVERED")).toBe(true);
    expect(isOrderReviewable("CONFIRMED")).toBe(false);
  });
});
