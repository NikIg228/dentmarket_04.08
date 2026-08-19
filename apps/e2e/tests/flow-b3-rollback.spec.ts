import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const operator = { organizationId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002" };
const localStorageRoot = resolve(process.cwd(), "../..", ".local-storage");
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

type Actor = { organizationId: string; userId: string; roleId: string };
type Review = { id: string; result: null | { product: { id: string }; variant: { id: string }; offer: { id: string; version: number } } };
type Rollback = {
  batchId: string;
  status: "ROLLED_BACK";
  rolledBackAt: string;
  reason: string;
  preserved: { checksum: string | null; rawRows: number; uploadAsset: boolean };
  effects: { rows: number; externalItems: number; offers: number; prices: number; inventoryBalances: number; mappingMemories: number; productCandidates: number; products: number };
};

let supplier: Actor;
let sourceId = "";
let batchId = "";
let candidateId = "";
let productId = "";
let variantId = "";
let offerId = "";
let agreementId = "";
let documentId = "";
let templateId = "";
let reservationId = "";
let uniqueName = "";

function assertLocalDatabase() {
  const hostname = new URL(databaseUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname) && process.env.FLOW_B3_ALLOW_REMOTE !== "true")
    throw new Error("Flow B3.3 mutates temporary rollback fixtures and is local-only. Set FLOW_B3_ALLOW_REMOTE=true explicitly for a non-local test database.");
}

function identity(actor: { organizationId: string; userId: string }) {
  return { "x-user-id": actor.userId, "x-organization-id": actor.organizationId };
}

async function json<T>(response: APIResponse) {
  if (!response.ok()) throw new Error(`HTTP ${response.status()}: ${await response.text()}`);
  return await response.json() as T;
}

async function createSupplier(): Promise<Actor> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const organizationId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const permissionCodes = ["import.manage", "matching.manage", "catalog.candidate.moderate"];
  const permissions = await prisma.permission.findMany({ where: { code: { in: permissionCodes } }, select: { id: true, code: true } });
  expect(permissions.map(({ code }) => code).sort()).toEqual([...permissionCodes].sort());
  await prisma.$transaction(async (tx) => {
    await tx.organization.create({ data: { id: organizationId, legalName: `ТОО Flow B3.3 ${suffix}`, displayName: `Flow B3.3 supplier ${suffix}`, bin: `86${Date.now().toString().slice(-10)}`, capabilities: { create: { capability: "SUPPLIER" } }, supplierProfile: { create: { regulatoryDetails: { testOnly: true, flow: "B3.3" } } } } });
    await tx.user.create({ data: { id: userId, email: `flow-b3-3-${suffix}@example.local`, displayName: "Flow B3.3 supplier", emailVerifiedAt: new Date() } });
    await tx.role.create({ data: { id: roleId, organizationId, code: `flow_b3_3_${suffix}`, name: "Flow B3.3 supplier", permissions: { create: permissions.map(({ id }) => ({ permission: { connect: { id } } })) } } });
    await tx.organizationMembership.create({ data: { userId, organizationId, status: "ACTIVE", acceptedAt: new Date(), isPrimary: true, roles: { create: { role: { connect: { id: roleId } } } } } });
  });
  return { organizationId, userId, roleId };
}

async function createActiveAgreement(supplierOrganizationId: string) {
  const suffix = randomUUID().slice(0, 8);
  const template = await prisma.documentTemplate.create({ data: { code: `FLOW_B3_3_AGREEMENT_${suffix}`, version: 1, kind: "MARKETPLACE_SUPPLIER_AGREEMENT", name: "Flow B3.3 agreement", format: "PDF", templateBody: "test-only", requiredSignatureCount: 2, signatureMethods: ["EDS"], metadata: { testOnly: true, flow: "B3.3" } } });
  templateId = template.id;
  const document = await prisma.document.create({ data: { ownerOrganizationId: supplierOrganizationId, templateId, kind: "MARKETPLACE_SUPPLIER_AGREEMENT", format: "PDF", source: "GENERATED", status: "SIGNED", title: "Flow B3.3 agreement", documentNumber: `FLOW-B3-3-${suffix}`, requiredSignatureCount: 2, generatedAt: new Date(), immutableAt: new Date(), metadata: { testOnly: true } } });
  documentId = document.id;
  const now = new Date();
  const agreement = await prisma.marketplaceAgreement.create({ data: { agreementNumber: `FLOW-B3-3-${suffix}`, supplierOrganizationId, operatorOrganizationId: operator.organizationId, documentId, templateId, templateVersion: 1, status: "ACTIVE", startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 365 * 86_400_000), activatedAt: now, activatedBySystem: true, metadata: { testOnly: true, flow: "B3.3" } } });
  agreementId = agreement.id;
}

async function removeStoredAssets() {
  const assets = await prisma.uploadAsset.findMany({ where: { organizationId: supplier?.organizationId, purpose: "supplier-import" }, select: { id: true, storageKey: true } });
  await prisma.uploadAsset.deleteMany({ where: { id: { in: assets.map(({ id }) => id) } } });
  for (const { storageKey } of assets) {
    const filePath = resolve(localStorageRoot, storageKey);
    if (filePath === localStorageRoot || !filePath.startsWith(`${localStorageRoot}${sep}`)) throw new Error(`Unsafe Flow B3.3 storage cleanup path: ${filePath}`);
    await unlink(filePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}

async function cleanup() {
  if (!supplier?.organizationId) return;
  const complianceIds = (await prisma.complianceCheck.findMany({ where: { sellerOrganizationId: supplier.organizationId }, select: { id: true } })).map(({ id }) => id);
  const aggregateIds = [batchId, candidateId, offerId, agreementId, ...complianceIds].filter(Boolean);
  if (reservationId) await prisma.inventoryReservation.deleteMany({ where: { id: reservationId } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: aggregateIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ organizationId: supplier.organizationId }, { entityId: { in: aggregateIds } }] } });
  await prisma.complianceCheck.deleteMany({ where: { id: { in: complianceIds } } });
  await prisma.searchQueryEvent.deleteMany({ where: { query: uniqueName } });
  if (agreementId) await prisma.marketplaceAgreement.deleteMany({ where: { id: agreementId } });
  if (documentId) await prisma.document.deleteMany({ where: { id: documentId } });
  if (batchId) await prisma.importBatch.deleteMany({ where: { id: batchId } });
  await removeStoredAssets();
  await prisma.organization.deleteMany({ where: { id: supplier.organizationId } });
  if (productId) await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.user.deleteMany({ where: { id: supplier.userId } });
  if (templateId) await prisma.documentTemplate.deleteMany({ where: { id: templateId } });
  expect(await Promise.all([
    prisma.organization.count({ where: { id: supplier.organizationId } }),
    productId ? prisma.product.count({ where: { id: productId } }) : 0,
    prisma.user.count({ where: { id: supplier.userId } }),
    batchId ? prisma.importBatch.count({ where: { id: batchId } }) : 0,
  ])).toEqual([0, 0, 0, 0]);
}

test.beforeEach(async () => {
  assertLocalDatabase();
  sourceId = batchId = candidateId = productId = variantId = offerId = agreementId = documentId = templateId = reservationId = "";
  await expect.poll(async () => prisma.organization.count({ where: { id: operator.organizationId, capabilities: { some: { capability: "MARKETPLACE_OPERATOR" } } } })).toBe(1);
  supplier = await createSupplier();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  uniqueName = `FLOWB33 ${suffix} ROLLBACK MATERIAL`;
  const source = await prisma.supplierDataSource.create({ data: { supplierOrganizationId: supplier.organizationId, name: `Flow B3.3 CSV ${suffix}`, type: "CSV", configuration: { testOnly: true, flow: "B3.3" } } });
  sourceId = source.id;
  const city = await prisma.city.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
  await prisma.warehouse.create({ data: { supplierOrganizationId: supplier.organizationId, code: `B33_${suffix.slice(0, 7)}`, name: "Flow B3.3 warehouse", cityId: city?.id, timezone: "Asia/Almaty" } });
  await createActiveAgreement(supplier.organizationId);
});

test.afterEach(cleanup);
test.afterAll(async () => prisma.$disconnect());

test("supplier safely rolls back a published import batch without losing raw evidence", async ({ request }: { request: APIRequestContext }) => {
  const csv = `externalId,name,supplierSku,priceMinor,currency,quantityOnHand\nrow-b33,${uniqueName},B33-${uniqueName.split(" ")[1]},135000,KZT,4\n`;
  const created = await json<{ id: string }>(await request.post(`${API_URL}/suppliers/${supplier.organizationId}/import-batches`, { headers: identity(supplier), data: { sourceId, fileName: "flow-b3-3.csv", fileType: "CSV", contentBase64: Buffer.from(csv).toString("base64"), columnMapping: { externalId: "externalId", name: "name", supplierSku: "supplierSku", priceMinor: "priceMinor", currency: "currency", quantityOnHand: "quantityOnHand" } } }));
  batchId = created.id;
  expect((await request.post(`${API_URL}/suppliers/${supplier.organizationId}/import-batches/${batchId}/process`, { headers: identity(supplier), data: {} })).status()).toBe(201);
  const candidate = await prisma.productCandidate.findFirstOrThrow({ where: { supplierOrganizationId: supplier.organizationId, proposedName: uniqueName } });
  candidateId = candidate.id;
  const [industry, category, unit] = await Promise.all([
    prisma.industry.findFirstOrThrow({ where: { status: "ACTIVE" }, orderBy: { id: "asc" } }),
    prisma.category.findFirstOrThrow({ where: { status: "ACTIVE" }, orderBy: { id: "asc" } }),
    prisma.unitOfMeasure.findFirstOrThrow({ orderBy: { id: "asc" } }),
  ]);
  const categoryForIndustry = category.industryId === industry.id ? category : await prisma.category.findFirstOrThrow({ where: { industryId: industry.id, status: "ACTIVE" }, orderBy: { id: "asc" } });
  const approved = await json<Review>(await request.post(`${API_URL}/moderation/import-reviews/${candidateId}/approve`, { headers: identity(operator), data: { canonicalName: uniqueName, slug: `flow-b3-3-${uniqueName.split(" ")[1].toLowerCase()}`, productType: "MATERIAL", industryIds: [industry.id], categoryIds: [categoryForIndustry.id], saleUnitId: unit.id, packageQuantity: 1, decisionReason: "Validated before rollback acceptance test" } }));
  productId = approved.result!.product.id;
  variantId = approved.result!.variant.id;
  offerId = approved.result!.offer.id;
  expect((await request.put(`${API_URL}/suppliers/${supplier.organizationId}/offers/${offerId}/publication`, { headers: identity(operator), data: { status: "PUBLISHED", marketplaceVisible: true, expectedVersion: approved.result!.offer.version, decisionReason: "Publish before rollback acceptance test" } })).status()).toBe(200);
  expect((await json<{ items: Array<{ id: string }> }>(await request.get(`${API_URL}/catalog/search?q=${encodeURIComponent(uniqueName)}`))).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: productId })]));

  const batchBefore = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { rows: true } });
  const reason = "Supplier confirmed that this uploaded price list contains incorrect commercial data";
  const rollbackUrl = `${API_URL}/suppliers/${supplier.organizationId}/import-batches/${batchId}/rollback`;
  expect((await request.post(rollbackUrl, { headers: identity(supplier), data: { reason, expectedUpdatedAt: new Date(0).toISOString() } })).status()).toBe(409);
  expect((await request.post(`${API_URL}/suppliers/${randomUUID()}/import-batches/${batchId}/rollback`, { headers: identity(supplier), data: { reason, expectedUpdatedAt: batchBefore.updatedAt.toISOString() } })).status()).toBe(403);

  const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { offerId } });
  const reservation = await prisma.inventoryReservation.create({ data: { inventoryBalanceId: balance.id, supplierOrganizationId: supplier.organizationId, warehouseId: balance.warehouseId, productVariantId: variantId, quantity: 1, expiresAt: new Date(Date.now() + 3_600_000), idempotencyKey: `flow-b3-3-${randomUUID()}` } });
  reservationId = reservation.id;
  expect((await request.post(rollbackUrl, { headers: identity(supplier), data: { reason, expectedUpdatedAt: batchBefore.updatedAt.toISOString() } })).status()).toBe(409);
  expect(await prisma.importBatch.findUnique({ where: { id: batchId }, select: { status: true, rollbackEvidence: true } })).toEqual({ status: "COMPLETED", rollbackEvidence: null });
  expect(await prisma.supplierOffer.findUnique({ where: { id: offerId }, select: { status: true } })).toEqual({ status: "ACTIVE" });
  await prisma.inventoryReservation.delete({ where: { id: reservationId } });
  reservationId = "";

  const beforeAudits = await prisma.auditLog.count({ where: { entityType: "ImportBatch", entityId: batchId, action: "import.batch.rolled_back" } });
  const beforeEvents = await prisma.outboxEvent.count({ where: { aggregateType: "ImportBatch", aggregateId: batchId, eventType: "ImportBatchRolledBack" } });
  const rolledBack = await json<Rollback>(await request.post(rollbackUrl, { headers: identity(supplier), data: { reason, expectedUpdatedAt: batchBefore.updatedAt.toISOString() } }));
  expect(rolledBack).toMatchObject({ batchId, status: "ROLLED_BACK", reason, preserved: { checksum: batchBefore.checksum, rawRows: 1, uploadAsset: true }, effects: { rows: 1, externalItems: 1, offers: 1, prices: 1, inventoryBalances: 1, productCandidates: 1, products: 1 } });

  const persistedBatch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { rows: { include: { externalItem: { include: { productCandidate: true } } } } } });
  expect(persistedBatch).toMatchObject({ status: "ROLLED_BACK", rollbackReason: reason, rolledBackById: supplier.userId });
  expect(persistedBatch.checksum).toBe(batchBefore.checksum);
  expect(persistedBatch.rows[0]).toMatchObject({ rawData: expect.objectContaining({ externalId: "row-b33", name: uniqueName }), normalizedData: expect.objectContaining({ externalId: "row-b33", name: uniqueName }), status: "ROLLED_BACK", errorCode: null, errorMessage: null });
  expect(persistedBatch.rollbackEvidence).toEqual(expect.objectContaining({ before: expect.objectContaining({ rows: [expect.objectContaining({ status: "PUBLISHED", errorCode: null })], offers: [expect.objectContaining({ id: offerId, status: "ACTIVE", publication: expect.objectContaining({ status: "PUBLISHED", marketplaceVisible: true }) })] }) }));
  expect(persistedBatch.rows[0]?.externalItem).toMatchObject({ complianceStatus: "ROLLED_BACK", matchedVariantId: null, productCandidate: { status: "ROLLED_BACK", approvedProductId: productId, approvedVariantId: variantId } });
  expect(await prisma.supplierOffer.findUnique({ where: { id: offerId }, include: { publication: true, prices: true, inventoryBalances: true } })).toMatchObject({ status: "ARCHIVED", publication: { status: "HIDDEN", marketplaceVisible: false }, prices: [expect.objectContaining({ status: "INACTIVE" })], inventoryBalances: [expect.objectContaining({ quantityAvailable: expect.anything(), freshnessStatus: "STALE", availabilityStatus: "OUT_OF_STOCK" })] });
  expect((await prisma.inventoryBalance.findFirstOrThrow({ where: { offerId } })).quantityAvailable.toString()).toBe("0");
  expect(await prisma.product.findUnique({ where: { id: productId }, select: { status: true, variants: { select: { status: true } } } })).toEqual({ status: "ARCHIVED", variants: [{ status: "ARCHIVED" }] });
  expect(await prisma.supplierMappingMemory.count({ where: { supplierOrganizationId: supplier.organizationId, externalId: "row-b33", status: "ACTIVE" } })).toBe(0);
  expect((await json<{ items: Array<{ id: string }> }>(await request.get(`${API_URL}/catalog/search?q=${encodeURIComponent(uniqueName)}`))).items.some(({ id }) => id === productId)).toBe(false);
  expect(await prisma.uploadAsset.count({ where: { organizationId: supplier.organizationId, metadata: { path: ["importBatchId"], equals: batchId } } })).toBe(1);
  expect(await prisma.auditLog.count({ where: { entityType: "ImportBatch", entityId: batchId, action: "import.batch.rolled_back" } })).toBe(beforeAudits + 1);
  expect(await prisma.outboxEvent.count({ where: { aggregateType: "ImportBatch", aggregateId: batchId, eventType: "ImportBatchRolledBack" } })).toBe(beforeEvents + 1);

  await prisma.productSearchDocument.update({ where: { productId }, data: { isAvailable: true, supplierIds: [supplier.organizationId] } });
  const repeated = await json<Rollback>(await request.post(rollbackUrl, { headers: identity(supplier), data: { reason: "A different repeated reason must not create a second effect", expectedUpdatedAt: batchBefore.updatedAt.toISOString() } }));
  expect(repeated).toEqual(rolledBack);
  expect(await prisma.productSearchDocument.findUnique({ where: { productId }, select: { isAvailable: true, supplierIds: true } })).toEqual({ isAvailable: false, supplierIds: [] });
  expect(await prisma.auditLog.count({ where: { entityType: "ImportBatch", entityId: batchId, action: "import.batch.rolled_back" } })).toBe(beforeAudits + 1);
  expect(await prisma.outboxEvent.count({ where: { aggregateType: "ImportBatch", aggregateId: batchId, eventType: "ImportBatchRolledBack" } })).toBe(beforeEvents + 1);
});
