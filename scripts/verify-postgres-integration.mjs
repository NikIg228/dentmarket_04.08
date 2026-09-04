import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(import.meta.dirname, "..");
const apiDirectory = path.join(root, "apps", "api");
const apiEntry = path.join(apiDirectory, "dist", "src", "main.js");
const databaseUrl =
  process.env.POSTGRES_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseSchema = parsedDatabaseUrl.searchParams.get("schema") ?? "public";
const runId = `b04_${Date.now()}_${process.pid}`;
const triggerFunction = `b04_reject_${process.pid}`;
const storageRoot = path.join(root, ".tmp", "postgres-integration", runId);
const port = Number(
  process.env.POSTGRES_VERIFY_API_PORT ?? 4400 + (process.pid % 1000),
);
const apiBase = `http://127.0.0.1:${port}/api`;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const fixture = {
  buyerIds: [],
  userIds: [],
  cartIds: [],
  checkoutIds: [],
  reservationIds: [],
  offerIds: [],
  balanceIds: [],
  lotIds: [],
  packagingIds: [],
  variantIds: [],
  productId: undefined,
};
const logLines = [];
let api;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNpm(args, env) {
  const windows = process.platform === "win32";
  const executable = windows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const commandArgs = windows
    ? ["/d", "/s", "/c", `npm ${args.join(" ")}`]
    : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw new Error(
      `npm ${args.join(" ")} failed with exit code ${result.status}`,
    );
}

function rememberLog(chunk) {
  logLines.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  if (logLines.length > 100) logLines.splice(0, logLines.length - 100);
}

async function request(route, { method = "GET", identity, body } = {}) {
  const headers = {};
  if (identity) {
    headers["x-user-id"] = identity.userId;
    headers["x-organization-id"] = identity.organizationId;
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${apiBase}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { status: response.status, body: payload };
}

async function expectStatus(route, options, expectedStatus) {
  const response = await request(route, options);
  assert(
    response.status === expectedStatus,
    `${options?.method ?? "GET"} ${route} returned ${response.status}, expected ${expectedStatus}: ${JSON.stringify(response.body)}`,
  );
  return response.body;
}

async function waitUntilReady(timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (api.exitCode !== null)
      throw new Error(
        `API exited before readiness with code ${api.exitCode}:\n${logLines.join("\n")}`,
      );
    try {
      const response = await request("/health/ready");
      if (response.status === 200 && response.body?.status === "ready") return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(
    `API did not become ready within ${timeoutMs} ms:\n${logLines.join("\n")}`,
  );
}

async function stopApi() {
  if (!api || api.exitCode !== null) return;
  api.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => api.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (api.exitCode === null) api.kill("SIGKILL");
}

async function createBuyer(index) {
  const bin = `8${String(Date.now()).slice(-6)}${String(process.pid % 1000).padStart(3, "0")}${String(index).padStart(2, "0")}`;
  const user = await prisma.user.create({
    data: {
      email: `${runId}-${index}@marketplace.local`,
      displayName: `B0.4 Buyer ${index}`,
      emailVerifiedAt: new Date(),
    },
  });
  const organization = await prisma.organization.create({
    data: {
      legalName: `B0.4 Clinic ${runId} ${index}`,
      displayName: `B0.4 Clinic ${index}`,
      bin,
      capabilities: { create: { capability: "BUYER" } },
    },
  });
  const role = await prisma.role.create({
    data: {
      organizationId: organization.id,
      code: "b04_buyer",
      name: "B0.4 buyer",
      isSystem: true,
      permissions: {
        create: [{ permission: { connect: { code: "order.create" } } }],
      },
    },
  });
  const membership = await prisma.organizationMembership.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      status: "ACTIVE",
      acceptedAt: new Date(),
      isPrimary: true,
    },
  });
  await prisma.membershipRole.create({
    data: { membershipId: membership.id, roleId: role.id },
  });
  fixture.userIds.push(user.id);
  fixture.buyerIds.push(organization.id);
  return { userId: user.id, organizationId: organization.id };
}

async function createFixtureCatalog() {
  const agreement = await prisma.marketplaceAgreement.findFirst({
    where: {
      status: "ACTIVE",
      startsAt: { lte: new Date() },
      endsAt: { gt: new Date() },
    },
    select: { supplierOrganizationId: true },
    orderBy: { createdAt: "asc" },
  });
  assert(agreement, "Seeded active marketplace agreement is missing");
  const warehouse = await prisma.warehouse.findFirst({
    where: { supplierOrganizationId: agreement.supplierOrganizationId },
    orderBy: { createdAt: "asc" },
  });
  const referenceOffer = await prisma.supplierOffer.findFirst({
    where: {
      supplierOrganizationId: agreement.supplierOrganizationId,
      saleUnitId: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });
  assert(
    warehouse && referenceOffer?.saleUnitId,
    "Seeded supplier warehouse or sale unit is missing",
  );
  const product = await prisma.product.create({
    data: {
      canonicalName: `B0.4 PostgreSQL fixture ${runId}`,
      slug: `${runId}-postgres-fixture`,
      baseUnitId: referenceOffer.saleUnitId,
      productType: "MATERIAL",
      status: "ACTIVE",
    },
  });
  fixture.productId = product.id;
  const quantities = [10, 10, 5];
  const created = [];
  for (let index = 0; index < quantities.length; index += 1) {
    const quantity = quantities[index];
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `${runId}-${index}`,
        saleUnitId: referenceOffer.saleUnitId,
        packageQuantity: 1,
        status: "ACTIVE",
      },
    });
    const packaging = await prisma.productPackaging.create({
      data: {
        productVariantId: variant.id,
        unitId: referenceOffer.saleUnitId,
        code: `${runId}-${index}`,
        name: `B0.4 unit ${index}`,
        level: "BASE",
        quantityInBaseUnit: 1,
      },
    });
    const offer = await prisma.supplierOffer.create({
      data: {
        supplierOrganizationId: agreement.supplierOrganizationId,
        productVariantId: variant.id,
        saleUnitId: referenceOffer.saleUnitId,
        packagingId: packaging.id,
        supplierSku: `${runId}-offer-${index}`,
        confirmationMode: "MANUAL",
        sourceType: "MANUAL",
        status: "ACTIVE",
      },
    });
    await prisma.offerPublication.create({
      data: {
        offerId: offer.id,
        status: "PUBLISHED",
        marketplaceVisible: true,
        publishedAt: new Date(),
      },
    });
    await prisma.offerPrice.create({
      data: {
        offerId: offer.id,
        amountMinor: 100_000 + index * 10_000,
        currency: "KZT",
        status: "ACTIVE",
        validFrom: new Date(Date.now() - 60_000),
        lastConfirmedAt: new Date(),
        freshnessExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const balance = await prisma.inventoryBalance.create({
      data: {
        supplierOrganizationId: agreement.supplierOrganizationId,
        warehouseId: warehouse.id,
        productVariantId: variant.id,
        offerId: offer.id,
        quantityOnHand: quantity,
        quantityReserved: 0,
        safetyStock: 0,
        quantityAvailable: quantity,
        availabilityStatus: "IN_STOCK",
        freshnessStatus: "FRESH",
        source: "MANUAL",
        externalUpdatedAt: new Date(),
        lastSuccessfulSyncAt: new Date(),
        freshnessExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        inventoryBalanceId: balance.id,
        supplierOrganizationId: agreement.supplierOrganizationId,
        warehouseId: warehouse.id,
        productVariantId: variant.id,
        offerId: offer.id,
        lotNumber: `${runId}-${index}`,
        quantityOnHand: quantity,
        quantityReserved: 0,
        quantityAvailable: quantity,
        status: "ACTIVE",
        expirationDate: new Date("2035-12-31"),
      },
    });
    fixture.variantIds.push(variant.id);
    fixture.packagingIds.push(packaging.id);
    fixture.offerIds.push(offer.id);
    fixture.balanceIds.push(balance.id);
    fixture.lotIds.push(lot.id);
    created.push({ offerId: offer.id, balanceId: balance.id, lotId: lot.id });
  }
  return created;
}

async function createCartWithItem(identity, offerId, quantity) {
  const cart = await expectStatus(
    `/buyers/${identity.organizationId}/carts`,
    { method: "POST", identity, body: { currency: "KZT" } },
    201,
  );
  fixture.cartIds.push(cart.id);
  await expectStatus(
    `/carts/${cart.id}/items`,
    { method: "POST", identity, body: { offerId, quantity } },
    201,
  );
  return cart;
}

function checkout(cartId, identity, idempotencyKey) {
  return request(`/carts/${cartId}/checkout`, {
    method: "POST",
    identity,
    body: { idempotencyKey },
  });
}

async function cleanupFixtures() {
  if (
    !/^[a-zA-Z0-9_]+$/.test(databaseSchema) ||
    !/^[a-zA-Z0-9_]+$/.test(triggerFunction)
  )
    return;
  await prisma
    .$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerFunction}" ON "${databaseSchema}"."SupplierOrder"`,
    )
    .catch(() => undefined);
  await prisma
    .$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${databaseSchema}"."${triggerFunction}"()`,
    )
    .catch(() => undefined);
  const checkouts = fixture.buyerIds.length
    ? await prisma.checkout.findMany({
        where: { buyerOrganizationId: { in: fixture.buyerIds } },
        select: { id: true },
      })
    : [];
  const checkoutIds = [
    ...new Set([...fixture.checkoutIds, ...checkouts.map(({ id }) => id)]),
  ];
  const reservations = fixture.balanceIds.length
    ? await prisma.inventoryReservation.findMany({
        where: { inventoryBalanceId: { in: fixture.balanceIds } },
        select: { id: true },
      })
    : [];
  const reservationIds = [
    ...new Set([
      ...fixture.reservationIds,
      ...reservations.map(({ id }) => id),
    ]),
  ];
  if (reservationIds.length)
    await prisma.externalReservation
      .deleteMany({ where: { inventoryReservationId: { in: reservationIds } } })
      .catch(() => undefined);
  if (fixture.balanceIds.length)
    await prisma.inventoryReservation.deleteMany({
      where: { inventoryBalanceId: { in: fixture.balanceIds } },
    });
  if (checkoutIds.length) {
    await prisma.supplierOrderItem.deleteMany({
      where: { supplierOrder: { checkoutId: { in: checkoutIds } } },
    });
    await prisma.supplierOrder.deleteMany({
      where: { checkoutId: { in: checkoutIds } },
    });
    await prisma.checkout.deleteMany({ where: { id: { in: checkoutIds } } });
  }
  if (fixture.cartIds.length)
    await prisma.cart.deleteMany({ where: { id: { in: fixture.cartIds } } });
  if (fixture.offerIds.length || fixture.buyerIds.length)
    await prisma.complianceCheck.deleteMany({
      where: {
        OR: [
          { offerId: { in: fixture.offerIds } },
          { buyerOrganizationId: { in: fixture.buyerIds } },
        ],
      },
    });
  if (fixture.userIds.length || fixture.buyerIds.length)
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: fixture.userIds } },
          { organizationId: { in: fixture.buyerIds } },
        ],
      },
    });
  if (fixture.buyerIds.length)
    await prisma.organization.deleteMany({
      where: { id: { in: fixture.buyerIds } },
    });
  if (fixture.userIds.length)
    await prisma.user.deleteMany({ where: { id: { in: fixture.userIds } } });
  if (fixture.lotIds.length)
    await prisma.inventoryLot.deleteMany({
      where: { id: { in: fixture.lotIds } },
    });
  if (fixture.balanceIds.length)
    await prisma.inventoryBalance.deleteMany({
      where: { id: { in: fixture.balanceIds } },
    });
  if (fixture.offerIds.length) {
    await prisma.offerPrice.deleteMany({
      where: { offerId: { in: fixture.offerIds } },
    });
    await prisma.offerPublication.deleteMany({
      where: { offerId: { in: fixture.offerIds } },
    });
    await prisma.supplierOffer.deleteMany({
      where: { id: { in: fixture.offerIds } },
    });
  }
  if (fixture.packagingIds.length)
    await prisma.productPackaging.deleteMany({
      where: { id: { in: fixture.packagingIds } },
    });
  if (fixture.variantIds.length)
    await prisma.productVariant.deleteMany({
      where: { id: { in: fixture.variantIds } },
    });
  if (fixture.productId)
    await prisma.product.delete({ where: { id: fixture.productId } });
  const aggregateIds = [
    ...checkoutIds,
    ...reservationIds,
    ...fixture.balanceIds,
    ...fixture.lotIds,
    ...fixture.offerIds,
  ];
  if (aggregateIds.length)
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: aggregateIds } },
    });
  const [productsLeft, buyersLeft, cartsLeft, triggersLeft] = await Promise.all(
    [
      prisma.product.count({ where: { slug: `${runId}-postgres-fixture` } }),
      prisma.organization.count({ where: { id: { in: fixture.buyerIds } } }),
      prisma.cart.count({ where: { id: { in: fixture.cartIds } } }),
      prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS count FROM pg_trigger WHERE tgname = '${triggerFunction}' AND NOT tgisinternal`,
      ),
    ],
  );
  const triggerCount = Number(triggersLeft[0]?.count ?? 0);
  assert(
    productsLeft === 0 &&
      buyersLeft === 0 &&
      cartsLeft === 0 &&
      triggerCount === 0,
    `Fixture cleanup left product/buyer/cart/trigger counts ${productsLeft}/${buyersLeft}/${cartsLeft}/${triggerCount}`,
  );
}

try {
  assert(
    ["127.0.0.1", "localhost", "::1"].includes(parsedDatabaseUrl.hostname) ||
      process.env.POSTGRES_VERIFY_ALLOW_REMOTE === "true",
    "PostgreSQL integration verification is local-only unless POSTGRES_VERIFY_ALLOW_REMOTE=true",
  );
  assert(
    /^[a-zA-Z0-9_]+$/.test(databaseSchema),
    "Unsafe PostgreSQL schema name",
  );
  await mkdir(storageRoot, { recursive: true });
  const testEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    DEPLOYMENT_PROFILE: "pilot",
    PROCESS_ROLE: "api",
    DATABASE_URL: databaseUrl,
    AUTH_MODE: "development",
    BACKGROUND_QUEUE_ENABLED: "false",
    OBJECT_STORAGE_DRIVER: "local",
    LOCAL_STORAGE_PATH: storageRoot,
    AV_SCAN_MODE: "disabled",
    LOG_LEVEL: "warn",
  };
  runNpm(
    ["exec", "--workspace=@marketplace/api", "--", "prisma", "migrate", "deploy"],
    testEnvironment,
  );
  runNpm(["run", "db:seed:test"], testEnvironment);
  await prisma.$connect();
  const [rollbackOffer, idempotencyOffer, concurrencyOffer] =
    await createFixtureCatalog();
  const [
    tenantOwner,
    foreignTenant,
    idempotencyBuyer,
    concurrencyBuyerA,
    concurrencyBuyerB,
  ] = await Promise.all([1, 2, 3, 4, 5].map(createBuyer));

  api = spawn(process.execPath, [apiEntry], {
    cwd: apiDirectory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...testEnvironment, API_HOST: "127.0.0.1", API_PORT: String(port) },
  });
  api.stdout.on("data", rememberLog);
  api.stderr.on("data", rememberLog);
  await waitUntilReady();

  const tenantCart = await createCartWithItem(
    tenantOwner,
    rollbackOffer.offerId,
    1,
  );
  await expectStatus(
    `/buyers/${tenantOwner.organizationId}/carts`,
    { identity: foreignTenant },
    403,
  );
  await expectStatus(
    `/carts/${tenantCart.id}/items`,
    {
      method: "POST",
      identity: foreignTenant,
      body: { offerId: rollbackOffer.offerId, quantity: 2 },
    },
    403,
  );

  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION "${databaseSchema}"."${triggerFunction}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."buyerOrganizationId" = '${tenantOwner.organizationId}'::uuid THEN RAISE EXCEPTION 'B0.4 forced rollback'; END IF; RETURN NEW; END; $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER "${triggerFunction}" BEFORE INSERT ON "${databaseSchema}"."SupplierOrder" FOR EACH ROW EXECUTE FUNCTION "${databaseSchema}"."${triggerFunction}"()`,
  );
  try {
    const rollbackResponse = await checkout(
      tenantCart.id,
      tenantOwner,
      `b04-rollback-${randomUUID()}`,
    );
    assert(
      rollbackResponse.status === 500,
      `Forced checkout failure returned ${rollbackResponse.status}, expected 500`,
    );
    const [checkoutCount, persistedCart] = await Promise.all([
      prisma.checkout.count({ where: { cartId: tenantCart.id } }),
      prisma.cart.findUniqueOrThrow({ where: { id: tenantCart.id } }),
    ]);
    assert(
      checkoutCount === 0,
      "Checkout transaction left a Checkout row after rollback",
    );
    assert(
      persistedCart.status === "ACTIVE",
      `Rollback changed cart status to ${persistedCart.status}`,
    );
  } finally {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerFunction}" ON "${databaseSchema}"."SupplierOrder"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${databaseSchema}"."${triggerFunction}"()`,
    );
  }

  const idempotencyCart = await createCartWithItem(
    idempotencyBuyer,
    idempotencyOffer.offerId,
    2,
  );
  const idempotencyKey = `b04-idempotency-${randomUUID()}`;
  const repeated = await Promise.all([
    checkout(idempotencyCart.id, idempotencyBuyer, idempotencyKey),
    checkout(idempotencyCart.id, idempotencyBuyer, idempotencyKey),
  ]);
  assert(
    repeated.every(({ status }) => status === 201),
    `Concurrent idempotent checkout statuses were ${repeated.map(({ status }) => status).join(", ")}`,
  );
  assert(
    repeated[0].body.id === repeated[1].body.id,
    "Concurrent idempotent requests returned different checkouts",
  );
  const idempotentCheckoutId = repeated[0].body.id;
  fixture.checkoutIds.push(idempotentCheckoutId);
  const [
    idempotentCheckoutCount,
    idempotentOrderCount,
    idempotentReservationCount,
  ] = await Promise.all([
    prisma.checkout.count({ where: { cartId: idempotencyCart.id } }),
    prisma.supplierOrder.count({ where: { checkoutId: idempotentCheckoutId } }),
    prisma.inventoryReservation.count({
      where: {
        supplierOrderItem: {
          supplierOrder: { checkoutId: idempotentCheckoutId },
        },
      },
    }),
  ]);
  assert(
    idempotentCheckoutCount === 1 &&
      idempotentOrderCount === 1 &&
      idempotentReservationCount === 1,
    `Idempotency persisted checkout/order/reservation counts ${idempotentCheckoutCount}/${idempotentOrderCount}/${idempotentReservationCount}`,
  );

  const [scarceCartA, scarceCartB] = await Promise.all([
    createCartWithItem(concurrencyBuyerA, concurrencyOffer.offerId, 4),
    createCartWithItem(concurrencyBuyerB, concurrencyOffer.offerId, 4),
  ]);
  const scarceResponses = await Promise.all([
    checkout(scarceCartA.id, concurrencyBuyerA, `b04-stock-a-${randomUUID()}`),
    checkout(scarceCartB.id, concurrencyBuyerB, `b04-stock-b-${randomUUID()}`),
  ]);
  assert(
    scarceResponses
      .map(({ status }) => status)
      .sort()
      .join(",") === "201,409",
    `Scarce-stock checkout statuses were ${scarceResponses.map(({ status }) => status).join(", ")}`,
  );
  const [balance, lot, scarceCheckouts, activeReservations] = await Promise.all(
    [
      prisma.inventoryBalance.findUniqueOrThrow({
        where: { id: concurrencyOffer.balanceId },
      }),
      prisma.inventoryLot.findUniqueOrThrow({
        where: { id: concurrencyOffer.lotId },
      }),
      prisma.checkout.findMany({
        where: { cartId: { in: [scarceCartA.id, scarceCartB.id] } },
        include: { supplierOrders: { include: { items: true } } },
      }),
      prisma.inventoryReservation.findMany({
        where: {
          inventoryBalanceId: concurrencyOffer.balanceId,
          status: "ACTIVE",
        },
      }),
    ],
  );
  fixture.checkoutIds.push(...scarceCheckouts.map(({ id }) => id));
  fixture.reservationIds.push(...activeReservations.map(({ id }) => id));
  assert(
    Number(balance.quantityAvailable) === 1 &&
      Number(balance.quantityReserved) === 4,
    `Balance ended at available/reserved ${balance.quantityAvailable}/${balance.quantityReserved}`,
  );
  assert(
    Number(lot.quantityAvailable) === 1 && Number(lot.quantityReserved) === 4,
    `Lot ended at available/reserved ${lot.quantityAvailable}/${lot.quantityReserved}`,
  );
  const completedCheckouts = scarceCheckouts.filter(
    ({ status }) => status === "COMPLETED",
  );
  const failedCheckout = scarceCheckouts.find(
    ({ status }) => status === "FAILED",
  );
  assert(
    completedCheckouts.length === 1 && scarceCheckouts.length <= 2,
    `Scarce-stock checkout states were ${scarceCheckouts.map(({ status }) => status).join(", ")}`,
  );
  assert(
    activeReservations.length === 1 &&
      Number(activeReservations[0].quantity) === 4,
    "Scarce stock created an invalid active reservation set",
  );
  if (failedCheckout)
    assert(
      failedCheckout.supplierOrders.every(
        (order) =>
          order.status === "CANCELLED" &&
          order.items.every((item) => item.status === "CANCELLED"),
      ),
      "Failed checkout was not fully compensated",
    );

  console.log(
    JSON.stringify(
      {
        status: "passed",
        database: parsedDatabaseUrl.pathname.slice(1),
        scenarios: {
          tenantIsolation: "passed",
          transactionRollback: "passed",
          concurrentIdempotency: "passed",
          scarceStockConcurrency: "passed",
        },
        persisted: {
          idempotentCheckoutCount,
          idempotentOrderCount,
          idempotentReservationCount,
          scarceCheckoutStates: scarceCheckouts
            .map(({ status }) => status)
            .sort(),
          finalAvailable: Number(balance.quantityAvailable),
          finalReserved: Number(balance.quantityReserved),
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  if (logLines.length) console.error(`API log tail:\n${logLines.join("\n")}`);
  process.exitCode = 1;
} finally {
  await stopApi();
  await cleanupFixtures().catch((error) => {
    console.error(
      `PostgreSQL fixture cleanup failed: ${error instanceof Error ? error.stack : error}`,
    );
    process.exitCode = 1;
  });
  await prisma.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
}
