import { describe, expect, it, vi } from "vitest";
import { MarketplaceAgreementsService, annualRenewalProjection } from "./marketplace-agreements.service";
import { SupplierTermsService } from "./supplier-terms.service";
import { SupplierLegalDocuments } from "./supplier-legal-documents";

describe("marketplace agreement annual renewal", () => {
  it("renews an expired annual agreement for exactly one next period", () => {
    const projection = annualRenewalProjection(new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-02T00:00:00.000Z"));
    expect(projection).toEqual({ startsAt: new Date("2026-07-01T00:00:00.000Z"), endsAt: new Date("2027-07-01T00:00:00.000Z"), periods: 1 });
  });

  it("catches up every missed annual period after downtime", () => {
    const projection = annualRenewalProjection(new Date("2023-07-01T00:00:00.000Z"), new Date("2026-07-17T00:00:00.000Z"));
    expect(projection).toEqual({ startsAt: new Date("2026-07-01T00:00:00.000Z"), endsAt: new Date("2027-07-01T00:00:00.000Z"), periods: 4 });
  });

  function serviceWithAgreement(agreement: unknown) {
    const prisma = { marketplaceAgreement: { findFirst: vi.fn().mockResolvedValue(agreement) }, supplierTermsAcceptance: { findFirst: vi.fn().mockResolvedValue(null) } };
    const terms = new SupplierTermsService(prisma as never, new SupplierLegalDocuments(), {} as never);
    const service = new MarketplaceAgreementsService(prisma as never, {} as never, terms);
    vi.spyOn(service as never, "processRenewals" as never).mockResolvedValue(undefined);
    return { service, findFirst: prisma.marketplaceAgreement.findFirst };
  }

  it("rejects commercial operations when no agreement exists", async () => {
    const { service } = serviceWithAgreement(null);
    await expect(service.assertActive("supplier-1")).rejects.toThrow("принятый договор и допуск");
  });

  it("allows commercial operations with an active signed agreement", async () => {
    const agreement = { id: "agreement-1", status: "ACTIVE", startsAt: new Date("2026-01-01"), endsAt: new Date("2027-01-01") };
    const { service } = serviceWithAgreement(agreement);
    await expect(service.assertActive("supplier-1")).resolves.toMatchObject({ admitted: true, legacyAgreementActive: true });
  });

  it("rejects commercial operations after the agreement end date", async () => {
    const { service, findFirst } = serviceWithAgreement(null);
    await expect(service.assertActive("supplier-1")).rejects.toThrow("принятый договор и допуск");
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ endsAt: expect.objectContaining({ gt: expect.any(Date) }) }) }));
  });
});
