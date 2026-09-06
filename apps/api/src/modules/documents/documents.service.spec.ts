import { describe, expect, it, vi } from "vitest";
import { DocumentsService } from "./documents.service";

describe("DocumentsService signature status", () => {
  it("does not let a stale partial refresh regress a signed document", async () => {
    const prisma = {
      document: {
        findUniqueOrThrow: vi.fn()
          .mockResolvedValueOnce({ id: "document", immutableAt: null, requiredSignatureCount: 2, signatures: [{ status: "SIGNED" }] })
          .mockResolvedValueOnce({ id: "document", status: "SIGNED" }),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    const service = new DocumentsService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    const result = await (service as any).refreshDocumentSignatureStatus("document");

    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "document", status: { not: "SIGNED" } } }));
    expect(result.status).toBe("SIGNED");
  });

  it("rejects a local EDS signer from another organization", async () => {
    const service = new DocumentsService({} as never, {} as never, {} as never, {} as never, {} as never);
    vi.spyOn(service, "get").mockResolvedValue({
      id: "document",
      checksumSha256: "a".repeat(64),
      storageKey: "documents/document.pdf",
      status: "GENERATED",
    } as never);
    vi.spyOn(service as any, "isOperator").mockResolvedValue(false);

    await expect(service.createLocalEdsSignatureSession("document", {
      method: "EDS",
      signerOrganizationId: "organization-b",
      signerUserId: "user-a",
      signerName: "Signer",
      expiresInMinutes: 60,
    }, { actorId: "user-a", organizationId: "organization-a" })).rejects.toThrow("Signer organization must be the active organization");
  });

  it("rejects a local EDS session created for another user", async () => {
    const service = new DocumentsService({} as never, {} as never, {} as never, {} as never, {} as never);
    vi.spyOn(service, "get").mockResolvedValue({
      id: "document",
      checksumSha256: "a".repeat(64),
      storageKey: "documents/document.pdf",
      status: "GENERATED",
    } as never);
    vi.spyOn(service as any, "isOperator").mockResolvedValue(false);

    await expect(service.createLocalEdsSignatureSession("document", {
      method: "EDS",
      signerOrganizationId: "organization-a",
      signerUserId: "user-b",
      signerName: "Signer",
      expiresInMinutes: 60,
    }, { actorId: "user-a", organizationId: "organization-a" })).rejects.toThrow("Signer user must be the authenticated user");
  });
});

describe("DocumentsService archive", () => {
  it("allows an agreement participant to read a supplier-owned document", async () => {
    const prisma = {
      document: { findUnique: vi.fn().mockResolvedValue({
        id: "document",
        ownerOrganizationId: "supplier",
        participants: [{ organizationId: "buyer", role: "RECIPIENT" }],
        supplierOrder: null,
        buyerSupplierAgreement: null,
        marketplaceAgreement: null,
      }) },
    };
    const service = new DocumentsService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    const result = await service.get("document", { actorId: "buyer-user", organizationId: "buyer" });

    expect(result.id).toBe("document");
  });

  it("applies the tenant graph to archive queries", async () => {
    const prisma = {
      organizationCapability: { findUnique: vi.fn().mockResolvedValue(null) },
      document: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new DocumentsService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    await service.listArchive({ limit: 25 }, { actorId: "buyer-user", organizationId: "buyer" });

    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [expect.objectContaining({ OR: expect.arrayContaining([
        { ownerOrganizationId: "buyer" },
        { participants: { some: { organizationId: "buyer" } } },
      ]) }), expect.any(Object)] },
      take: 26,
    }));
  });

  it("does not create payment evidence before payment is confirmed", async () => {
    const prisma = {
      supplierOrder: { findUnique: vi.fn().mockResolvedValue({
        supplierOrganizationId: "supplier",
        buyerOrganizationId: "buyer",
        checkoutId: "checkout",
        paymentStatus: "UNPAID",
      }) },
    };
    const service = new DocumentsService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    await expect((service as any).assertReferences({
      ownerOrganizationId: "supplier",
      kind: "PAYMENT_CONFIRMATION",
      supplierOrderId: "order",
    })).rejects.toThrow("Payment confirmation requires a confirmed payment event");
  });

  it("does not expose a checkout-level document to every supplier in a multi-supplier checkout", async () => {
    const prisma = {
      checkout: { findUnique: vi.fn().mockResolvedValue({ buyerOrganizationId: "buyer" }) },
    };
    const service = new DocumentsService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    const parties = await (service as any).assertReferences({
      ownerOrganizationId: "buyer",
      kind: "OTHER",
      checkoutId: "checkout",
    });

    expect(parties).toEqual([{ organizationId: "buyer", role: "RECIPIENT" }]);
  });

  it("uses optimistic locking for an accounting decision", async () => {
    const prisma = {
      document: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new DocumentsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    vi.spyOn(service, "getArchive").mockResolvedValue({
      id: "document",
      category: "PAYMENT",
      accountingStatus: "PENDING_REVIEW",
      updatedAt: "2026-09-06T12:00:00.000Z",
    } as never);

    await expect(service.updateAccountingStatus("document", {
      status: "REVIEWED",
      reason: "Проверено бухгалтером",
      expectedUpdatedAt: "2026-09-06T12:00:00.000Z",
    }, { actorId: "buyer-user", organizationId: "buyer" })).rejects.toThrow("Document was changed by another user");
  });
});
