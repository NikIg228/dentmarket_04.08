import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "../apps/api/node_modules/@prisma/client/index.js";
import * as coreSchemas from "../packages/schemas/dist/index.js";

const root = path.resolve(import.meta.dirname, "..");
const apiEntry = path.join(root, "apps", "api", "dist", "src", "main.js");
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const databaseHost = new URL(databaseUrl).hostname;
const port = Number(process.env.PILOT_VERIFY_API_PORT ?? 4112);
const apiBase = `http://127.0.0.1:${port}/api`;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const contractOnly = process.argv.includes("--contract-only");
const logLines = [];
let api;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSchema(schema, value, label) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `${label} violates its shared response schema: ${JSON.stringify(parsed.error.issues)}`,
    );
  }
}

function assertOpenApiContract(openApi) {
  const requiredComponents = [
    "HealthResponse",
    "ReadinessResponse",
    "CatalogSearchResponse",
    "OfferComparisonResponse",
    "CreateCartRequest",
    "CartResponse",
    "CartListResponse",
    "CartValidationResponse",
    "AddCartItemRequest",
    "CartItemResponse",
    "CheckoutCartRequest",
    "CheckoutResponse",
    "ConfirmSupplierOrderRequest",
    "SupplierOrderResponse",
    "SupplierOrderListResponse",
    "OutboxDeadLetterQuery",
    "OutboxDeadLetterListResponse",
    "OutboxReplayRequest",
    "OutboxReplayResponse",
    "ErrorResponse",
  ];
  const components = openApi.components?.schemas ?? {};
  for (const name of requiredComponents) {
    assert(components[name], `OpenAPI component ${name} is missing`);
  }

  const coreOperations = [
    ["/api/health", "get", "200", "HealthResponse"],
    ["/api/health/ready", "get", "200", "ReadinessResponse"],
    ["/api/catalog/cities", "get", "200", "PublicCityListResponse"],
    ["/api/catalog/search", "get", "200", "CatalogSearchResponse"],
    [
      "/api/catalog/products/{productId}/compare",
      "get",
      "200",
      "OfferComparisonResponse",
    ],
    ["/api/marketplace/search", "get", "200", "CatalogSearchResponse"],
    [
      "/api/marketplace/products/{productId}/compare",
      "get",
      "200",
      "OfferComparisonResponse",
    ],
    [
      "/api/buyers/{buyerOrganizationId}/carts",
      "get",
      "200",
      "CartListResponse",
    ],
    [
      "/api/buyers/{buyerOrganizationId}/carts",
      "post",
      "201",
      "CartResponse",
      "CreateCartRequest",
    ],
    [
      "/api/carts/{cartId}/items",
      "post",
      "201",
      "CartItemResponse",
      "AddCartItemRequest",
    ],
    ["/api/carts/{cartId}/reprice", "post", "201", "CartResponse"],
    ["/api/carts/{cartId}/validate", "post", "200", "CartValidationResponse"],
    [
      "/api/carts/{cartId}/checkout",
      "post",
      "201",
      "CheckoutResponse",
      "CheckoutCartRequest",
    ],
    ["/api/checkouts/{checkoutId}", "get", "200", "CheckoutResponse"],
    ["/api/supplier-orders", "get", "200", "SupplierOrderListResponse"],
    [
      "/api/buyers/{buyerOrganizationId}/orders",
      "get",
      "200",
      "SupplierOrderListResponse",
    ],
    [
      "/api/supplier-orders/{orderId}/confirm",
      "post",
      "201",
      "SupplierOrderResponse",
      "ConfirmSupplierOrderRequest",
    ],
    [
      "/api/operations/outbox/dead-letter",
      "get",
      "200",
      "OutboxDeadLetterListResponse",
    ],
    [
      "/api/operations/outbox/dead-letter/{eventId}/replay",
      "post",
      "200",
      "OutboxReplayResponse",
      "OutboxReplayRequest",
    ],
  ];
  for (const [
    pathName,
    method,
    status,
    responseName,
    requestName,
  ] of coreOperations) {
    const operation = openApi.paths?.[pathName]?.[method];
    assert(
      operation,
      `OpenAPI operation ${method.toUpperCase()} ${pathName} is missing`,
    );
    const responseSchema =
      operation.responses?.[status]?.content?.["application/json"]?.schema;
    assert(
      responseSchema?.$ref === `#/components/schemas/${responseName}`,
      `${method.toUpperCase()} ${pathName} does not reference ${responseName}`,
    );
    if (requestName) {
      const requestSchema =
        operation.requestBody?.content?.["application/json"]?.schema;
      assert(
        requestSchema?.$ref === `#/components/schemas/${requestName}`,
        `${method.toUpperCase()} ${pathName} does not reference ${requestName}`,
      );
    }
  }
  for (const pathName of [
    "/api/catalog/search",
    "/api/catalog/products/{productId}/compare",
  ]) {
    const parameters = openApi.paths[pathName].get.parameters ?? [];
    assert(
      parameters.length > 0,
      `GET ${pathName} has no documented query/path parameters`,
    );
  }
  for (const pathName of [
    "/api/marketplace/search",
    "/api/buyers/{buyerOrganizationId}/carts",
    "/api/carts/{cartId}/checkout",
    "/api/supplier-orders",
    "/api/operations/outbox/dead-letter",
  ]) {
    const pathItem = openApi.paths[pathName];
    const operation = pathItem.get ?? pathItem.post;
    assert(
      operation.security?.some((requirement) =>
        Object.hasOwn(requirement, "access-token"),
      ),
      `${pathName} does not document bearer authentication`,
    );
  }
  return coreOperations.length;
}

function rememberLog(chunk) {
  logLines.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  if (logLines.length > 80) logLines.splice(0, logLines.length - 80);
}

async function request(route, options = {}) {
  const response = await fetch(`${apiBase}${route}`, options);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${route} failed (${response.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }
  return body;
}

async function waitUntilReady(timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (api.exitCode !== null) {
      throw new Error(`API exited before readiness with code ${api.exitCode}`);
    }
    try {
      const ready = await request("/health/ready");
      if (ready?.status === "ready") return ready;
    } catch {
      // The listener or database may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API did not become ready within ${timeoutMs} ms`);
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

try {
  if (
    !["127.0.0.1", "localhost", "::1"].includes(databaseHost) &&
    process.env.PILOT_VERIFY_ALLOW_REMOTE !== "true"
  ) {
    throw new Error(
      "Pilot backend verification creates a demo order and is local-only. Set PILOT_VERIFY_ALLOW_REMOTE=true explicitly to use a non-local database.",
    );
  }
  if (!fs.existsSync(apiEntry)) {
    throw new Error(
      "Built API entry is missing. Run `pnpm --filter @marketplace/api build` first.",
    );
  }

  await prisma.$queryRaw`SELECT 1`;
  const [operatorMembership, buyer] = await Promise.all([
    prisma.organizationMembership.findFirst({
      where: {
        status: "ACTIVE",
        organization: {
          capabilities: { some: { capability: "MARKETPLACE_OPERATOR" } },
        },
      },
      select: { userId: true, organizationId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organization.findUnique({
      where: { bin: "970000000001" },
      select: { id: true, displayName: true },
    }),
  ]);
  assert(
    operatorMembership,
    "Active marketplace operator membership is missing",
  );
  assert(
    buyer,
    "Pilot buyer 970000000001 is missing; run `pnpm db:prepare-pilot`",
  );

  api = spawn(process.execPath, [apiEntry], {
    cwd: path.join(root, "apps", "api"),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      DEPLOYMENT_PROFILE: "pilot",
      DATABASE_URL: databaseUrl,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      AUTH_MODE: "development",
      BACKGROUND_QUEUE_ENABLED: "false",
      OBJECT_STORAGE_DRIVER: "local",
      PUBLIC_CATALOG_ORGANIZATION_ID: buyer.id,
      LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
    },
  });
  api.stdout.on("data", rememberLog);
  api.stderr.on("data", rememberLog);

  const readiness = await waitUntilReady();
  const health = await request("/health");
  assert(health?.status === "ok", "Liveness endpoint did not return status=ok");
  assert(
    readiness?.checks?.database?.status === "ok",
    "Readiness did not confirm the database",
  );
  assertSchema(coreSchemas.healthResponseSchema, health, "GET /health");
  assertSchema(
    coreSchemas.readinessResponseSchema,
    readiness,
    "GET /health/ready",
  );

  const openApiResponse = await fetch(`http://127.0.0.1:${port}/docs-json`);
  assert(
    openApiResponse.ok,
    `OpenAPI document failed (${openApiResponse.status})`,
  );
  const openApi = await openApiResponse.json();
  const operations = Object.values(openApi.paths ?? {}).flatMap((pathItem) =>
    Object.entries(pathItem).filter(([method]) =>
      ["get", "post", "put", "patch", "delete", "options", "head"].includes(
        method,
      ),
    ),
  );
  const operationsWithRequestBody = operations.filter(
    ([, operation]) => operation.requestBody,
  ).length;
  const operationsWithSuccessSchema = operations.filter(([, operation]) =>
    Object.entries(operation.responses ?? {}).some(
      ([status, response]) =>
        /^2\d\d$/.test(status) &&
        response?.content?.["application/json"]?.schema,
    ),
  ).length;
  const componentSchemas = Object.keys(
    openApi.components?.schemas ?? {},
  ).length;
  assert(operations.length > 0, "OpenAPI document contains no operations");
  const verifiedCoreOperations = assertOpenApiContract(openApi);

  const invalidSearchResponse = await fetch(
    `${apiBase}/catalog/search?limit=0`,
  );
  assert(
    invalidSearchResponse.status === 400,
    "Invalid catalog query did not return HTTP 400",
  );
  const invalidSearch = await invalidSearchResponse.json();
  assertSchema(
    coreSchemas.errorResponseSchema,
    invalidSearch,
    "Catalog validation error",
  );
  const documentedBadRequest =
    openApi.paths?.["/api/catalog/search"]?.get?.responses?.["400"]?.content?.[
      "application/json"
    ]?.schema;
  assert(
    documentedBadRequest?.$ref === "#/components/schemas/ErrorResponse",
    "Public catalog validation error is absent from OpenAPI",
  );

  const search = await request(
    "/catalog/search?inStock=true&limit=100&sort=PRICE_ASC",
  );
  assertSchema(
    coreSchemas.catalogSearchResponseSchema,
    search,
    "GET /catalog/search",
  );
  assert(
    search?.total === 50,
    `Expected 50 buyable pilot products, received ${search?.total}`,
  );
  const offerCount = search.items.reduce(
    (sum, item) => sum + item.offers.length,
    0,
  );
  assert(
    offerCount === 500,
    `Expected 500 visible pilot offers, received ${offerCount}`,
  );

  const product = search.items.find((item) => item.offers.length === 10);
  assert(
    product,
    "No pilot product with ten comparable supplier offers was found",
  );
  const comparison = await request(
    `/catalog/products/${product.id}/compare?quantity=1`,
  );
  assertSchema(
    coreSchemas.offerComparisonResponseSchema,
    comparison,
    "GET /catalog/products/:id/compare",
  );
  assert(
    comparison.offers.length === 10,
    `Expected 10 compared offers, received ${comparison.offers.length}`,
  );
  const prices = comparison.offers.map((offer) =>
    Number(offer.price.normalizedPriceMinor),
  );
  assert(
    prices.every((price, index) => index === 0 || price >= prices[index - 1]),
    "Compared offers are not sorted by normalized price",
  );

  const contractSummary = {
    operations: operations.length,
    operationsWithRequestBody,
    operationsWithSuccessSchema,
    componentSchemas,
    verifiedCoreOperations,
    responseValidation: "passed",
    errorValidation: "passed",
  };
  const baseSummary = {
    status: "passed",
    mode: contractOnly ? "contract" : "full-purchase",
    health: health.status,
    readiness: readiness.status,
    apiContract: contractSummary,
    catalog: { buyableProducts: search.total, visibleOffers: offerCount },
    comparison: { productId: product.id, offers: comparison.offers.length },
  };

  if (contractOnly) {
    console.log(JSON.stringify(baseSummary, null, 2));
  } else {
    const identityHeaders = {
      "content-type": "application/json",
      "x-user-id": operatorMembership.userId,
      "x-organization-id": operatorMembership.organizationId,
    };
    const post = (route, body) =>
      request(route, {
        method: "POST",
        headers: identityHeaders,
        body: JSON.stringify(body),
      });

    const replayEvent = await prisma.outboxEvent.create({
      data: {
        aggregateType: "B4.3_VERIFY",
        aggregateId: randomUUID(),
        eventType: "b4.3.verify",
        payload: { sentinel: "payload-must-not-change" },
        status: "DEAD_LETTER",
        attempts: 10,
        maxAttempts: 10,
        lastError: "synthetic verification failure",
      },
    });
    const replayKey = `b4.3-verify-${Date.now()}`;
    try {
      const deadLetters = await request(
        "/operations/outbox/dead-letter?eventType=b4.3.verify&limit=10",
        { headers: identityHeaders },
      );
      assertSchema(
        coreSchemas.outboxDeadLetterListResponseSchema,
        deadLetters,
        "GET /operations/outbox/dead-letter",
      );
      assert(
        deadLetters.items.some((item) => item.id === replayEvent.id),
        "Synthetic dead-letter event is absent from the protected operator list",
      );
      const replay = await post(
        `/operations/outbox/dead-letter/${replayEvent.id}/replay`,
        {
          idempotencyKey: replayKey,
          reason: "Verify protected replay after a synthetic handler failure",
        },
      );
      assertSchema(
        coreSchemas.outboxReplayResponseSchema,
        replay,
        "POST /operations/outbox/dead-letter/:eventId/replay",
      );
      const repeatedReplay = await post(
        `/operations/outbox/dead-letter/${replayEvent.id}/replay`,
        {
          idempotencyKey: replayKey,
          reason: "Verify protected replay after a synthetic handler failure",
        },
      );
      assert(
        repeatedReplay.eventId === replay.eventId &&
          repeatedReplay.status === replay.status &&
          repeatedReplay.attempts === replay.attempts &&
          repeatedReplay.replayedAt === replay.replayedAt,
        `Dead-letter replay idempotency returned a different response: first=${JSON.stringify(replay)} repeated=${JSON.stringify(repeatedReplay)}`,
      );
      const persistedReplay = await prisma.outboxEvent.findUnique({
        where: { id: replayEvent.id },
      });
      assert(
        persistedReplay?.status === "PENDING" && persistedReplay.attempts === 0,
        "Dead-letter replay did not reset the event to PENDING with zero attempts",
      );
      assert(
        JSON.stringify(persistedReplay.payload) ===
          JSON.stringify(replayEvent.payload),
        "Dead-letter replay changed the event payload",
      );
      const replayAudit = await prisma.auditLog.findFirst({
        where: {
          entityType: "OutboxEvent",
          entityId: replayEvent.id,
          action: "outbox.dead_letter.replayed",
        },
      });
      assert(replayAudit, "Dead-letter replay did not write an audit record");
    } finally {
      await prisma.auditLog.deleteMany({
        where: {
          entityType: "OutboxEvent",
          entityId: replayEvent.id,
          action: "outbox.dead_letter.replayed",
        },
      });
      await prisma.idempotencyRecord.deleteMany({
        where: { scope: "outbox.dead-letter.replay", key: replayKey },
      });
      await prisma.outboxEvent.delete({ where: { id: replayEvent.id } });
    }

    const cart = await post(`/buyers/${buyer.id}/carts`, { currency: "KZT" });
    assertSchema(
      coreSchemas.cartResponseSchema,
      cart,
      "POST /buyers/:id/carts",
    );
    const selectedOffer = product.offers[0];
    const cartItem = await post(`/carts/${cart.id}/items`, {
      offerId: selectedOffer.id,
      quantity: 1,
    });
    assertSchema(
      coreSchemas.cartItemResponseSchema,
      cartItem,
      "POST /carts/:id/items",
    );
    assert(cartItem?.id, "Cart item was not created");
    const initialValidation = await post(`/carts/${cart.id}/validate`);
    assertSchema(
      coreSchemas.cartValidationResponseSchema,
      initialValidation,
      "POST /carts/:id/validate",
    );
    assert(
      initialValidation.canCheckout,
      "Freshly added cart item did not pass validation",
    );

    assert(
      cartItem.priceSource === "BASE" && cartItem.priceRuleId,
      "Pilot reprice gate requires a base price rule",
    );
    const [originalPrice, originalBalance] = await Promise.all([
      prisma.offerPrice.findUnique({ where: { id: cartItem.priceRuleId } }),
      prisma.inventoryBalance.findFirst({
        where: {
          offerId: selectedOffer.id,
          freshnessStatus: "FRESH",
          quantityAvailable: { gte: 2 },
        },
        orderBy: { quantityAvailable: "desc" },
      }),
    ]);
    assert(originalPrice, "Pilot offer base price is missing");
    assert(
      originalBalance,
      "Pilot offer has no mutable fresh inventory balance",
    );
    const changedPrice = (
      BigInt(originalPrice.amountMinor.toString()) + 137n
    ).toString();
    const changedStock = originalBalance.quantityAvailable.minus(1).toString();
    try {
      await Promise.all([
        prisma.offerPrice.update({
          where: { id: originalPrice.id },
          data: { amountMinor: changedPrice },
        }),
        prisma.inventoryBalance.update({
          where: { id: originalBalance.id },
          data: { quantityAvailable: changedStock, version: { increment: 1 } },
        }),
      ]);
      const changedValidation = await post(`/carts/${cart.id}/validate`);
      assertSchema(
        coreSchemas.cartValidationResponseSchema,
        changedValidation,
        "Changed cart validation",
      );
      const changedLine = changedValidation.items.find(
        (item) => item.cartItemId === cartItem.id,
      );
      assert(
        changedLine?.changes.includes("PRICE"),
        "Cart validation did not detect the changed price",
      );
      assert(
        changedLine?.changes.includes("STOCK"),
        "Cart validation did not detect the changed stock",
      );
      assert(
        changedLine.previous.unitPriceMinor !==
          changedLine.current?.unitPriceMinor,
        "Old and new prices are identical",
      );
      assert(
        changedLine.previous.availableQuantity !==
          changedLine.current?.availableQuantity,
        "Old and new stock values are identical",
      );

      const staleCheckoutResponse = await fetch(
        `${apiBase}/carts/${cart.id}/checkout`,
        {
          method: "POST",
          headers: identityHeaders,
          body: JSON.stringify({ idempotencyKey: `stale-cart-${Date.now()}` }),
        },
      );
      const staleCheckout = await staleCheckoutResponse.json();
      assert(
        staleCheckoutResponse.status === 409,
        "Checkout did not reject an unaccepted price change",
      );
      assert(
        staleCheckout.code === "CART_REVALIDATION_REQUIRED",
        "Checkout returned the wrong stale-cart error code",
      );

      await post(`/carts/${cart.id}/reprice`);
      const acceptedValidation = await post(`/carts/${cart.id}/validate`);
      assertSchema(
        coreSchemas.cartValidationResponseSchema,
        acceptedValidation,
        "Accepted cart validation",
      );
      assert(
        !acceptedValidation.requiresAcceptance,
        "Reprice did not accept the latest price",
      );
    } finally {
      await Promise.all([
        prisma.offerPrice.update({
          where: { id: originalPrice.id },
          data: { amountMinor: originalPrice.amountMinor },
        }),
        prisma.inventoryBalance.update({
          where: { id: originalBalance.id },
          data: {
            quantityAvailable: originalBalance.quantityAvailable,
            version: { increment: 1 },
          },
        }),
      ]);
    }
    const repricedCart = await post(`/carts/${cart.id}/reprice`);
    assertSchema(
      coreSchemas.cartResponseSchema,
      repricedCart,
      "POST /carts/:id/reprice",
    );
    const carts = await request(`/buyers/${buyer.id}/carts`, {
      headers: identityHeaders,
    });
    assertSchema(
      coreSchemas.cartListResponseSchema,
      carts,
      "GET /buyers/:id/carts",
    );

    const idempotencyKey = `pilot-backend-${Date.now()}`;
    const checkout = await post(`/carts/${cart.id}/checkout`, {
      idempotencyKey,
    });
    assertSchema(
      coreSchemas.checkoutResponseSchema,
      checkout,
      "POST /carts/:id/checkout",
    );
    assert(
      checkout?.status === "COMPLETED",
      `Checkout status is ${checkout?.status ?? "missing"}`,
    );
    assert(
      checkout.supplierOrders?.length === 1,
      "Checkout did not create exactly one supplier order",
    );
    const repeated = await post(`/carts/${cart.id}/checkout`, {
      idempotencyKey,
    });
    assertSchema(
      coreSchemas.checkoutResponseSchema,
      repeated,
      "Repeated checkout response",
    );
    assert(
      repeated.id === checkout.id,
      "Checkout idempotency returned another checkout",
    );
    const fetchedCheckout = await request(`/checkouts/${checkout.id}`, {
      headers: identityHeaders,
    });
    assertSchema(
      coreSchemas.checkoutResponseSchema,
      fetchedCheckout,
      "GET /checkouts/:id",
    );

    const buyerOrders = await request(`/buyers/${buyer.id}/orders`, {
      headers: identityHeaders,
    });
    assertSchema(
      coreSchemas.supplierOrderListResponseSchema,
      buyerOrders,
      "GET /buyers/:id/orders",
    );
    assert(
      buyerOrders.some((order) => order.checkoutId === checkout.id),
      "Created checkout is absent from the buyer order history",
    );
    const supplierOrders = await request(
      `/supplier-orders?checkoutId=${checkout.id}`,
      {
        headers: identityHeaders,
      },
    );
    assertSchema(
      coreSchemas.supplierOrderListResponseSchema,
      supplierOrders,
      "GET /supplier-orders",
    );
    assert(
      supplierOrders.length === 1,
      "Checkout-scoped supplier order list is not deterministic",
    );
    const supplierOrder = supplierOrders[0];
    const decisions = supplierOrder.items.map((item) => ({
      itemId: item.id,
      acceptedQuantity: Number(item.quantity),
    }));
    const confirmedOrder = await post(
      `/supplier-orders/${supplierOrder.id}/confirm`,
      { decisions },
    );
    assertSchema(
      coreSchemas.supplierOrderResponseSchema,
      confirmedOrder,
      "POST /supplier-orders/:id/confirm",
    );
    const repeatedConfirmation = await post(
      `/supplier-orders/${supplierOrder.id}/confirm`,
      { decisions },
    );
    assertSchema(
      coreSchemas.supplierOrderResponseSchema,
      repeatedConfirmation,
      "Repeated supplier confirmation",
    );
    assert(
      repeatedConfirmation.id === confirmedOrder.id,
      "Supplier confirmation is not idempotent",
    );
    const persisted = await prisma.checkout.findUnique({
      where: { id: checkout.id },
      include: {
        supplierOrders: {
          include: { items: { include: { reservation: true } } },
        },
      },
    });
    assert(
      persisted?.status === "COMPLETED",
      "Checkout was not persisted as COMPLETED",
    );
    assert(
      persisted.supplierOrders.every((order) =>
        order.items.every((item) => item.reservation),
      ),
      "A supplier order item has no inventory reservation",
    );

    console.log(
      JSON.stringify(
        {
          ...baseSummary,
          purchase: {
            buyerOrganizationId: buyer.id,
            cartId: cart.id,
            checkoutId: checkout.id,
            supplierOrders: checkout.supplierOrders.length,
            inventoryReservations: persisted.supplierOrders.reduce(
              (sum, order) =>
                sum + order.items.filter((item) => item.reservation).length,
              0,
            ),
            idempotencyVerified: true,
            supplierConfirmationVerified: true,
          },
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  if (logLines.length > 0) {
    console.error("\nLast API log lines:\n" + logLines.join("\n"));
  }
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await stopApi();
  await prisma.$disconnect();
}
