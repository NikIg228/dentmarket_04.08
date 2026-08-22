import { describe, expect, it, vi } from "vitest";
import { TrustCommerceService } from "./trust-commerce.service";

describe("TrustCommerceService rating scope", () => {
  it("does not expose supplier appeal evidence to an unrelated organization", async () => {
    const prisma = {
      organizationCapability: { findUnique: vi.fn(async () => null) },
      supplierTrustSnapshot: { findUnique: vi.fn(async () => ({ id: "snapshot", supplierOrganizationId: "supplier", status: "CALCULATED", appeals: undefined })) },
      supplierTrustAppeal: { findMany: vi.fn(async () => [{ id: "appeal", evidence: { secret: true } }]) },
    };
    const service = new TrustCommerceService(prisma as never);

    const rating = await service.rating("supplier", { actorId: "buyer-user", organizationId: "buyer" });

    expect(rating.appeals).toEqual([]);
    expect(prisma.supplierTrustAppeal.findMany).not.toHaveBeenCalled();
  });

  it("keeps appeal evidence available to the rated supplier", async () => {
    const appeals = [{ id: "appeal", reason: "correction" }];
    const prisma = {
      organizationCapability: { findUnique: vi.fn(async () => null) },
      supplierTrustSnapshot: { findUnique: vi.fn(async () => ({ id: "snapshot", supplierOrganizationId: "supplier", status: "CALCULATED" })) },
      supplierTrustAppeal: { findMany: vi.fn(async () => appeals) },
    };
    const service = new TrustCommerceService(prisma as never);

    const rating = await service.rating("supplier", { actorId: "supplier-user", organizationId: "supplier" });

    expect(rating.appeals).toEqual(appeals);
  });
});
