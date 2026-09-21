import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { CommerceService } from "../commerce/commerce.service";
import { DocumentsService } from "./documents.service";
import { collectConsistentDocuments, hasConsistentDocumentReferences, type DocumentGraph } from "./document-reference-graph";

const context = { actorId: "user-a", organizationId: "buyer-a" };
const ownOrder = { id: "order-a", supplierOrganizationId: "supplier-a", buyerOrganizationId: "buyer-a", checkoutId: "checkout-a", paymentStatus: "PAID" };
const foreignOrder = { id: "order-b", supplierOrganizationId: "supplier-b", buyerOrganizationId: "buyer-b", checkoutId: "checkout-b", paymentStatus: "PAID" };
const intent = { id: "intent-a", buyerOrganizationId: "buyer-a", checkoutId: "checkout-a", status: "CAPTURED", allocations: [{ recipientOrganizationId: "supplier-a", supplierOrderId: "order-a" }] };

function fixture() {
  const prisma = {
    organization: { findUnique: vi.fn().mockResolvedValue({ id: "buyer-a" }) },
    organizationCapability: { findUnique: vi.fn().mockResolvedValue(null) },
    checkout: { findUnique: vi.fn().mockResolvedValue({ id: "checkout-a", buyerOrganizationId: "buyer-a" }) },
    supplierOrder: { findUnique: vi.fn().mockResolvedValue(ownOrder) },
    shipment: { findUnique: vi.fn().mockResolvedValue({ id: "shipment-b", supplierOrderId: "order-b", supplierOrder: foreignOrder }) },
    paymentIntent: { findUnique: vi.fn().mockResolvedValue(intent) },
    paymentTransaction: { findUnique: vi.fn().mockResolvedValue(null) },
    refund: { findUnique: vi.fn().mockResolvedValue({ id: "refund-b", status: "COMPLETED", paymentIntentId: "intent-b", supplierOrderId: "order-b", paymentAllocation: { recipientOrganizationId: "supplier-b" }, paymentIntent: { buyerOrganizationId: "buyer-b", checkoutId: "checkout-b" } }) },
    document: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
  };
  const uploads = { decodeBase64: vi.fn(), quarantine: vi.fn() };
  const storage = { signedDownloadUrl: vi.fn(), get: vi.fn() };
  const signatures = { resolve: vi.fn() };
  const service = new DocumentsService(prisma as never, storage as never, {} as never, signatures as never, uploads as never);
  const references = (extra: Record<string, unknown>) => (service as unknown as {
    assertReferences(input: Record<string, unknown>): Promise<unknown>;
  }).assertReferences({ ownerOrganizationId: "buyer-a", kind: "OTHER", ...extra });
  return { prisma, uploads, storage, signatures, service, references };
}

describe("Consolidated document reference boundary", () => {
  it("rejects own intent with foreign shipment at the shared reference boundary", async () => {
    await expect(fixture().references({ paymentIntentId: "intent-a", shipmentId: "shipment-b" })).rejects.toThrow(/references|checkout|supplier order|party/i);
  });
  it("rejects own payment plus foreign shipment before upload side effects", async () => {
    const f = fixture();
    await expect(f.service.upload({ ownerOrganizationId: "buyer-a", kind: "OTHER", paymentIntentId: "intent-a", shipmentId: "shipment-b" } as never, context)).rejects.toThrow(/references|checkout|supplier order|party/i);
    expect(f.uploads.decodeBase64).not.toHaveBeenCalled();
    expect(f.uploads.quarantine).not.toHaveBeenCalled();
    expect(f.prisma.document.create).not.toHaveBeenCalled();
  });
  it("rejects an own checkout combined with a foreign refund", async () => {
    await expect(fixture().references({ checkoutId: "checkout-a", refundId: "refund-b" })).rejects.toThrow(/references|checkout|supplier order|party/i);
  });
  it("compares transaction allocation against shipment-derived order", async () => {
    const f = fixture();
    f.prisma.shipment.findUnique.mockResolvedValue({ id: "shipment-a", supplierOrderId: "order-a", supplierOrder: ownOrder });
    f.prisma.paymentTransaction.findUnique.mockResolvedValue({ id: "transaction", status: "SUCCEEDED", type: "CAPTURE", paymentIntentId: "intent-a", paymentIntent: intent, paymentAllocation: { recipientOrganizationId: "supplier-b", supplierOrderId: "order-b" } } as never);
    await expect(f.references({ shipmentId: "shipment-a", paymentTransactionId: "transaction" })).rejects.toThrow(/references|supplier order/i);
  });
  it("preserves coherent supplier-owned order, checkout and payment references", async () => {
    await expect(fixture().references({ ownerOrganizationId: "supplier-a", supplierOrderId: "order-a", checkoutId: "checkout-a", paymentIntentId: "intent-a" })).resolves.toEqual(expect.arrayContaining([{ organizationId: "supplier-a", role: "ISSUER" }]));
  });
  it.each(["get", "download", "archive"] as const)("blocks legacy foreign shipment via %s without side effects", async (method) => {
    const f = fixture();
    f.prisma.document.findUnique.mockResolvedValue({
      id: "bad-document", ownerOrganizationId: "buyer-a", supplierOrderId: "order-a", shipmentId: "shipment-b", checkoutId: "checkout-a",
      supplierOrder: ownOrder, shipment: { id: "shipment-b", supplierOrderId: "order-b", supplierOrder: foreignOrder },
      checkout: { id: "checkout-a", buyerOrganizationId: "buyer-a" }, participants: [], previousVersion: null, nextVersions: [],
      storageKey: "safe-fixture", contentType: "application/pdf", fileName: "fixture.pdf", status: "GENERATED",
    });
    await expect(f.service[method]("bad-document", context)).rejects.toThrow(/references|inconsistent/i);
    expect(f.storage.signedDownloadUrl).not.toHaveBeenCalled();
    expect(f.storage.get).not.toHaveBeenCalled();
    expect(f.prisma.document.update).not.toHaveBeenCalled();
  });
});

describe("Document graph projections", () => {
  const standalone = (id: string) => ({ id, ownerOrganizationId: "buyer-a", kind: "OTHER", category: "OTHER", status: "GENERATED", accountingStatus: "NOT_APPLICABLE", documentDate: new Date(), createdAt: new Date(), updatedAt: new Date(), participants: [], signatures: [], nextVersions: [] });
  const invalid = (id: string) => ({ ...standalone(id), supplierOrderId: "order-b", supplierOrder: foreignOrder });
  it.each(["checkoutId", "supplierOrderId", "shipmentId", "paymentIntentId", "paymentTransactionId", "refundId", "baseAgreementDocumentId"])("rejects a mismatched %s in a previous/next version", (key) => {
    const current = standalone("current");
    const version = { ownerOrganizationId: "buyer-a", [key]: "other" };
    expect(hasConsistentDocumentReferences({ ...current, previousVersion: version })).toBe(false);
    expect(hasConsistentDocumentReferences({ ...current, nextVersions: [version] })).toBe(false);
  });
  it("does not require a published or signed base contract", () => {
    const base = { ownerOrganizationId: "supplier-a", category: "CONTRACT", participants: [{ organizationId: "buyer-a" }] };
    expect(hasConsistentDocumentReferences({ ...standalone("addendum"), kind: "CONTRACT_ADDENDUM", baseAgreementDocumentId: "base", baseAgreementDocument: base })).toBe(true);
  });
  it("fills a visible page across invalid rows without duplicates", async () => {
    const source = [invalid("0"), standalone("1"), invalid("2"), standalone("3"), standalone("4")];
    const fetch = vi.fn(async (take: number, cursor?: string) => source.slice(cursor ? source.findIndex((row) => row.id === cursor) + 1 : 0).slice(0, take));
    expect((await collectConsistentDocuments(fetch, 3)).map((row) => row.id)).toEqual(["1", "3", "4"]);
  });
  it("keeps list validation-only relations out of the response", async () => {
    const f = fixture();
    f.prisma.document.findMany.mockResolvedValue([standalone("visible")] as never);
    const [result] = await f.service.list({ limit: 10 } as never, context);
    expect(result).not.toHaveProperty("checkout");
    expect(result).not.toHaveProperty("nextVersions");
    expect(result.id).toBe("visible");
  });
  it("uses last returned visible row as archive continuation, without skipping the lookahead", async () => {
    const f = fixture();
    const source = [invalid("0"), standalone("1"), invalid("2"), standalone("3"), standalone("4")];
    f.prisma.document.findMany.mockImplementation(async (args: { take: number; cursor?: { id: string } }) => source.slice(args.cursor ? source.findIndex((row) => row.id === args.cursor?.id) + 1 : 0).slice(0, args.take));
    const page = await f.service.listArchive({ limit: 2 }, context);
    expect(page.items.map((row) => row.id)).toEqual(["1", "3"]);
    expect(page.nextCursor).toBe("3");
    const next = await f.service.listArchive({ limit: 2, cursor: page.nextCursor! }, context);
    expect(next.items.map((row) => row.id)).toEqual(["4"]);
  });
  it("excludes invalid rows from archive summary", async () => {
    const f = fixture();
    f.prisma.document.findMany.mockResolvedValue([invalid("0"), standalone("1")] as never);
    expect(await f.service.archiveSummary(context)).toMatchObject({ total: 1, byCategory: { OTHER: 1 } });
  });
  it("rejects an invalid archive detail before its accounting write", async () => {
    const f = fixture();
    Object.assign(f.prisma.document, { findFirst: vi.fn().mockResolvedValue(invalid("bad")), updateMany: vi.fn() });
    await expect(f.service.getArchive("bad", context)).rejects.toThrow("Document references are inconsistent");
  });
  it("rejects a missing loaded foreign key rather than treating it as standalone", () => {
    expect(hasConsistentDocumentReferences({ ...standalone("bad"), shipmentId: "missing" } as DocumentGraph)).toBe(false);
  });
});

describe("Independent consolidation review regressions", () => {
  it("reuses prepayment invoice and specification without a shipment link", async () => {
    const f = fixture();
    const order = { ...ownOrder, orderNumber: "ORDER-A", currency: "KZT", subtotalAmountMinor: 1000n,
      supplier: { legalName: "Supplier", bin: "fixture" }, buyer: { legalName: "Buyer", bin: "fixture" }, items: [],
      shipments: [{ id: "shipment-a", shipmentNumber: "SHIP-A", status: "DISPATCHED", destinationAddress: { city: "Test" }, items: [], warehouse: { name: "Fixture" } }] };
    f.prisma.supplierOrder.findUnique.mockResolvedValue(order);
    Object.assign(f.prisma, { documentTemplate: { findMany: vi.fn().mockResolvedValue(["ORDER_SPECIFICATION_RU", "INVOICE_RU", "WAYBILL_RU"].map((code) => ({ id: code, code }))) } });
    Object.assign(f.prisma.document, { findFirst: vi.fn().mockResolvedValue(null), findFirstOrThrow: vi.fn().mockImplementation(async ({ where }) => ({ ...ownOrder, id: where.documentNumber, supplierOrderId: ownOrder.id, shipmentId: null, kind: where.documentNumber.startsWith("SPEC") ? "ORDER_SPECIFICATION" : "INVOICE" })) });
    vi.spyOn(f.service, "get").mockResolvedValue({ id: "coherent" } as never);
    vi.spyOn(f.service, "generate").mockImplementation(async (input) => {
      if (input.templateId !== "WAYBILL_RU") throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
      return { id: "waybill" } as never;
    });
    const result = await f.service.generateOrderDocumentPack("order-a", { shipmentId: "shipment-a" }, { ...context, organizationId: "supplier-a" });
    expect(result.documents).toHaveLength(3);
    expect(result.documents[0].shipmentId).toBeNull();
  });

  it.each([false, true])("does not certify an unpaid sibling allocation (transaction=%s)", async (withTransaction) => {
    const f = fixture();
    f.prisma.supplierOrder.findUnique.mockResolvedValue({ ...ownOrder, paymentStatus: "UNPAID" });
    const partial = { ...intent, status: "PARTIALLY_CAPTURED", allocations: [
      { id: "allocation-a", recipientOrganizationId: "supplier-a", supplierOrderId: "order-a", status: "PENDING" },
      { id: "allocation-b", recipientOrganizationId: "supplier-b", supplierOrderId: "order-b", status: "CAPTURED" },
    ] };
    f.prisma.paymentIntent.findUnique.mockResolvedValue(partial);
    if (withTransaction) f.prisma.paymentTransaction.findUnique.mockResolvedValue({ status: "SUCCEEDED", type: "CAPTURE", paymentIntentId: "intent-a", paymentIntent: partial, paymentAllocation: null, requestPayload: { allocationIds: ["allocation-b"] } } as never);
    await expect(f.references({ kind: "PAYMENT_CONFIRMATION", supplierOrderId: "order-a", paymentIntentId: "intent-a", ...(withTransaction ? { paymentTransactionId: "capture-b" } : {}) })).rejects.toThrow(/confirmed payment|capture/i);
  });

  it("does not return an individually inaccessible linked version", async () => {
    const f = fixture();
    const previous = { id: "private", ownerOrganizationId: "supplier-a", dataSnapshot: { confidential: "not-for-buyer" } };
    f.prisma.document.findUnique.mockResolvedValue({ id: "current", ownerOrganizationId: "supplier-a", participants: [{ organizationId: "buyer-a" }], previousVersionId: "private", previousVersion: previous, nextVersions: [] });
    f.prisma.document.findMany.mockResolvedValue([]);
    const result = await f.service.get("current", context);
    expect(result.previousVersion).toBeNull();
    expect(f.prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [expect.objectContaining({ OR: expect.arrayContaining([{ participants: { some: { organizationId: "buyer-a" } } }]) }), { id: { in: ["private"] } }] } }));
    expect(JSON.stringify(result)).not.toContain("not-for-buyer");
  });

  it.each(["getCheckout", "supplierOrders", "buyerOrders"] as const)("filters inconsistent embedded documents in %s", async (method) => {
    const good = { id: "good", ownerOrganizationId: "supplier-a", supplierOrderId: "order-a", supplierOrder: ownOrder };
    const bad = { id: "bad", ownerOrganizationId: "supplier-b", supplierOrderId: "order-a", supplierOrder: ownOrder, dataSnapshot: { confidential: "foreign" } };
    const order = { ...ownOrder, documents: [bad, good] };
    const prisma = { organization: { findUnique: vi.fn().mockResolvedValue({ capabilities: [{ capability: "BUYER" }] }) }, organizationCapability: { findUnique: vi.fn().mockResolvedValue(null) }, checkout: { findUnique: vi.fn().mockResolvedValue({ buyerOrganizationId: "buyer-a", supplierOrders: [order] }) }, supplierOrder: { findMany: vi.fn().mockResolvedValue([order]) } };
    const service = new CommerceService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const result = method === "getCheckout" ? (await service.getCheckout("checkout-a", context)).supplierOrders : method === "buyerOrders" ? await service.buyerOrders("buyer-a", context) : await service.supplierOrders(context);
    expect(result[0].documents.map((document) => document.id)).toEqual(["good"]);
    expect(result[0].documents[0]).not.toHaveProperty("supplierOrder");
  });

  it("bounds invalid-legacy scanning instead of issuing thousands of serial queries", async () => {
    const source = Array.from({ length: 2000 }, (_, index) => ({ id: String(index), ownerOrganizationId: "buyer-a", supplierOrderId: "order-b", supplierOrder: foreignOrder }));
    const fetch = vi.fn(async (take: number, cursor?: string) => source.slice(cursor ? Number(cursor) + 1 : 0).slice(0, take));
    await expect(collectConsistentDocuments(fetch, 1)).rejects.toThrow(/integrity|scan|limit/i);
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(11);
  });
});
