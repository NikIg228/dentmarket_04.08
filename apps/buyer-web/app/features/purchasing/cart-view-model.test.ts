import { describe, expect, it } from "vitest";
import {
  cartTotalMinor,
  cartValidationPresentation,
} from "./cart-view-model";
import type { Cart, CartValidation } from "./types";

const cart: Cart = {
  id: "cart-1",
  status: "ACTIVE",
  currency: "KZT",
  createdAt: "2026-09-02T00:00:00.000Z",
  items: [
    {
      id: "line-1",
      offerId: "offer-1",
      quantity: "2",
      unitPriceMinor: "10000",
      totalPriceMinor: "20000",
      currency: "KZT",
    },
  ],
};

const validation: CartValidation = {
  cartId: cart.id,
  cartVersion: 2,
  validatedAt: "2026-09-02T00:00:01.000Z",
  hasChanges: true,
  requiresAcceptance: true,
  canCheckout: false,
  items: [
    {
      cartItemId: "line-1",
      offerId: "offer-1",
      status: "CHANGED",
      changes: ["PRICE"],
      canCheckout: false,
      requiresAcceptance: true,
      message: "Цена изменилась",
      previous: {
        resolvedAt: "2026-09-01T00:00:00.000Z",
        offerVersion: 1,
        source: "BASE",
        ruleId: null,
        unitPriceMinor: "10000",
        quantity: "2",
        totalPriceMinor: "20000",
        currency: "KZT",
        minimumOrderQuantity: "1",
        orderIncrement: "1",
        availableQuantity: "10",
        fulfillmentStatus: "AVAILABLE",
      },
      current: {
        resolvedAt: "2026-09-02T00:00:00.000Z",
        offerVersion: 2,
        source: "BASE",
        ruleId: null,
        unitPriceMinor: "12500",
        quantity: "2",
        totalPriceMinor: "25000",
        currency: "KZT",
        minimumOrderQuantity: "1",
        orderIncrement: "1",
        availableQuantity: "8",
        fulfillmentStatus: "AVAILABLE",
      },
    },
  ],
};

describe("buyer cart view model", () => {
  it("uses the revalidated line total without losing money precision", () => {
    expect(cartTotalMinor(cart, validation)).toBe(BigInt(25000));
  });

  it("marks an unaccepted reprice as a blocking warning", () => {
    expect(cartValidationPresentation(validation, false)).toMatchObject({
      tone: "warning",
      blocking: true,
    });
  });

  it("does not present a missing validation as checkout-ready", () => {
    expect(cartValidationPresentation(null, false)).toMatchObject({
      tone: "neutral",
      blocking: true,
    });
  });
});
