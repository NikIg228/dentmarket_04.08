import { Prisma } from "@prisma/client";

// Aggregates must describe the offers that passed admission and tenant filters,
// not a cached projection that can still contain a suspended supplier's prices.
export function visibleOfferSummary(offers: Array<{ normalizedPriceMinor: string | null; available: boolean }>) {
  const prices = offers.flatMap(offer => offer.normalizedPriceMinor === null ? [] : [new Prisma.Decimal(offer.normalizedPriceMinor)]);
  return {
    minNormalizedPriceMinor: prices.length ? Prisma.Decimal.min(...prices).toString() : null,
    maxNormalizedPriceMinor: prices.length ? Prisma.Decimal.max(...prices).toString() : null,
    isAvailable: offers.some(offer => offer.available),
  };
}
