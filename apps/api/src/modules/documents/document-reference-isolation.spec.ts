import { describe, expect, it, vi } from "vitest";
import { DocumentsService } from "./documents.service";

const ownOrder = { supplierOrganizationId: "supplier", buyerOrganizationId: "buyer", checkoutId: "checkout", paymentStatus: "UNPAID" };
const foreignOrder = { ...ownOrder, supplierOrganizationId: "foreign-supplier", buyerOrganizationId: "foreign-buyer" };
const agreement = (ownerOrganizationId: string, extra = {}) => ({
  id: "base", ownerOrganizationId, category: "CONTRACT", participants: [],
  buyerSupplierAgreement: null, marketplaceAgreement: null, ...extra,
});

function fixture(order = ownOrder, base = agreement("buyer")) {
  const prisma = {
    supplierOrder: { findUnique: vi.fn().mockResolvedValue(order) },
    shipment: { findUnique: vi.fn().mockResolvedValue({ supplierOrderId: "order", supplierOrder: order }) },
    document: { findUnique: vi.fn().mockResolvedValue(base), create: vi.fn() },
    documentTemplate: { findFirst: vi.fn().mockResolvedValue({ id: "template", kind: "CONTRACT_ADDENDUM" }) },
    organization: { findUnique: vi.fn().mockResolvedValue({ id: "buyer" }) },
    $transaction: vi.fn(),
  };
  const uploads = { decodeBase64: vi.fn(), quarantine: vi.fn() };
  const service = new DocumentsService(prisma as never, {} as never, {} as never, {} as never, uploads as never);
  const references = (input = {}) => (service as unknown as {
    assertReferences(input: Record<string, unknown>): Promise<unknown>;
  }).assertReferences({ ownerOrganizationId: "buyer", kind: "CONTRACT_ADDENDUM", baseAgreementDocumentId: "base", ...input });
  return { service, references, prisma, uploads };
}

describe("Document reference isolation (AUD-FIX-07.2)", () => {
  it.each(["supplierOrderId", "shipmentId"])("rejects own %s plus foreign base", async (key) => {
    await expect(fixture(ownOrder, agreement("foreign")).references({ [key]: "order" })).rejects.toThrow("Document owner is not a party");
  });
  it.each(["supplierOrderId", "shipmentId"])("rejects foreign %s plus own base", async (key) => {
    await expect(fixture(foreignOrder).references({ [key]: "order" })).rejects.toThrow("Document owner is not a party");
  });
  it.each(["DRAFT", "EXPIRED", "SIGNED"])("allows an accessible %s contract and own order without a new publication gate", async (status) => {
    await expect(fixture(ownOrder, agreement("supplier", { status, participants: [{ organizationId: "buyer", role: "RECIPIENT" }] })).references({ supplierOrderId: "order" })).resolves.toEqual(expect.arrayContaining([{ organizationId: "buyer", role: "RECIPIENT" }]));
  });
  it("allows base without an optional order", async () => {
    await expect(fixture().references()).resolves.toEqual([{ organizationId: "buyer", role: "OWNER" }]);
  });
  it("allows an unrelated-free document draft", async () => {
    await expect(fixture().references({ kind: "OTHER", baseAgreementDocumentId: undefined })).resolves.toEqual([]);
  });
  it.each([
    { buyerSupplierAgreement: { buyerOrganizationId: "buyer", supplierOrganizationId: "supplier" } },
    { marketplaceAgreement: { operatorOrganizationId: "buyer", supplierOrganizationId: "supplier" } },
  ])("preserves agreement graph parties without explicit participant rows", async (graph) => {
    await expect(fixture(ownOrder, agreement("supplier", graph)).references()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ organizationId: "buyer" })]));
  });
  it.each(["generate", "upload"] as const)("rejects %s before persistence, decoding or quarantine", async (method) => {
    const f = fixture(ownOrder, agreement("foreign"));
    await expect(f.service[method]({ ownerOrganizationId: "buyer", kind: "CONTRACT_ADDENDUM", templateId: "template", supplierOrderId: "order", baseAgreementDocumentId: "base" } as never, { actorId: "user", organizationId: "buyer" })).rejects.toThrow("Document owner is not a party");
    expect(f.prisma.document.create).not.toHaveBeenCalled();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.uploads.quarantine).not.toHaveBeenCalled();
  });
  it("does not copy a legacy foreign base into a new version", async () => {
    const f = fixture(ownOrder, agreement("foreign"));
    Object.assign(f.prisma.documentTemplate, { findUnique: vi.fn().mockResolvedValue({ id: "template", status: "ACTIVE", kind: "CONTRACT_ADDENDUM" }) });
    vi.spyOn(f.service, "get").mockResolvedValue({ ownerOrganizationId: "buyer", source: "GENERATED", templateId: "template", supplierOrderId: "order", baseAgreementDocumentId: "base" } as never);
    await expect(f.service.createVersion("legacy", { data: {}, reason: "revision" }, { actorId: "user", organizationId: "buyer" })).rejects.toThrow("Document owner is not a party");
    expect(f.prisma.document.create).not.toHaveBeenCalled();
  });
});
