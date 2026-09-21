import { expect, it } from "vitest";
import { updateCartItemSchema, cartVersionSchema, checkoutCartSchema, repriceCartSchema } from "./index.js";
it.each([0,-1,1_000_001,0.0000001,NaN,Infinity])("rejects unsupported quantity %s", quantity => {
  expect(updateCartItemSchema.safeParse({ quantity, expectedVersion: 1 }).success).toBe(false);
});
it.each([1,2.5,0.000001,1_000_000])("accepts explicit quantity %s", quantity => {
  expect(updateCartItemSchema.parse({ quantity, expectedVersion: 2 }).quantity).toBe(quantity);
});
it("requires a positive version and rejects hidden fields", () => {
  expect(updateCartItemSchema.safeParse({ quantity: 2 }).success).toBe(false);
  expect(cartVersionSchema.safeParse({ expectedVersion: 0 }).success).toBe(false);
  expect(cartVersionSchema.safeParse({ expectedVersion: 2, organizationId: "foreign" }).success).toBe(false);
});
it("supports version-aware acceptance/checkout without breaking legacy request bodies", () => {
  expect(checkoutCartSchema.parse({ idempotencyKey: "cart-correction", expectedVersion: 2 }).expectedVersion).toBe(2);
  expect(checkoutCartSchema.parse({ idempotencyKey: "cart-correction" }).expectedVersion).toBeUndefined();
  expect(repriceCartSchema.parse({})).toEqual({});
  expect(repriceCartSchema.safeParse({ expectedVersion: -1 }).success).toBe(false);
});
