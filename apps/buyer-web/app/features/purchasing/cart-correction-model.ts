import { updateCartItemSchema } from "@marketplace/schemas";
export function parseCartQuantity(value: string) {
  if (!/^\d+(?:[.,]\d{1,6})?$/.test(value.trim())) return null;
  const quantity = Number(value.trim().replace(",", "."));
  return updateCartItemSchema.safeParse({ quantity, expectedVersion: 1 }).success ? quantity : null;
}
