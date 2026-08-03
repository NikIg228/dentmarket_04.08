import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "../apps/api/node_modules/@prisma/client/index.js";

const root = path.resolve(import.meta.dirname, "..");
const apiEntry = path.join(root, "apps", "api", "dist", "src", "main.js");
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const databaseHost = new URL(databaseUrl).hostname;
const port = Number(process.env.PILOT_VERIFY_API_PORT ?? 4112);
const apiBase = `http://127.0.0.1:${port}/api`;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const logLines = [];
let api;

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    throw new Error("Built API entry is missing. Run `pnpm --filter @marketplace/api build` first.");
  }

  await prisma.$queryRaw`SELECT 1`;
  const [operatorMembership, buyer] = await Promise.all([
    prisma.organizationMembership.findFirst({
      where: {
        status: "ACTIVE",
        organization: { capabilities: { some: { capability: "MARKETPLACE_OPERATOR" } } },
      },
      select: { userId: true, organizationId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organization.findUnique({
      where: { bin: "970000000001" },
      select: { id: true, displayName: true },
    }),
  ]);
  assert(operatorMembership, "Active marketplace operator membership is missing");
  assert(buyer, "Pilot buyer 970000000001 is missing; run `pnpm db:prepare-pilot`");

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
  assert(readiness?.checks?.database?.status === "ok", "Readiness did not confirm the database");

  const openApiResponse = await fetch(`http://127.0.0.1:${port}/docs-json`);
  assert(openApiResponse.ok, `OpenAPI document failed (${openApiResponse.status})`);
  const openApi = await openApiResponse.json();
  const operations = Object.values(openApi.paths ?? {}).flatMap((pathItem) =>
    Object.entries(pathItem).filter(([method]) =>
      ["get", "post", "put", "patch", "delete", "options", "head"].includes(method),
    ),
  );
  const operationsWithRequestBody = operations.filter(([, operation]) => operation.requestBody).length;
  const operationsWithSuccessSchema = operations.filter(([, operation]) =>
    Object.entries(operation.responses ?? {}).some(
      ([status, response]) => /^2\d\d$/.test(status) && response?.content?.["application/json"]?.schema,
    ),
  ).length;
  const componentSchemas = Object.keys(openApi.components?.schemas ?? {}).length;
  assert(operations.length > 0, "OpenAPI document contains no operations");

  const search = await request("/catalog/search?inStock=true&limit=100&sort=PRICE_ASC");
  assert(search?.total === 50, `Expected 50 buyable pilot products, received ${search?.total}`);
  const offerCount = search.items.reduce((sum, item) => sum + item.offers.length, 0);
  assert(offerCount === 500, `Expected 500 visible pilot offers, received ${offerCount}`);

  const product = search.items.find((item) => item.offers.length === 10);
  assert(product, "No pilot product with ten comparable supplier offers was found");
  const comparison = await request(
    `/catalog/products/${product.id}/compare?quantity=1`,
  );
  assert(comparison.offers.length === 10, `Expected 10 compared offers, received ${comparison.offers.length}`);
  const prices = comparison.offers.map((offer) => Number(offer.price.normalizedPriceMinor));
  assert(
    prices.every((price, index) => index === 0 || price >= prices[index - 1]),
    "Compared offers are not sorted by normalized price",
  );

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

  const cart = await post(`/buyers/${buyer.id}/carts`, { currency: "KZT" });
  const selectedOffer = product.offers[0];
  const cartItem = await post(`/carts/${cart.id}/items`, {
    offerId: selectedOffer.id,
    quantity: 1,
  });
  assert(cartItem?.id, "Cart item was not created");

  const idempotencyKey = `pilot-backend-${Date.now()}`;
  const checkout = await post(`/carts/${cart.id}/checkout`, { idempotencyKey });
  assert(checkout?.status === "COMPLETED", `Checkout status is ${checkout?.status ?? "missing"}`);
  assert(checkout.supplierOrders?.length === 1, "Checkout did not create exactly one supplier order");
  const repeated = await post(`/carts/${cart.id}/checkout`, { idempotencyKey });
  assert(repeated.id === checkout.id, "Checkout idempotency returned another checkout");

  const buyerOrders = await request(`/buyers/${buyer.id}/orders`, { headers: identityHeaders });
  assert(
    buyerOrders.some((order) => order.checkoutId === checkout.id),
    "Created checkout is absent from the buyer order history",
  );
  const persisted = await prisma.checkout.findUnique({
    where: { id: checkout.id },
    include: { supplierOrders: { include: { items: { include: { reservation: true } } } } },
  });
  assert(persisted?.status === "COMPLETED", "Checkout was not persisted as COMPLETED");
  assert(
    persisted.supplierOrders.every((order) => order.items.every((item) => item.reservation)),
    "A supplier order item has no inventory reservation",
  );

  console.log(
    JSON.stringify(
      {
        status: "passed",
        health: health.status,
        readiness: readiness.status,
        apiContract: {
          operations: operations.length,
          operationsWithRequestBody,
          operationsWithSuccessSchema,
          componentSchemas,
        },
        catalog: { buyableProducts: search.total, visibleOffers: offerCount },
        comparison: { productId: product.id, offers: comparison.offers.length },
        purchase: {
          buyerOrganizationId: buyer.id,
          cartId: cart.id,
          checkoutId: checkout.id,
          supplierOrders: checkout.supplierOrders.length,
          inventoryReservations: persisted.supplierOrders.reduce(
            (sum, order) => sum + order.items.filter((item) => item.reservation).length,
            0,
          ),
          idempotencyVerified: true,
        },
      },
      null,
      2,
    ),
  );
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
