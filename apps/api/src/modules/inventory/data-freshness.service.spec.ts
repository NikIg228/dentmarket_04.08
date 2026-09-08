import { Prisma } from "@prisma/client";
import { createDataOverrideSchema } from "@marketplace/schemas";
import { describe, expect, it, vi } from "vitest";
import { DataFreshnessService } from "./data-freshness.service";

describe("DataFreshnessService manual price override", () => {
  it("writes exact minor units above Number.MAX_SAFE_INTEGER", async () => {
    const exactAmountMinor = "9007199254740993";
    const input = createDataOverrideSchema.parse({
      target: "PRICE",
      offerId: "00000000-0000-4000-8000-000000000150",
      mode: "PERMANENT",
      value: { amountMinor: exactAmountMinor, currency: "KZT" },
      reason: "Точная ручная цена",
    });
    const tx = {
      dataOverride: {
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({
          id: "override-1",
          supplierOrganizationId: "supplier-1",
          offerId: input.offerId,
          inventoryBalanceId: null,
          target: "PRICE",
          mode: "PERMANENT",
        }),
      },
      offerPrice: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: "price-1" }),
      },
      offerPriceHistory: { create: vi.fn().mockResolvedValue({ id: "history-1" }) },
      supplierOffer: { update: vi.fn().mockResolvedValue({ id: input.offerId }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      outboxEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
    };
    const prisma = {
      supplierOffer: { findFirst: vi.fn().mockResolvedValue({ id: input.offerId }) },
      inventoryBalance: { findFirst: vi.fn() },
      dataOverride: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const access = { assertCanManage: vi.fn().mockResolvedValue(undefined) };
    const service = new DataFreshnessService(prisma as never, access as never);

    await service.createOverride("supplier-1", input, {
      actorId: "user-1",
      organizationId: "supplier-1",
    });

    const activePrice = tx.offerPrice.create.mock.calls[0]?.[0] as { data: { amountMinor: Prisma.Decimal } };
    const history = tx.offerPriceHistory.create.mock.calls[0]?.[0] as { data: { amountMinor: Prisma.Decimal } };
    expect(input.value.amountMinor).toBe(exactAmountMinor);
    expect(activePrice.data.amountMinor.toString()).toBe(exactAmountMinor);
    expect(history.data.amountMinor.toString()).toBe(exactAmountMinor);
  });
});
