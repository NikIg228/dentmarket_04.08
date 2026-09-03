import { describe, expect, it } from "vitest";
import { statusTone, supplierDashboardSummary } from "./view-model";

describe("supplier workspace view model", () => {
  it("maps operational states to a consistent semantic tone", () => {
    expect(statusTone("ACTIVE")).toBe("success");
    expect(statusTone("AWAITING_CONFIRMATION")).toBe("warning");
    expect(statusTone("BLOCKED")).toBe("danger");
    expect(statusTone("IN_TRANSIT")).toBe("info");
  });

  it("builds attention metrics from the same source rows shown in the workspace", () => {
    const summary = supplierDashboardSummary({
      offers: [
        {
          id: "offer-1",
          supplierSku: "SKU-1",
          status: "ACTIVE",
          sourceType: "MANUAL",
          confirmationMode: "MANUAL",
          productVariantId: "variant-1",
          productVariant: {
            product: {
              id: "product-1",
              canonicalName: "Перчатки",
              description: null,
              manufacturerSku: null,
              gtin: null,
              productType: "SUPPLY",
              regulatoryClass: null,
            },
          },
          packaging: null,
          publication: {
            status: "PUBLISHED",
            marketplaceVisible: true,
            blockedReason: null,
          },
          prices: [
            {
              id: "price-1",
              amountMinor: "10000",
              currency: "KZT",
              status: "ACTIVE",
              freshnessExpiresAt: null,
            },
          ],
          inventoryBalances: [],
        },
      ],
      balances: [
        {
          id: "balance-1",
          warehouseId: "warehouse-1",
          productVariantId: "variant-1",
          offerId: "offer-1",
          quantityOnHand: "10",
          quantityReserved: "2",
          quantityAvailable: "8",
          safetyStock: "0",
          availabilityStatus: "AVAILABLE",
          freshnessStatus: "STALE",
          freshnessExpiresAt: null,
          source: "MANUAL",
          updatedAt: "2026-09-03T00:00:00.000Z",
          warehouse: { name: "Основной", code: "MAIN" },
          productVariant: { product: { canonicalName: "Перчатки" } },
          lots: [],
        },
      ],
      orders: [],
      integrations: [],
      credentials: [],
    });

    expect(summary.publishedOfferCount).toBe(1);
    expect(summary.activePriceCount).toBe(1);
    expect(summary.stock).toBe(8);
    expect(summary.staleBalanceCount).toBe(1);
  });
});
