import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { SupplierTermsService } from "./supplier-terms.service";
import { buildSupplierLegalBundle, supplierLegalDocuments } from "./supplier-legal-documents";
import { MarketplaceAgreementsController } from "./marketplace-agreements.controller";
import type { AcceptSupplierTermsInput } from "@marketplace/schemas";

const context = { actorId: "00000000-0000-4000-8000-000000000011", organizationId: "00000000-0000-4000-8000-000000000012" };
const operator = { actorId: "00000000-0000-4000-8000-000000000021", organizationId: "00000000-0000-4000-8000-000000000022" };
const organization = { id: context.organizationId, legalName: "Тестовая организация", displayName: "Тест", bin: "123456789012", version: 1, status: "ACTIVE" };
const bundle = buildSupplierLegalBundle(supplierLegalDocuments.map((item) => ({ ...item, status: "PUBLISHED", content: `Только тест: ${item.code}` })));
const input: AcceptSupplierTermsInput = { organizationVersion: 1, bundleHash: bundle.hash, reviewedDocuments: bundle.documents.map(({ code, hash }) => ({ code, hash })), acknowledged: true, actsForOrganization: true, representativeAuthority: "Руководитель на основании устава" };
const evidence = { ipAddress: "127.0.0.1", userAgent: "unit-test" };

function setup() {
  let stored: any = null;
  const membership = { organization, user: { id: context.actorId, displayName: "Тестовый представитель" } };
  const prisma = {
    organizationMembership: { findFirst: vi.fn().mockResolvedValue(membership) },
    supplierTermsAcceptance: {
      findUnique: vi.fn(async () => stored), findUniqueOrThrow: vi.fn(async () => stored),
      findFirst: vi.fn(async () => stored && { ...stored, organization }),
      findMany: vi.fn(async () => stored ? [{ ...stored, organization }] : []),
      create: vi.fn(async ({ data }) => stored = { ...data, id: "00000000-0000-4000-8000-000000000031", admissionStatus: "PENDING", reviewedAt: null, reviewedById: null, reviewReason: null, version: 1 }),
      updateMany: vi.fn(async ({ where, data }) => { if (!stored || stored.version !== where.version) return { count: 0 }; stored = { ...stored, ...data, version: stored.version + 1 }; return { count: 1 }; }),
    },
    marketplaceAgreement: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn() }, outboxEvent: { create: vi.fn() },
    $transaction: vi.fn(async (fn) => fn(prisma)),
  };
  const authority = { assertPlatformOperator: vi.fn().mockResolvedValue(undefined) };
  const legal = { current: vi.fn(() => bundle) };
  const service = new SupplierTermsService(prisma as never, legal as never, authority as never);
  return { service, prisma, authority, legal, get: () => stored, set: (value: any) => stored = value };
}
const approval = { expectedVersion: 1, status: "APPROVED" as const, organizationVerified: true, representativeVerified: true, reason: "Организация и полномочия проверены" };

describe("supplier common terms and independent admission", () => {
  it("keeps production drafts empty and rejects accepting them", async () => {
    const test = setup(); test.legal.current.mockReturnValue(buildSupplierLegalBundle(supplierLegalDocuments));
    expect(test.legal.current().available).toBe(false);
    await expect(test.service.accept(input, context, evidence)).rejects.toThrow("не опубликованы");
    expect(test.prisma.supplierTermsAcceptance.create).not.toHaveBeenCalled();
  });
  it("rejects old revisions, incomplete/duplicate views and stale organization data", async () => {
    for (const patch of [{ bundleHash: "0".repeat(64) }, { reviewedDocuments: [input.reviewedDocuments[0]!, input.reviewedDocuments[0]!, ...input.reviewedDocuments.slice(2)] }, { organizationVersion: 2 }]) {
      const test = setup();
      await expect(test.service.accept({ ...input, ...patch }, context, evidence)).rejects.toThrow();
      expect(test.prisma.$transaction).not.toHaveBeenCalled();
    }
  });
  it("checks active tenant membership and signing permission before data/evidence writes", async () => {
    const test = setup(); test.prisma.organizationMembership.findFirst.mockResolvedValue(null);
    await expect(test.service.accept(input, context, evidence)).rejects.toThrow(ForbiddenException);
    expect(test.prisma.supplierTermsAcceptance.findUnique).not.toHaveBeenCalled();
    expect(test.prisma.organizationMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: context.actorId, organizationId: context.organizationId, status: "ACTIVE" }) }));
  });
  it("captures exact texts and actor with atomic audit/outbox, but grants no sales on acceptance", async () => {
    const test = setup(); const receipt = await test.service.accept(input, context, evidence);
    expect(receipt).toMatchObject({ userId: context.actorId, organizationId: context.organizationId, documents: bundle.documents, admissionStatus: "PENDING" });
    expect((await test.service.commercialState(context.organizationId))).toMatchObject({ contractAccepted: true, admitted: false });
    expect(test.get().evidenceSnapshot).toMatchObject({ method: "AUTHENTICATED_ORGANIZATION_ACCEPTANCE", reviewedDocuments: input.reviewedDocuments });
    expect(test.prisma.auditLog.create).toHaveBeenCalledTimes(1); expect(test.prisma.outboxEvent.create).toHaveBeenCalledTimes(1);
  });
  it("replays acceptance without duplicate evidence, decisions or implicit approval", async () => {
    const test = setup(); const first = await test.service.accept(input, context, evidence);
    expect(await test.service.accept(input, context, evidence)).toEqual(first);
    expect(test.prisma.supplierTermsAcceptance.create).toHaveBeenCalledTimes(1);
    expect(test.prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it("only the independent operator decision grants access; suspension blocks it immediately", async () => {
    const test = setup(); const first = await test.service.accept(input, context, evidence);
    // Return the included organization for the review query.
    test.prisma.supplierTermsAcceptance.findUnique.mockImplementation(async () => ({ ...test.get(), organization }));
    await test.service.review(first.id, approval, operator);
    expect((await test.service.commercialState(context.organizationId)).admitted).toBe(true);
    expect(await test.service.activeSupplierIds()).toEqual([context.organizationId]);
    await test.service.review(first.id, { ...approval, expectedVersion: 2, status: "SUSPENDED", reason: "Дополнительная проверка" }, operator);
    expect((await test.service.commercialState(context.organizationId))).toMatchObject({ contractAccepted: true, admitted: false });
    expect(await test.service.activeSupplierIds()).toEqual([]);
    expect(test.get().documentsSnapshot).toEqual(bundle.documents);
  });
  it("rejects unauthorized, self, stale and incomplete operator decisions", async () => {
    const test = setup(); const first = await test.service.accept(input, context, evidence);
    test.prisma.supplierTermsAcceptance.findUnique.mockImplementation(async () => ({ ...test.get(), organization }));
    await expect(test.service.review(first.id, approval, context)).rejects.toThrow("собственное");
    await expect(test.service.review(first.id, { ...approval, representativeVerified: false }, operator)).rejects.toThrow("Проверьте");
    await expect(test.service.review(first.id, { ...approval, expectedVersion: 9 }, operator)).rejects.toThrow("уже изменено");
    test.authority.assertPlatformOperator.mockRejectedValue(new ForbiddenException());
    await expect(test.service.review(first.id, approval, operator)).rejects.toThrow(ForbiddenException);
  });
  it("requires reacceptance for changed documents while preserving downloadable old text", async () => {
    const test = setup(); const receipt = await test.service.accept(input, context, evidence);
    const next = buildSupplierLegalBundle(bundle.documents.map((item) => ({ ...item, version: "new", content: "Новая тестовая редакция" })));
    test.legal.current.mockReturnValue(next);
    expect((await test.service.commercialState(context.organizationId))).toMatchObject({ contractAccepted: false, admitted: false });
    const text = await test.service.download(receipt.id, context);
    expect(text).toContain(bundle.documents[0]!.content); expect(text).not.toContain("Новая тестовая редакция");
    expect(test.prisma.supplierTermsAcceptance.findFirst).toHaveBeenLastCalledWith({ where: { id: receipt.id, organizationId: context.organizationId } });
  });
  it("preserves existing executed agreements only when no new acceptance exists", async () => {
    const test = setup(); test.prisma.marketplaceAgreement.findFirst.mockResolvedValue({ id: "legacy" } as never);
    expect((await test.service.commercialState(context.organizationId)).legacyAgreementActive).toBe(true);
    await test.service.accept(input, context, evidence);
    expect((await test.service.commercialState(context.organizationId)).admitted).toBe(false);
  });
  it("retires the API that generates a new individual marketplace agreement", () => {
    expect(() => new MarketplaceAgreementsController({} as never).initiate()).toThrow("общие условия");
  });
});
