import type { Balance, Credential, Integration, Offer, SupplierOrder } from "./types";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export function statusTone(status: string): StatusTone {
  if (
    [
      "ACTIVE",
      "PUBLISHED",
      "FRESH",
      "VERIFIED",
      "READY",
      "PASSED",
      "ALLOWED",
      "CONFIRMED",
      "SIGNED",
      "GENERATED",
      "DELIVERED",
    ].includes(status)
  ) {
    return "success";
  }
  if (
    [
      "FAILED",
      "BLOCKED",
      "REJECTED",
      "REVOKED",
      "EXPIRED",
      "DEAD",
      "CANCELLED",
      "RETURNED",
    ].includes(status)
  ) {
    return "danger";
  }
  if (
    [
      "PENDING",
      "AWAITING_CONFIRMATION",
      "STALE",
      "UNDER_REVIEW",
      "REVIEW_REQUIRED",
      "UNKNOWN",
      "DRAFT",
      "PLANNED",
      "PACKING",
    ].includes(status)
  ) {
    return "warning";
  }
  return "info";
}

export const integrationProviderLabel: Record<string, string> = {
  ONE_C: "1С",
  MOYSKLAD: "МойСклад",
  MOCK: "Тестовое подключение",
};

export const integrationModeLabel: Record<string, string> = {
  AGENT: "подключение через компьютер",
  API: "прямое подключение",
  HYBRID: "комбинированный режим",
};

export const credentialTypeLabel: Record<string, string> = {
  REGISTRATION_CERTIFICATE: "Регистрационное удостоверение",
  WHOLESALE_LICENSE: "Лицензия на оптовую торговлю",
  QUALITY_CERTIFICATE: "Сертификат качества",
  DISTRIBUTOR_AUTHORIZATION: "Разрешение дистрибьютора",
  MEDICAL_DEVICE_SALE_NOTIFICATION: "Уведомление о реализации медизделий",
};

export function supplierDashboardSummary({
  offers,
  balances,
  orders,
  integrations,
  credentials,
}: {
  offers: Offer[];
  balances: Balance[];
  orders: SupplierOrder[];
  integrations: Integration[];
  credentials: Credential[];
}) {
  return {
    activePriceCount: offers.filter((offer) =>
      offer.prices.some((price) => price.status === "ACTIVE"),
    ).length,
    publishedOfferCount: offers.filter(
      (offer) => offer.publication?.marketplaceVisible,
    ).length,
    hiddenOfferCount: offers.filter(
      (offer) => !offer.publication?.marketplaceVisible,
    ).length,
    stock: balances.reduce(
      (sum, balance) => sum + Number(balance.quantityAvailable),
      0,
    ),
    freshBalanceCount: balances.filter(
      (balance) => balance.freshnessStatus === "FRESH",
    ).length,
    staleBalanceCount: balances.filter(
      (balance) => balance.freshnessStatus !== "FRESH",
    ).length,
    pendingOrderCount: orders.filter(
      (order) => order.status === "AWAITING_CONFIRMATION",
    ).length,
    revenueMinor: orders.reduce(
      (sum, order) => sum + Number(order.subtotalAmountMinor),
      0,
    ),
    integrationJobCount: integrations.reduce(
      (sum, item) => sum + item._count.jobs,
      0,
    ),
    activeIntegrationCount: integrations.filter(
      (item) => item.status === "ACTIVE",
    ).length,
    verifiedCredentialCount: credentials.filter(
      (item) => item.status === "VERIFIED",
    ).length,
  };
}
