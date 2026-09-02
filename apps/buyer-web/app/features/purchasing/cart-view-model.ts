import type { Cart, CartValidation } from "./types";

export type CartValidationPresentation = {
  tone: "neutral" | "success" | "warning" | "danger";
  message: string;
  blocking: boolean;
};

export function cartValidationPresentation(
  validation: CartValidation | null,
  loading: boolean,
): CartValidationPresentation {
  if (loading) {
    return {
      tone: "neutral",
      message: "Проверяем актуальные цены и остатки…",
      blocking: false,
    };
  }
  if (!validation) {
    return {
      tone: "neutral",
      message: "Проверка корзины ещё не выполнена.",
      blocking: true,
    };
  }
  if (validation.requiresAcceptance) {
    return {
      tone: "warning",
      message:
        "В корзине изменились цены. Проверьте позиции и примите изменения перед оформлением.",
      blocking: true,
    };
  }
  if (!validation.canCheckout) {
    return {
      tone: "danger",
      message:
        "Некоторые позиции сейчас нельзя заказать в выбранном количестве.",
      blocking: true,
    };
  }
  if (validation.hasChanges) {
    return {
      tone: "warning",
      message: "Остатки обновились. Новые значения показаны рядом со старыми.",
      blocking: false,
    };
  }
  return {
    tone: "success",
    message: "Цены и остатки актуальны.",
    blocking: false,
  };
}

export function cartTotalMinor(
  cart: Cart,
  validation: CartValidation | null,
): bigint {
  const validationByItem = new Map(
    (validation?.items ?? []).map((item) => [item.cartItemId, item]),
  );
  return cart.items.reduce(
    (sum, item) =>
      sum +
      BigInt(
        validationByItem.get(item.id)?.current?.totalPriceMinor ??
          item.totalPriceMinor,
      ),
    BigInt(0),
  );
}
