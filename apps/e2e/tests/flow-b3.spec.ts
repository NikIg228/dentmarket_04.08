import { createHash, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";

process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient();
const localStorageRoot = resolve(process.cwd(), "../..", ".local-storage");
const permissionCodes = ["import.manage", "matching.manage"];
const exactPriceMinor = "9007199254740993";

type ActorFixture = {
  organizationId: string;
  userId: string;
  roleId: string;
};

type ImportBatchPayload = {
  id: string;
  checksum: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
};

type ImportDiagnosticsPayload = {
  batchId: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  byStatus: Record<string, number>;
  conflictCount: number;
  conflicts: Array<{
    rowNumber: number;
    status: string;
    code: string | null;
    message: string | null;
  }>;
  idempotency: string;
};

let supplier: ActorFixture;
let foreignSupplier: ActorFixture;
let sourceId: string;
let productId: string;
let variantId: string;
let batchId: string | null = null;

function assertLocalDatabase() {
  const hostname = new URL(databaseUrl).hostname;
  if (
    !["127.0.0.1", "localhost", "::1"].includes(hostname) &&
    process.env.FLOW_B3_ALLOW_REMOTE !== "true"
  )
    throw new Error(
      "Flow B3 creates temporary catalog-import data and is local-only. Set FLOW_B3_ALLOW_REMOTE=true explicitly for a non-local test database.",
    );
}

function identity(actor: ActorFixture) {
  return {
    "x-user-id": actor.userId,
    "x-organization-id": actor.organizationId,
  };
}

async function responseJson<T>(response: APIResponse): Promise<T> {
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as T;
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function createSupplierFixture(label: string): Promise<ActorFixture> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`.slice(-10);
  const organizationId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const permissions = await prisma.permission.findMany({
    where: { code: { in: permissionCodes } },
    select: { id: true, code: true },
  });
  expect(permissions.map(({ code }) => code).sort()).toEqual(
    [...permissionCodes].sort(),
  );

  await prisma.$transaction(async (tx) => {
    await tx.organization.create({
      data: {
        id: organizationId,
        legalName: `ТОО Flow B3 ${label} ${suffix}`,
        displayName: `Flow B3 ${label} ${suffix}`,
        bin: `86${suffix}`,
        capabilities: { create: { capability: "SUPPLIER" } },
        supplierProfile: {
          create: { regulatoryDetails: { testOnly: true, flow: "B3.1" } },
        },
      },
    });
    await tx.user.create({
      data: {
        id: userId,
        email: `flow-b3-${label}-${suffix}@example.local`,
        displayName: `Flow B3 ${label}`,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.role.create({
      data: {
        id: roleId,
        organizationId,
        code: `flow_b3_${label}_${suffix}`,
        name: `Flow B3 ${label}`,
        permissions: {
          create: permissions.map(({ id }) => ({
            permission: { connect: { id } },
          })),
        },
      },
    });
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

async function cleanupStorage(storageKeys: string[]) {
  for (const storageKey of storageKeys) {
    const filePath = resolve(localStorageRoot, storageKey);
    if (
      filePath !== localStorageRoot &&
      !filePath.startsWith(`${localStorageRoot}${sep}`)
    )
      throw new Error(`Unsafe Flow B3 storage cleanup path: ${filePath}`);
    await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function cleanupFixtures() {
  const organizationIds = [
    supplier?.organizationId,
    foreignSupplier?.organizationId,
  ].filter((value): value is string => Boolean(value));
  const userIds = [supplier?.userId, foreignSupplier?.userId].filter(
    (value): value is string => Boolean(value),
  );
  const batches = organizationIds.length
    ? await prisma.importBatch.findMany({
        where: { supplierOrganizationId: { in: organizationIds } },
        select: { id: true },
      })
    : [];
  const batchIds = batches.map(({ id }) => id);
  const assets = organizationIds.length
    ? await prisma.uploadAsset.findMany({
        where: {
          organizationId: { in: organizationIds },
          purpose: "supplier-import",
        },
        select: { id: true, storageKey: true },
      })
    : [];

  if (batchIds.length) {
    await prisma.outboxEvent.deleteMany({
      where: { aggregateType: "ImportBatch", aggregateId: { in: batchIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { entityType: "ImportBatch", entityId: { in: batchIds } },
    });
    await prisma.importBatch.deleteMany({ where: { id: { in: batchIds } } });
  }
  if (organizationIds.length) {
    await prisma.auditLog.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.uploadAsset.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }
  if (userIds.length)
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (productId)
    await prisma.product.deleteMany({ where: { id: productId } });

  await cleanupStorage(assets.map(({ storageKey }) => storageKey));

  const [organizations, users, products, remainingAssets, remainingBatches] =
    await Promise.all([
      organizationIds.length
        ? prisma.organization.count({ where: { id: { in: organizationIds } } })
        : 0,
      userIds.length
        ? prisma.user.count({ where: { id: { in: userIds } } })
        : 0,
      productId ? prisma.product.count({ where: { id: productId } }) : 0,
      assets.length
        ? prisma.uploadAsset.count({
            where: { id: { in: assets.map(({ id }) => id) } },
          })
        : 0,
      batchIds.length
        ? prisma.importBatch.count({ where: { id: { in: batchIds } } })
        : 0,
    ]);
  expect({
    organizations,
    users,
    products,
    remainingAssets,
    remainingBatches,
  }).toEqual({
    organizations: 0,
    users: 0,
    products: 0,
    remainingAssets: 0,
    remainingBatches: 0,
  });
}

test.beforeEach(async () => {
  assertLocalDatabase();
  batchId = null;
  productId = "";
  variantId = "";
  supplier = await createSupplierFixture("supplier");
  foreignSupplier = await createSupplierFixture("foreign");

  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  productId = randomUUID();
  variantId = randomUUID();
  const source = await prisma.supplierDataSource.create({
    data: {
      supplierOrganizationId: supplier.organizationId,
      name: `Flow B3 CSV ${suffix}`,
      type: "CSV",
      configuration: { testOnly: true, flow: "B3.1" },
    },
  });
  sourceId = source.id;
  await prisma.warehouse.create({
    data: {
      supplierOrganizationId: supplier.organizationId,
      code: `B3_${suffix.slice(0, 8).toUpperCase()}`,
      name: "Flow B3 test warehouse",
      timezone: "Asia/Almaty",
    },
  });
  await prisma.product.create({
    data: {
      id: productId,
      canonicalName: `Flow B3 exact material ${suffix}`,
      slug: `flow-b3-exact-material-${suffix}`,
      productType: "material",
      status: "ACTIVE",
      variants: {
        create: {
          id: variantId,
          sku: `B3-SKU-${suffix}`,
          gtin: `99${suffix.padEnd(12, "0").slice(0, 12)}`,
          status: "ACTIVE",
        },
      },
    },
  });
});

test.afterEach(async () => {
  await cleanupFixtures();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("supplier CSV is staged, validated, matched, and reprocessed idempotently", async ({
  request,
}: {
  request: APIRequestContext;
}) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const exactExternalId = `b3-exact-${suffix}`;
  const pendingExternalId = `b3-pending-${suffix}`;
  const invalidPriceExternalId = `b3-invalid-price-${suffix}`;
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { variants: true },
  });
  const variant = product.variants[0]!;
  const headers = [
    "externalId",
    "name",
    "supplierSku",
    "gtin",
    "priceMinor",
    "currency",
    "quantityOnHand",
    "expirationDate",
  ];
  const rows = [
    [
      exactExternalId,
      product.canonicalName,
      variant.sku!,
      variant.gtin!,
      exactPriceMinor,
      "KZT",
      "7.5",
      "2028-12-31",
    ],
    [
      pendingExternalId,
      `ZXQ${suffix} UNLISTED MATERIAL`,
      `ZXQ-SKU-${suffix}`,
      "",
      "125000",
      "KZT",
      "3",
      "",
    ],
    ["", product.canonicalName, variant.sku!, "", "120000", "KZT", "1", ""],
    [
      invalidPriceExternalId,
      product.canonicalName,
      variant.sku!,
      "",
      "12.50",
      "KZT",
      "1",
      "",
    ],
  ];
  const csv = `\uFEFF${headers.join(",")}\n${rows
    .map((row) => row.map(csvCell).join(","))
    .join("\n")}\n`;
  const checksum = createHash("sha256").update(Buffer.from(csv)).digest("hex");

  const createdResponse = await request.post(
    `${API_URL}/suppliers/${supplier.organizationId}/import-batches`,
    {
      headers: identity(supplier),
      data: {
        sourceId,
        fileName: `flow-b3-${suffix}.csv`,
        fileType: "CSV",
        contentBase64: Buffer.from(csv).toString("base64"),
        columnMapping: {
          externalId: "externalId",
          name: "name",
          supplierSku: "supplierSku",
          gtin: "gtin",
          priceMinor: "priceMinor",
          currency: "currency",
          quantityOnHand: "quantityOnHand",
          expirationDate: "expirationDate",
        },
      },
    },
  );
  expect(createdResponse.status()).toBe(201);
  const created = await responseJson<ImportBatchPayload>(createdResponse);
  batchId = created.id;
  expect(created).toMatchObject({
    checksum,
    status: "MAPPED",
    totalRows: 4,
    processedRows: 0,
    errorRows: 0,
  });

  const staged = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });
  expect(staged.rows.map(({ status }) => status)).toEqual([
    "RAW",
    "RAW",
    "RAW",
    "RAW",
  ]);
  expect(staged.rows[0]?.rawData).toMatchObject({
    externalId: exactExternalId,
    priceMinor: exactPriceMinor,
    quantityOnHand: "7.5",
  });
  expect(staged.rows.every(({ normalizedData }) => normalizedData === null)).toBe(
    true,
  );
  const asset = await prisma.uploadAsset.findFirstOrThrow({
    where: {
      organizationId: supplier.organizationId,
      purpose: "supplier-import",
      metadata: { path: ["importBatchId"], equals: batchId },
    },
  });
  expect(asset).toMatchObject({
    status: "CLEAN",
    checksumSha256: checksum,
    detectedMime: "text/csv",
  });

  const foreignResponse = await request.get(
    `${API_URL}/suppliers/${supplier.organizationId}/import-batches/${batchId}/diagnostics`,
    { headers: identity(foreignSupplier) },
  );
  expect(foreignResponse.status()).toBe(403);

  const processedResponse = await request.post(
    `${API_URL}/suppliers/${supplier.organizationId}/import-batches/${batchId}/process`,
    { headers: identity(supplier), data: {} },
  );
  expect(processedResponse.status()).toBe(201);
  const processed = await responseJson<ImportBatchPayload>(processedResponse);
  expect(processed).toMatchObject({
    id: batchId,
    checksum,
    status: "COMPLETED_WITH_ERRORS",
    totalRows: 4,
    processedRows: 2,
    errorRows: 2,
  });

  const diagnosticsResponse = await request.get(
    `${API_URL}/suppliers/${supplier.organizationId}/import-batches/${batchId}/diagnostics`,
    { headers: identity(supplier) },
  );
  const diagnostics =
    await responseJson<ImportDiagnosticsPayload>(diagnosticsResponse);
  expect(diagnostics).toMatchObject({
    batchId,
    status: "COMPLETED_WITH_ERRORS",
    totalRows: 4,
    processedRows: 2,
    errorRows: 2,
    byStatus: { MATCHED: 1, MATCH_PENDING: 1, REJECTED: 2 },
    conflictCount: 3,
  });
  expect(diagnostics.conflicts.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      null,
      "REQUIRED_VALUE_MISSING",
      "INVALID_PRICE_MINOR",
    ]),
  );
  expect(diagnostics.idempotency).toContain("without reprocessing");

  const persistedRows = await prisma.importRow.findMany({
    where: { batchId },
    orderBy: { rowNumber: "asc" },
  });
  expect(
    persistedRows.map(({ status, errorCode }) => ({ status, errorCode })),
  ).toEqual([
    { status: "MATCHED", errorCode: null },
    { status: "MATCH_PENDING", errorCode: null },
    { status: "REJECTED", errorCode: "REQUIRED_VALUE_MISSING" },
    { status: "REJECTED", errorCode: "INVALID_PRICE_MINOR" },
  ]);
  expect(persistedRows[0]?.rawData).toEqual(staged.rows[0]?.rawData);

  const exactItem = await prisma.supplierExternalItem.findFirstOrThrow({
    where: { sourceId, externalId: exactExternalId },
    include: {
      matchCandidates: true,
      matchedVariant: true,
    },
  });
  expect(exactItem.matchedVariantId).toBe(variantId);
  expect(exactItem.matchCandidates).toHaveLength(1);
  expect(exactItem.matchCandidates[0]).toMatchObject({
    productVariantId: variantId,
    status: "CONFIRMED",
  });
  const pendingItem = await prisma.supplierExternalItem.findFirstOrThrow({
    where: { sourceId, externalId: pendingExternalId },
    include: { productCandidate: true, matchCandidates: true },
  });
  expect(pendingItem.matchedVariantId).toBeNull();
  expect(pendingItem.matchCandidates).toHaveLength(0);
  expect(pendingItem.productCandidate).toMatchObject({ status: "PENDING" });
  expect(
    await prisma.supplierExternalItem.count({
      where: {
        sourceId,
        externalId: { in: [invalidPriceExternalId] },
      },
    }),
  ).toBe(0);

  const offer = await prisma.supplierOffer.findFirstOrThrow({
    where: { supplierOrganizationId: supplier.organizationId, externalId: exactExternalId },
    include: { publication: true, prices: true, priceHistory: true },
  });
  expect(offer).toMatchObject({
    status: "DRAFT",
    publication: { status: "DRAFT", marketplaceVisible: false },
  });
  expect(offer.prices).toHaveLength(1);
  expect(offer.prices[0]?.amountMinor.toString()).toBe(exactPriceMinor);
  expect(offer.priceHistory).toHaveLength(1);
  expect(offer.priceHistory[0]?.amountMinor.toString()).toBe(exactPriceMinor);
  const balance = await prisma.inventoryBalance.findFirstOrThrow({
    where: { offerId: offer.id },
  });
  expect(balance.quantityOnHand.toString()).toBe("7.5");
  expect(balance.quantityAvailable.toString()).toBe("7.5");

  const evidenceBeforeRepeat = {
    externalItems: await prisma.supplierExternalItem.count({
      where: { supplierOrganizationId: supplier.organizationId },
    }),
    mappingMemories: await prisma.supplierMappingMemory.count({
      where: { supplierOrganizationId: supplier.organizationId },
    }),
    offers: await prisma.supplierOffer.count({
      where: { supplierOrganizationId: supplier.organizationId },
    }),
    prices: await prisma.offerPrice.count({ where: { offerId: offer.id } }),
    priceHistory: await prisma.offerPriceHistory.count({
      where: { offerId: offer.id },
    }),
    audits: await prisma.auditLog.count({
      where: { entityType: "ImportBatch", entityId: batchId },
    }),
    outbox: await prisma.outboxEvent.count({
      where: { aggregateType: "ImportBatch", aggregateId: batchId },
    }),
    autoPublishAudits: await prisma.auditLog.count({
      where: {
        organizationId: supplier.organizationId,
        action: "offer.auto_published_after_import",
      },
    }),
    autoPublishEvents: await prisma.outboxEvent.count({
      where: { eventType: "OfferAutoPublished", aggregateId: offer.id },
    }),
  };
  expect(evidenceBeforeRepeat).toEqual({
    externalItems: 2,
    mappingMemories: 1,
    offers: 1,
    prices: 1,
    priceHistory: 1,
    audits: 2,
    outbox: 2,
    autoPublishAudits: 0,
    autoPublishEvents: 0,
  });

  const repeatedResponse = await request.post(
    `${API_URL}/suppliers/${supplier.organizationId}/import-batches/${batchId}/process`,
    { headers: identity(supplier), data: {} },
  );
  expect(repeatedResponse.status()).toBe(201);
  expect(await responseJson<ImportBatchPayload>(repeatedResponse)).toMatchObject({
    id: batchId,
    status: "COMPLETED_WITH_ERRORS",
    processedRows: 2,
    errorRows: 2,
  });

  const evidenceAfterRepeat = {
    externalItems: await prisma.supplierExternalItem.count({
      where: { supplierOrganizationId: supplier.organizationId },
    }),
    mappingMemories: await prisma.supplierMappingMemory.count({
      where: { supplierOrganizationId: supplier.organizationId },
    }),
    offers: await prisma.supplierOffer.count({
      where: { supplierOrganizationId: supplier.organizationId },
    }),
    prices: await prisma.offerPrice.count({ where: { offerId: offer.id } }),
    priceHistory: await prisma.offerPriceHistory.count({
      where: { offerId: offer.id },
    }),
    audits: await prisma.auditLog.count({
      where: { entityType: "ImportBatch", entityId: batchId },
    }),
    outbox: await prisma.outboxEvent.count({
      where: { aggregateType: "ImportBatch", aggregateId: batchId },
    }),
    autoPublishAudits: await prisma.auditLog.count({
      where: {
        organizationId: supplier.organizationId,
        action: "offer.auto_published_after_import",
      },
    }),
    autoPublishEvents: await prisma.outboxEvent.count({
      where: { eventType: "OfferAutoPublished", aggregateId: offer.id },
    }),
  };
  expect(evidenceAfterRepeat).toEqual(evidenceBeforeRepeat);
});
