import { describe, expect, it } from "vitest";
import {
  calculateAllocation,
  calculateLineTotal,
  cartItemSnapshot,
  compareCartLineSnapshots,
  quantityMatchesOffer,
  resolveSupplierOrderState,
  type CartLineSnapshot,
} from "./commerce-rules";

describe("commerce money and state invariants", () => {
  it("rounds fractional line totals deterministically", () => {
    expect(calculateLineTotal("12501", "1.5").toString()).toBe("18752");
  });

  it("keeps allocation gross equal to fee plus supplier net", () => {
    const allocation = calculateAllocation("12345");
    expect(allocation).toEqual({ gross: "12345", fee: "247", net: "12098" });
    expect(BigInt(allocation.fee) + BigInt(allocation.net)).toBe(
      BigInt(allocation.gross),
    );
  });

  it("derives supplier order state from all line decisions", () => {
    expect(
      resolveSupplierOrderState([{ quantity: 2, acceptedQuantity: 2 }]),
    ).toBe("CONFIRMED");
    expect(
      resolveSupplierOrderState([
        { quantity: 2, acceptedQuantity: 1, reason: "Only one is available" },
      ]),
    ).toBe("PARTIALLY_CONFIRMED");
    expect(
      resolveSupplierOrderState([
        { quantity: 2, acceptedQuantity: 0, reason: "Out of stock" },
      ]),
    ).toBe("REJECTED");
  });

  it("requires a buyer-visible reason for every reduced quantity", () => {
    expect(() =>
      resolveSupplierOrderState([{ quantity: 2, acceptedQuantity: 1 }]),
    ).toThrow("A reason is required when accepted quantity is reduced");
  });

  it("enforces minimum quantity and order increments", () => {
    expect(quantityMatchesOffer(5, 1, 2)).toBe(true);
    expect(quantityMatchesOffer(4, 1, 2)).toBe(false);
  });

  it("detects price and stock changes independently", () => {
    const previous: CartLineSnapshot = {
      resolvedAt: "2026-08-04T08:00:00.000Z",
      offerVersion: 1,
      source: "BASE",
      ruleId: "price-1",
      unitPriceMinor: "10000",
      quantity: "2",
      totalPriceMinor: "20000",
      currency: "KZT",
      minimumOrderQuantity: "1",
      orderIncrement: "1",
      availableQuantity: "50",
      fulfillmentStatus: "AVAILABLE",
    };
    const current = {
      ...previous,
      unitPriceMinor: "12000",
      totalPriceMinor: "24000",
      availableQuantity: "7",
    };
    expect(compareCartLineSnapshots(previous, current)).toEqual([
      "PRICE",
      "STOCK",
    ]);
  });

  it("does not invent a stock change for legacy cart snapshots", () => {
    const previous = cartItemSnapshot({
      quantity: "1",
      unitPriceMinor: "10000",
      totalPriceMinor: "10000",
      currency: "KZT",
      pricingSnapshot: {
        resolvedAt: "2026-08-04T08:00:00.000Z",
        offerVersion: 1,
        source: "BASE",
      },
    });
    const current = { ...previous, availableQuantity: "25" };
    expect(compareCartLineSnapshots(previous, current)).toEqual([]);
  });
});
