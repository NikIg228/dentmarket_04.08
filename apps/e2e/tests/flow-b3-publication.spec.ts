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
type ReviewQueue = { items: Array<{ id: string; status: string; proposed: { name: string }; result: null | { product: { id: string }; offer: { id: string; version: number; readinessBlockers: string[] } } }> };
type Review = ReviewQueue["items"][number];
type Publication = { offerId: string; offerVersion: number; status: string; marketplaceVisible: boolean; publishedAt: string | null };

let supplier: Actor;
let sourceId = "";
let batchId = "";
let candidateId = "";
let productId = "";
let offerId = "";
let agreementId = "";
let documentId = "";
let templateId = "";
let uniqueName = "";

function assertLocalDatabase() {
  const hostname = new URL(databaseUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname) && process.env.FLOW_B3_ALLOW_REMOTE !== "true") throw new Error("Flow B3.2 creates temporary publication data and is local-only. Set FLOW_B3_ALLOW_REMOTE=true explicitly for a non-local test database.");
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
    await tx.organization.create({ data: { id: organizationId, legalName: `ТОО Flow B3.2 ${suffix}`, displayName: `Flow B3.2 supplier ${suffix}`, bin: `87${Date.now().toString().slice(-10)}`, capabilities: { create: { capability: "SUPPLIER" } }, supplierProfile: { create: { regulatoryDetails: { testOnly: true, flow: "B3.2" } } } } });
    await tx.user.create({ data: { id: userId, email: `flow-b3-2-${suffix}@example.local`, displayName: "Flow B3.2 supplier", emailVerifiedAt: new Date() } });
    await tx.role.create({ data: { id: roleId, organizationId, code: `flow_b3_2_${suffix}`, name: "Flow B3.2 supplier", permissions: { create: permissions.map(({ id }) => ({ permission: { connect: { id } } })) } } });
    await tx.organizationMembership.create({
      data: {
        userId,
        organizationId,
        status: "ACTIVE",
        acceptedAt: new Date(),
        isPrimary: true,
        roles: { create: { role: { connect: { id: roleId } } } },
      },
    });
  });
  return { organizationId, userId, roleId };
}

async function createActiveAgreement(supplierOrganizationId: string) {
  const suffix = randomUUID().slice(0, 8);
  const template = await prisma.documentTemplate.create({ data: { code: `FLOW_B3_2_AGREEMENT_${suffix}`, version: 1, kind: "MARKETPLACE_SUPPLIER_AGREEMENT", name: "Flow B3.2 agreement", format: "PDF", templateBody: "test-only", requiredSignatureCount: 2, signatureMethods: ["EDS"], metadata: { testOnly: true, flow: "B3.2" } } });
  templateId = template.id;
  const document = await prisma.document.create({ data: { ownerOrganizationId: supplierOrganizationId, templateId, kind: "MARKETPLACE_SUPPLIER_AGREEMENT", format: "PDF", source: "GENERATED", status: "SIGNED", title: "Flow B3.2 agreement", documentNumber: `FLOW-B3-2-${suffix}`, requiredSignatureCount: 2, generatedAt: new Date(), immutableAt: new Date(), metadata: { testOnly: true } } });
  documentId = document.id;
  const now = new Date();
  const agreement = await prisma.marketplaceAgreement.create({ data: { agreementNumber: `FLOW-B3-2-${suffix}`, supplierOrganizationId, operatorOrganizationId: operator.organizationId, documentId, templateId, templateVersion: 1, status: "ACTIVE", startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 365 * 86_400_000), activatedAt: now, activatedBySystem: true, metadata: { testOnly: true, flow: "B3.2" } } });
  agreementId = agreement.id;
}

async function removeStoredAssets() {
  const assets = await prisma.uploadAsset.findMany({ where: { organizationId: supplier?.organizationId, purpose: "supplier-import" }, select: { id: true, storageKey: true } });
  await prisma.uploadAsset.deleteMany({ where: { id: { in: assets.map(({ id }) => id) } } });
  for (const { storageKey } of assets) {
    const filePath = resolve(localStorageRoot, storageKey);
    if (filePath === localStorageRoot || !filePath.startsWith(`${localStorageRoot}${sep}`)) throw new Error(`Unsafe Flow B3.2 storage cleanup path: ${filePath}`);
    await unlink(filePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}

async function cleanup() {
  if (!supplier?.organizationId) return;
  const complianceIds = (await prisma.complianceCheck.findMany({ where: { sellerOrganizationId: supplier.organizationId }, select: { id: true } })).map(({ id }) => id);
  const aggregateIds = [batchId, candidateId, offerId, agreementId, ...complianceIds].filter(Boolean);
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
  const residue = await Promise.all([
    prisma.organization.count({ where: { id: supplier.organizationId } }),
    productId ? prisma.product.count({ where: { id: productId } }) : 0,
    prisma.user.count({ where: { id: supplier.userId } }),
    agreementId ? prisma.marketplaceAgreement.count({ where: { id: agreementId } }) : 0,
  ]);
  expect(residue).toEqual([0, 0, 0, 0]);
}

test.beforeEach(async () => {
  assertLocalDatabase();
  batchId = candidateId = productId = offerId = agreementId = documentId = templateId = "";
  await expect.poll(async () => prisma.organization.count({ where: { id: operator.organizationId, capabilities: { some: { capability: "MARKETPLACE_OPERATOR" } } } })).toBe(1);
  supplier = await createSupplier();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  uniqueName = `FLOWB32 ${suffix} DENTAL MATERIAL`;
  const source = await prisma.supplierDataSource.create({ data: { supplierOrganizationId: supplier.organizationId, name: `Flow B3.2 CSV ${suffix}`, type: "CSV", configuration: { testOnly: true, flow: "B3.2" } } });
  sourceId = source.id;
  const city = await prisma.city.findFirst({ select: { id: true }, orderBy: { id: "asc" } });
  await prisma.warehouse.create({ data: { supplierOrganizationId: supplier.organizationId, code: `B32_${suffix.slice(0, 7)}`, name: "Flow B3.2 warehouse", cityId: city?.id, timezone: "Asia/Almaty" } });
  await createActiveAgreement(supplier.organizationId);
});

test.afterEach(cleanup);
test.afterAll(async () => prisma.$disconnect());

test("operator approves imported product, publishes it once, and Buyer sees it", async ({ request, page }: { request: APIRequestContext; page: import("@playwright/test").Page }) => {
  const csv = `externalId,name,supplierSku,priceMinor,currency,quantityOnHand\nrow-b32,${uniqueName},B32-${uniqueName.split(" ")[1]},125000,KZT,3\n`;
  const createResponse = await request.post(`${API_URL}/suppliers/${supplier.organizationId}/import-batches`, { headers: identity(supplier), data: { sourceId, fileName: "flow-b3-2.csv", fileType: "CSV", contentBase64: Buffer.from(csv).toString("base64"), columnMapping: { externalId: "externalId", name: "name", supplierSku: "supplierSku", priceMinor: "priceMinor", currency: "currency", quantityOnHand: "quantityOnHand" } } });
  const batch = await json<{ id: string }>(createResponse);
  batchId = batch.id;
  expect((await request.post(`${API_URL}/suppliers/${supplier.organizationId}/import-batches/${batchId}/process`, { headers: identity(supplier), data: {} })).status()).toBe(201);
  const candidate = await prisma.productCandidate.findFirstOrThrow({ where: { supplierOrganizationId: supplier.organizationId, proposedName: uniqueName } });
  candidateId = candidate.id;

  const beforeSearch = await json<{ total: number; items: Array<{ id: string; name: string }> }>(await request.get(`${API_URL}/catalog/search?q=${encodeURIComponent(uniqueName)}`));
  expect(beforeSearch.items.some(({ name }) => name === uniqueName)).toBe(false);
  expect((await request.get(`${API_URL}/moderation/import-reviews`, { headers: identity(supplier) })).status()).toBe(403);
  const queue = await json<ReviewQueue>(await request.get(`${API_URL}/moderation/import-reviews`, { headers: identity(operator) }));
  expect(queue.items.find(({ id }) => id === candidateId)).toMatchObject({ status: "PENDING", proposed: { name: uniqueName } });

  page.on("pageerror", (error) => console.error(`[admin pageerror] ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") console.error(`[admin console] ${message.text()}`); });
  await page.goto("http://127.0.0.1:3010");
  await expect(page.getByText("Проверяем вход...")).toBeHidden({ timeout: 15_000 });
  await page.getByRole("button", { name: "Загрузка товаров", exact: true }).click();
  const card = page.getByTestId(`import-review-${candidateId}`);
  await expect(card).toBeVisible();
  await card.getByLabel("Каноническое название").fill(uniqueName);
  await card.getByLabel("Slug").fill(`flow-b3-2-${uniqueName.split(" ")[1].toLowerCase()}`);
  await card.getByLabel("Причина решения").fill("Проверены исходная строка, цена, остаток и классификация");
  await card.getByRole("button", { name: "Одобрить карточку" }).click();
  await expect(card.getByText("Готово к публикации")).toBeVisible();

  const approvedQueue = await json<ReviewQueue>(await request.get(`${API_URL}/moderation/import-reviews`, { headers: identity(operator) }));
  const approved = approvedQueue.items.find(({ id }) => id === candidateId) as Review;
  expect(approved.result?.offer.readinessBlockers).toEqual([]);
  productId = approved.result!.product.id;
  offerId = approved.result!.offer.id;
  expect(await prisma.importRow.findFirst({ where: { batchId }, select: { status: true } })).toEqual({ status: "MATCHED" });
  expect(await prisma.supplierOffer.findUnique({ where: { id: offerId }, select: { status: true, publication: { select: { status: true, marketplaceVisible: true } } } })).toEqual({ status: "DRAFT", publication: { status: "DRAFT", marketplaceVisible: false } });

  const stale = await request.put(`${API_URL}/suppliers/${supplier.organizationId}/offers/${offerId}/publication`, { headers: identity(operator), data: { status: "PUBLISHED", marketplaceVisible: true, expectedVersion: approved.result!.offer.version + 10, decisionReason: "Stale operator decision" } });
  expect(stale.status()).toBe(409);

  await card.getByRole("button", { name: "Опубликовать предложение" }).click();
  await page.getByRole("dialog", { name: "Опубликовать предложение?" }).getByRole("button", { name: "Подтвердить публикацию" }).click();
  await expect(card.getByText("Опубликовано")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  const overflowElements = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).map((element) => {
    const rect = element.getBoundingClientRect();
    return { tag: element.tagName, className: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) };
  }).filter(({ left, right, width }) => width > 0 && (left < 0 || right > window.innerWidth + 1)).slice(0, 20));
  expect(overflowElements).toEqual([]);

  const persisted = await prisma.supplierOffer.findUniqueOrThrow({ where: { id: offerId }, include: { publication: true, prices: true, inventoryBalances: true } });
  expect(persisted).toMatchObject({ status: "ACTIVE", publication: { status: "PUBLISHED", marketplaceVisible: true } });
  expect(persisted.prices[0]?.amountMinor.toString()).toBe("125000");
  expect(persisted.inventoryBalances[0]?.quantityAvailable.toString()).toBe("3");
  expect(await prisma.importRow.findFirst({ where: { batchId }, select: { status: true } })).toEqual({ status: "PUBLISHED" });
  const projection = await prisma.productSearchDocument.findUniqueOrThrow({ where: { productId } });
  expect(projection.supplierIds).toContain(supplier.organizationId);
  expect(projection.isAvailable).toBe(true);

  const publicationAudits = await prisma.auditLog.count({ where: { entityType: "SupplierOffer", entityId: offerId, action: "offer.publication.changed" } });
  const publicationEvents = await prisma.outboxEvent.count({ where: { aggregateType: "SupplierOffer", aggregateId: offerId, eventType: "OfferPublicationChanged" } });
  const repeated = await json<Publication>(await request.put(`${API_URL}/suppliers/${supplier.organizationId}/offers/${offerId}/publication`, { headers: identity(operator), data: { status: "PUBLISHED", marketplaceVisible: true, expectedVersion: approved.result!.offer.version, decisionReason: "Repeat must be idempotent" } }));
  expect(repeated).toMatchObject({ offerId, status: "PUBLISHED", marketplaceVisible: true, publishedAt: persisted.publication!.publishedAt!.toISOString() });
  expect(await prisma.auditLog.count({ where: { entityType: "SupplierOffer", entityId: offerId, action: "offer.publication.changed" } })).toBe(publicationAudits);
  expect(await prisma.outboxEvent.count({ where: { aggregateType: "SupplierOffer", aggregateId: offerId, eventType: "OfferPublicationChanged" } })).toBe(publicationEvents);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://127.0.0.1:3001");
  const search = page.locator('header input[name="q"]');
  await expect(search).toHaveAttribute("aria-label", "Поиск по каталогу");
  await search.fill(uniqueName);
  await search.press("Enter");
  await expect(page.getByTestId("product-card").filter({ hasText: uniqueName })).toBeVisible();
  const afterSearch = await json<{ total: number; items: Array<{ id: string; name: string }> }>(await request.get(`${API_URL}/catalog/search?q=${encodeURIComponent(uniqueName)}`));
  expect(afterSearch.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: productId, name: uniqueName })]));
});
