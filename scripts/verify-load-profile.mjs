#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(import.meta.dirname, "..");
const apiDirectory = path.join(root, "apps", "api");
const apiEntry = path.join(apiDirectory, "dist", "src", "main.js");
const startedAt = new Date();
const runId =
  `${startedAt.toISOString().replace(/[-:.TZ]/g, "")}_${process.pid}_${randomBytes(3).toString("hex")}`.toLowerCase();
const databaseName = `dentmarket_b46_${runId}`;
const sourceDatabaseUrl =
  process.env.POSTGRES_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const sourceUrl = new URL(sourceDatabaseUrl);
const adminUrl = new URL(process.env.B46_ADMIN_DATABASE_URL ?? sourceUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const targetUrl = new URL(sourceUrl);
targetUrl.pathname = `/${databaseName}`;
targetUrl.search = "";
targetUrl.searchParams.set("schema", "public");
targetUrl.searchParams.set("connection_limit", "30");
targetUrl.searchParams.set("pool_timeout", "20");
targetUrl.searchParams.set("application_name", "dentmarket_b46_api");
const harnessUrl = new URL(targetUrl);
harnessUrl.searchParams.set("application_name", "dentmarket_b46_harness");
const apiPort = Number(process.env.B46_API_PORT ?? 4600 + (process.pid % 300));
const apiBase = `http://127.0.0.1:${apiPort}/api`;
const evidencePath = path.resolve(
  process.env.B46_EVIDENCE_PATH ??
    path.join(root, ".tmp", "b4-6", `${runId}.json`),
);
const keepDatabase = process.env.KEEP_B46_DATABASE === "true";
const config = {
  readRequests: positiveInteger("B46_READ_REQUESTS", 300),
  readConcurrency: positiveInteger("B46_READ_CONCURRENCY", 20),
  writeFlows: positiveInteger("B46_WRITE_FLOWS", 20),
  writeConcurrency: positiveInteger("B46_WRITE_CONCURRENCY", 4),
  soakSeconds: positiveInteger("B46_SOAK_SECONDS", 60),
  soakConcurrency: positiveInteger("B46_SOAK_CONCURRENCY", 10),
};
const thresholds = {
  errorRate: 0,
  readP95Ms: 750,
  compareP95Ms: 1_000,
  writeFlowP95Ms: 5_000,
  soakP95Ms: 1_000,
  explainExecutionMs: 100,
  explainSharedReadBlocks: 1_000,
  maxDatabaseConnections: 30,
};

let api;
let apiSpawnError;
let databaseCreated = false;
let prisma;
let samplerRunning = false;
let maxDatabaseConnections = 0;
const apiLogLines = [];
const measurements = new Map();
const violations = [];
let report = {
  status: "failed",
  runId,
  startedAt: startedAt.toISOString(),
  revision: gitRevision(),
  profile: config,
  thresholds,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function positiveInteger(key, fallback) {
  const value = Number(process.env[key] ?? fallback);
  assert(
    Number.isInteger(value) && value > 0,
    `${key} must be a positive integer`,
  );
  return value;
}

function isLocalHost(hostname) {
  return ["127.0.0.1", "localhost", "::1"].includes(hostname.toLowerCase());
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function gitRevision() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function resolvePsql() {
  const candidates = [];
  if (process.env.POSTGRES_BIN_DIR)
    candidates.push(
      path.join(
        process.env.POSTGRES_BIN_DIR,
        process.platform === "win32" ? "psql.exe" : "psql",
      ),
    );
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    for (const version of ["18", "17", "16", "15", "14"])
      candidates.push(
        path.join(programFiles, "PostgreSQL", version, "bin", "psql.exe"),
      );
  }
  candidates.push(process.platform === "win32" ? "psql.exe" : "psql");
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], {
      windowsHide: true,
      encoding: "utf8",
    });
    if (result.status === 0) return candidate;
  }
  throw new Error(
    "psql is unavailable; install PostgreSQL client or set POSTGRES_BIN_DIR",
  );
}

const psqlCommand = resolvePsql();

function psql(url, sql) {
  const result = spawnSync(
    psqlCommand,
    [
      url.toString(),
      "-X",
      "--set",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--command",
      sql,
    ],
    {
      cwd: root,
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  assert(
    result.status === 0,
    `psql failed with exit code ${result.status}: ${result.stderr}`,
  );
  return result.stdout.trim();
}

function runNpm(args, env) {
  const windows = process.platform === "win32";
  const result = spawnSync(
    windows ? (process.env.ComSpec ?? "cmd.exe") : "npm",
    windows ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args,
    {
      cwd: root,
      env,
      windowsHide: true,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  assert(
    result.status === 0,
    `npm ${args.join(" ")} failed with exit code ${result.status}`,
  );
}

function rememberApiLog(chunk) {
  apiLogLines.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  if (apiLogLines.length > 100) apiLogLines.splice(0, apiLogLines.length - 100);
}

async function waitForReadiness(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = "not attempted";
  while (Date.now() < deadline) {
    if (apiSpawnError) throw apiSpawnError;
    if (api.exitCode !== null)
      throw new Error(
        `API exited with code ${api.exitCode}:\n${apiLogLines.join("\n")}`,
      );
    try {
      const response = await fetch(`${apiBase}/health/ready`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok && (await response.json())?.status === "ready") return;
      lastProbe = `HTTP ${response.status}`;
    } catch (error) {
      lastProbe = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `API readiness timed out (last probe: ${lastProbe}):\n${apiLogLines.join("\n")}`,
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

function metric(name) {
  if (!measurements.has(name))
    measurements.set(name, { latencies: [], failures: 0, requests: 0 });
  return measurements.get(name);
}

async function measured(name, action) {
  const target = metric(name);
  const before = performance.now();
  target.requests += 1;
  try {
    return await action();
  } catch (error) {
    target.failures += 1;
    throw error;
  } finally {
    target.latencies.push(performance.now() - before);
  }
}

async function request(
  name,
  route,
  { method = "GET", identity, body, expected = [200] } = {},
) {
  return measured(name, async () => {
    const response = await fetch(`${apiBase}${route}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(identity
          ? {
              "x-user-id": identity.userId,
              "x-organization-id": identity.organizationId,
            }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    const payload = text
      ? (() => {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        })()
      : null;
    if (!expected.includes(response.status))
      throw new Error(
        `${method} ${route} returned ${response.status}: ${typeof payload === "string" ? payload.slice(0, 500) : JSON.stringify(payload).slice(0, 500)}`,
      );
    return { status: response.status, body: payload };
  });
}

async function runPool(total, concurrency, task) {
  let next = 0;
  const errors = [];
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= total) return;
      try {
        await task(index);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(total, concurrency) }, worker),
  );
  return errors;
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}

function summarizeMetrics() {
  return Object.fromEntries(
    [...measurements.entries()].map(([name, value]) => {
      const durationMs = value.latencies.reduce(
        (sum, latency) => sum + latency,
        0,
      );
      return [
        name,
        {
          requests: value.requests,
          failures: value.failures,
          errorRate: value.requests ? value.failures / value.requests : 0,
          p50Ms: Math.round(percentile(value.latencies, 0.5)),
          p95Ms: Math.round(percentile(value.latencies, 0.95)),
          p99Ms: Math.round(percentile(value.latencies, 0.99)),
          maxMs: Math.round(Math.max(0, ...value.latencies)),
          meanMs: value.latencies.length
            ? Math.round(durationMs / value.latencies.length)
            : 0,
        },
      ];
    }),
  );
}

function recordThreshold(condition, message) {
  if (!condition) violations.push(message);
}

async function sampleDatabaseConnections() {
  while (samplerRunning) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = ${sqlLiteral(databaseName)} AND application_name = 'dentmarket_b46_api'`,
      );
      maxDatabaseConnections = Math.max(
        maxDatabaseConnections,
        Number(rows[0]?.count ?? 0),
      );
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function flattenPlan(node, result = []) {
  result.push({
    nodeType: node["Node Type"],
    relation: node["Relation Name"] ?? null,
    index: node["Index Name"] ?? null,
    actualRows: node["Actual Rows"] ?? null,
    actualLoops: node["Actual Loops"] ?? null,
    sharedHitBlocks: node["Shared Hit Blocks"] ?? 0,
    sharedReadBlocks: node["Shared Read Blocks"] ?? 0,
  });
  for (const child of node.Plans ?? []) flattenPlan(child, result);
  return result;
}

async function explain(label, sql) {
  const rows = await prisma.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
  );
  const document = rows[0]?.["QUERY PLAN"]?.[0];
  assert(document?.Plan, `${label} EXPLAIN did not return a plan`);
  const nodes = flattenPlan(document.Plan);
  return {
    planningTimeMs: document["Planning Time"],
    executionTimeMs: document["Execution Time"],
    sharedHitBlocks: nodes.reduce(
      (sum, node) => sum + Number(node.sharedHitBlocks),
      0,
    ),
    sharedReadBlocks: nodes.reduce(
      (sum, node) => sum + Number(node.sharedReadBlocks),
      0,
    ),
    nodes,
  };
}

try {
  assert(
    ["postgres:", "postgresql:"].includes(sourceUrl.protocol),
    "DATABASE_URL must use PostgreSQL",
  );
  assert(
    ["postgres:", "postgresql:"].includes(adminUrl.protocol),
    "B46_ADMIN_DATABASE_URL must use PostgreSQL",
  );
  assert(
    isLocalHost(sourceUrl.hostname) || process.env.B46_ALLOW_REMOTE === "true",
    "B4.6 creates and drops a database; remote execution requires B46_ALLOW_REMOTE=true",
  );
  assert(
    adminUrl.hostname === sourceUrl.hostname &&
      (adminUrl.port || "5432") === (sourceUrl.port || "5432"),
    "B46_ADMIN_DATABASE_URL must target the same PostgreSQL server as DATABASE_URL",
  );
  assert(
    sourceUrl.username,
    "DATABASE_URL must include the application database role",
  );
  assert(
    /^dentmarket_b46_[a-z0-9_]+$/.test(databaseName),
    "Generated B4.6 database name is unsafe",
  );
  assert(
    sourceUrl.pathname.replace(/^\//, "") !== databaseName,
    "B4.6 target must differ from the source database",
  );

  psql(
    adminUrl,
    `CREATE DATABASE ${quoteIdentifier(databaseName)} OWNER ${quoteIdentifier(sourceUrl.username)} TEMPLATE template0`,
  );
  databaseCreated = true;
  const testEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    DEPLOYMENT_PROFILE: "pilot",
    PROCESS_ROLE: "api",
    DATABASE_URL: targetUrl.toString(),
    AUTH_MODE: "development",
    BACKGROUND_QUEUE_ENABLED: "false",
    OBJECT_STORAGE_DRIVER: "local",
    AV_SCAN_MODE: "disabled",
    RATE_LIMIT_REQUESTS: "100000",
    RATE_LIMIT_TTL_MS: "60000",
    LOG_LEVEL: "warn",
    OTEL_EXPORTER_OTLP_ENDPOINT: "",
    SENTRY_DSN: "",
  };
  runNpm(
    [
      "exec",
      "--workspace=@marketplace/api",
      "--",
      "prisma",
      "migrate",
      "deploy",
    ],
    testEnvironment,
  );
  runNpm(["run", "db:seed:operator"], testEnvironment);
  runNpm(["run", "catalog:sync-production:apply"], testEnvironment);
  runNpm(["run", "db:seed:pilot"], testEnvironment);
  prisma = new PrismaClient({ datasourceUrl: harnessUrl.toString() });
  await prisma.$connect();

  const [operatorMembership, buyers, suppliers, postgresVersion] =
    await Promise.all([
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
      prisma.organization.findMany({
        where: {
          capabilities: { some: { capability: "BUYER" } },
          bin: { startsWith: "9700000000" },
        },
        select: { id: true },
        orderBy: { bin: "asc" },
      }),
      prisma.organization.count({
        where: {
          capabilities: { some: { capability: "SUPPLIER" } },
          bin: { startsWith: "9800000000" },
        },
      }),
      prisma.$queryRawUnsafe("SELECT version() AS version"),
    ]);
  assert(operatorMembership, "Marketplace operator identity is missing");
  assert(
    buyers.length === 10,
    `Expected 10 pilot buyers, received ${buyers.length}`,
  );
  assert(
    suppliers === 10,
    `Expected 10 pilot suppliers, received ${suppliers}`,
  );

  api = spawn(process.execPath, [apiEntry], {
    cwd: apiDirectory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...testEnvironment,
      API_HOST: "127.0.0.1",
      API_PORT: String(apiPort),
      PUBLIC_CATALOG_ORGANIZATION_ID: buyers[0].id,
    },
  });
  api.stdout.on("data", rememberApiLog);
  api.stderr.on("data", rememberApiLog);
  api.once("error", (error) => {
    apiSpawnError = error;
    rememberApiLog(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
  });
  await waitForReadiness();

  const identity = operatorMembership;
  const initial = await request(
    "setup.search",
    `/marketplace/search?buyerOrganizationId=${buyers[0].id}&inStock=true&limit=100&sort=PRICE_ASC`,
    { identity },
  );
  const products = initial.body?.items ?? [];
  const offers = products.flatMap((product) => product.offers ?? []);
  const availableOffers = offers.filter((offer) => offer.available === true);
  assert(
    initial.body?.total === 50,
    `Expected 50 products, received ${initial.body?.total}`,
  );
  assert(
    offers.length === 500,
    `Expected 500 offers, received ${offers.length}`,
  );
  assert(
    availableOffers.length === 400,
    `Expected 400 available offers, received ${availableOffers.length}`,
  );

  for (let index = 0; index < 20; index += 1) {
    const buyer = buyers[index % buyers.length];
    if (index % 2 === 0)
      await request(
        "warmup.search",
        `/marketplace/search?buyerOrganizationId=${buyer.id}&inStock=true&limit=24&sort=PRICE_ASC`,
        { identity },
      );
    else
      await request(
        "warmup.compare",
        `/marketplace/products/${products[index % products.length].id}/compare?buyerOrganizationId=${buyer.id}&quantity=1`,
        { identity },
      );
  }

  samplerRunning = true;
  const sampler = sampleDatabaseConnections();
  const readErrors = await runPool(
    config.readRequests,
    config.readConcurrency,
    async (index) => {
      const buyer = buyers[index % buyers.length];
      if (index % 3 === 0) {
        const product = products[index % products.length];
        await request(
          "read.compare",
          `/marketplace/products/${product.id}/compare?buyerOrganizationId=${buyer.id}&quantity=1`,
          { identity },
        );
      } else {
        const queries = ["", "перчатки", "композит", "бор"];
        const query = encodeURIComponent(queries[index % queries.length]);
        await request(
          "read.search",
          `/marketplace/search?buyerOrganizationId=${buyer.id}&inStock=true&limit=24&offset=${(index % 2) * 24}&sort=PRICE_ASC&q=${query}`,
          { identity },
        );
      }
    },
  );
  assert(
    readErrors.length === 0,
    `Read profile failed: ${readErrors.slice(0, 5).join("; ")}`,
  );

  const writeErrors = await runPool(
    config.writeFlows,
    config.writeConcurrency,
    async (index) =>
      measured("write.flow", async () => {
        const buyer = buyers[index % buyers.length];
        const offer =
          availableOffers[index % Math.min(availableOffers.length, 200)];
        const cart = (
          await request("write.cart.create", `/buyers/${buyer.id}/carts`, {
            method: "POST",
            identity,
            body: { currency: "KZT" },
            expected: [201],
          })
        ).body;
        await request("write.cart.add", `/carts/${cart.id}/items`, {
          method: "POST",
          identity,
          body: { offerId: offer.id, quantity: 1 },
          expected: [201],
        });
        const validation = (
          await request("write.cart.validate", `/carts/${cart.id}/validate`, {
            method: "POST",
            identity,
            expected: [200],
          })
        ).body;
        assert(validation.canCheckout, `Cart ${cart.id} failed validation`);
        await request("write.cart.reprice", `/carts/${cart.id}/reprice`, {
          method: "POST",
          identity,
          expected: [201],
        });
        const idempotencyKey = `b46-${runId}-${index}`;
        const repeated = await Promise.all([
          request("write.checkout", `/carts/${cart.id}/checkout`, {
            method: "POST",
            identity,
            body: { idempotencyKey },
            expected: [201],
          }),
          request("write.checkout", `/carts/${cart.id}/checkout`, {
            method: "POST",
            identity,
            body: { idempotencyKey },
            expected: [201],
          }),
        ]);
        assert(
          repeated[0].body.id === repeated[1].body.id,
          `Checkout idempotency diverged for cart ${cart.id}`,
        );
      }),
  );
  assert(
    writeErrors.length === 0,
    `Write profile failed: ${writeErrors.slice(0, 5).join("; ")}`,
  );

  const scarceOffer = offers[Math.min(offers.length - 1, 499)];
  const scarceBalance = await prisma.inventoryBalance.findFirst({
    where: { offerId: scarceOffer.id, freshnessStatus: "FRESH" },
    include: {
      lots: {
        where: { status: "ACTIVE" },
        orderBy: { expirationDate: { sort: "asc", nulls: "last" } },
      },
    },
  });
  assert(scarceBalance, "Scarce-stock profile could not find a fresh balance");
  await prisma.inventoryBalance.update({
    where: { id: scarceBalance.id },
    data: {
      quantityOnHand: 5,
      quantityReserved: 0,
      quantityAvailable: 5,
      safetyStock: 0,
      version: { increment: 1 },
    },
  });
  if (scarceBalance.lots[0])
    await prisma.inventoryLot.update({
      where: { id: scarceBalance.lots[0].id },
      data: {
        quantityOnHand: 5,
        quantityReserved: 0,
        quantityAvailable: 5,
        version: { increment: 1 },
      },
    });
  const scarceCarts = await Promise.all(
    [0, 1].map(async (index) => {
      const buyer = buyers[index];
      const cart = (
        await request("scarce.cart.create", `/buyers/${buyer.id}/carts`, {
          method: "POST",
          identity,
          body: { currency: "KZT" },
          expected: [201],
        })
      ).body;
      await request("scarce.cart.add", `/carts/${cart.id}/items`, {
        method: "POST",
        identity,
        body: { offerId: scarceOffer.id, quantity: 4 },
        expected: [201],
      });
      return { cart, buyer };
    }),
  );
  const scarceResults = await Promise.all(
    scarceCarts.map(({ cart }, index) =>
      request("scarce.checkout", `/carts/${cart.id}/checkout`, {
        method: "POST",
        identity,
        body: { idempotencyKey: `b46-scarce-${runId}-${index}` },
        expected: [201, 409],
      }),
    ),
  );
  const scarceStatuses = scarceResults.map(({ status }) => status).sort();
  assert(
    scarceStatuses.join(",") === "201,409",
    `Scarce-stock statuses were ${scarceStatuses.join(",")}`,
  );
  const scarcePersisted = await prisma.inventoryBalance.findUniqueOrThrow({
    where: { id: scarceBalance.id },
  });
  assert(
    scarcePersisted.quantityAvailable.toString() === "1" &&
      scarcePersisted.quantityReserved.toString() === "4",
    `Scarce balance ended at ${scarcePersisted.quantityAvailable}/${scarcePersisted.quantityReserved}`,
  );

  const soakDeadline = Date.now() + config.soakSeconds * 1_000;
  const soakErrors = await runPool(
    config.soakConcurrency,
    config.soakConcurrency,
    async (worker) => {
      let iteration = 0;
      while (Date.now() < soakDeadline) {
        const buyer = buyers[(worker + iteration) % buyers.length];
        const product = products[(worker * 7 + iteration) % products.length];
        if (iteration % 2 === 0)
          await request(
            "soak.search",
            `/marketplace/search?buyerOrganizationId=${buyer.id}&inStock=true&limit=24&sort=PRICE_ASC`,
            { identity },
          );
        else
          await request(
            "soak.compare",
            `/marketplace/products/${product.id}/compare?buyerOrganizationId=${buyer.id}&quantity=1`,
            { identity },
          );
        iteration += 1;
      }
    },
  );
  assert(
    soakErrors.length === 0,
    `Soak profile failed: ${soakErrors.slice(0, 5).join("; ")}`,
  );
  samplerRunning = false;
  await sampler;

  const explainPlans = {
    catalogPriceSort: await explain(
      "catalog price sort",
      `SELECT d."productId" FROM "ProductSearchDocument" d JOIN "Product" p ON p.id = d."productId" WHERE p.status = 'ACTIVE' AND p."externalMetadata" ->> 'importedAsCanonicalDraft' = 'true' AND d."isAvailable" = true AND EXISTS (SELECT 1 FROM "MarketplaceAgreement" ma WHERE ma.status IN ('ACTIVE', 'NON_RENEWING') AND ma."startsAt" <= NOW() AND ma."endsAt" > NOW() AND ma."supplierOrganizationId" = ANY(d."supplierIds")) ORDER BY d."minNormalizedPriceMinor" ASC NULLS LAST, d."isAvailable" DESC LIMIT 24`,
    ),
    inventoryReservationCandidate: await explain(
      "inventory candidate",
      `SELECT ib.id FROM "InventoryBalance" ib WHERE ib."offerId" = ${sqlLiteral(offers[0].id)}::uuid AND ib."freshnessStatus" = 'FRESH' AND ib."quantityAvailable" >= 1 ORDER BY ib."quantityAvailable" DESC, ib."warehouseId" ASC LIMIT 1`,
    ),
  };

  const metrics = summarizeMetrics();
  for (const [name, value] of Object.entries(metrics))
    recordThreshold(
      value.errorRate <= thresholds.errorRate,
      `${name} error rate ${value.errorRate} exceeds ${thresholds.errorRate}`,
    );
  recordThreshold(
    metrics["read.search"].p95Ms <= thresholds.readP95Ms,
    `read.search p95 ${metrics["read.search"].p95Ms}ms exceeds ${thresholds.readP95Ms}ms`,
  );
  recordThreshold(
    metrics["read.compare"].p95Ms <= thresholds.compareP95Ms,
    `read.compare p95 ${metrics["read.compare"].p95Ms}ms exceeds ${thresholds.compareP95Ms}ms`,
  );
  recordThreshold(
    metrics["write.flow"].p95Ms <= thresholds.writeFlowP95Ms,
    `write.flow p95 ${metrics["write.flow"].p95Ms}ms exceeds ${thresholds.writeFlowP95Ms}ms`,
  );
  recordThreshold(
    Math.max(metrics["soak.search"].p95Ms, metrics["soak.compare"].p95Ms) <=
      thresholds.soakP95Ms,
    `soak p95 exceeds ${thresholds.soakP95Ms}ms`,
  );
  recordThreshold(
    maxDatabaseConnections <= thresholds.maxDatabaseConnections,
    `database connections ${maxDatabaseConnections} exceed ${thresholds.maxDatabaseConnections}`,
  );
  for (const [name, plan] of Object.entries(explainPlans)) {
    recordThreshold(
      plan.executionTimeMs <= thresholds.explainExecutionMs,
      `${name} EXPLAIN execution ${plan.executionTimeMs}ms exceeds ${thresholds.explainExecutionMs}ms`,
    );
    recordThreshold(
      plan.sharedReadBlocks <= thresholds.explainSharedReadBlocks,
      `${name} shared read blocks ${plan.sharedReadBlocks} exceed ${thresholds.explainSharedReadBlocks}`,
    );
  }

  report = {
    status: violations.length ? "failed" : "passed",
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    revision: gitRevision(),
    environment: {
      platform: process.platform,
      osRelease: os.release(),
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
      postgres: postgresVersion[0]?.version ?? "unknown",
      apiInstances: 1,
      redis: "not-used-in-local-db-profile",
    },
    dataset: {
      buyers: buyers.length,
      suppliers,
      products: initial.body.total,
      offers: offers.length,
      availableOffers: availableOffers.length,
    },
    profile: config,
    thresholds,
    metrics,
    saturation: { maxDatabaseConnections },
    concurrency: {
      idempotentCheckoutFlows: config.writeFlows,
      scarceStockStatuses: scarceStatuses,
      scarceFinalAvailable: scarcePersisted.quantityAvailable.toString(),
      scarceFinalReserved: scarcePersisted.quantityReserved.toString(),
    },
    explainPlans,
    violations,
    limitations: [
      "Local DB/API profile uses one API process; multi-instance Redis rate-limit/queue evidence is a separate required gate.",
      "The 60-second local soak detects immediate leaks/regressions but does not replace a staging endurance run.",
      "There is no separate buyer product-detail backend operation; the read path measures authenticated search and compare, which returns product/offer detail.",
    ],
  };
  if (violations.length)
    throw new Error(`B4.6 thresholds failed: ${violations.join("; ")}`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report = {
    ...report,
    status: "failed",
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    apiLogTail: apiLogLines.slice(-30),
  };
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  samplerRunning = false;
  await stopApi();
  if (prisma) await prisma.$disconnect().catch(() => undefined);
  if (databaseCreated && !keepDatabase) {
    try {
      assert(
        /^dentmarket_b46_[a-z0-9_]+$/.test(databaseName),
        "Unsafe B4.6 cleanup target",
      );
      psql(
        adminUrl,
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${sqlLiteral(databaseName)} AND pid <> pg_backend_pid()`,
      );
      psql(adminUrl, `DROP DATABASE ${quoteIdentifier(databaseName)}`);
      databaseCreated = false;
    } catch (error) {
      report.cleanupError =
        error instanceof Error ? error.message : String(error);
      process.exitCode = 1;
    }
  }
  report.cleanup = {
    temporaryDatabaseRemoved: !databaseCreated,
    keptByRequest: keepDatabase,
  };
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(`B4.6 evidence: ${evidencePath}`);
}
