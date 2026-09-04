import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(import.meta.dirname, "..");
const apiEntry = path.join(root, "apps", "api", "dist", "src", "main.js");
const databaseUrl =
  process.env.POSTGRES_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const port = Number(process.env.OBSERVABILITY_VERIFY_API_PORT ?? 4712);
const baseUrl = `http://127.0.0.1:${port}/api`;
const metricsToken = "observability-integration-token-32-bytes";
const runId = `b41_${Date.now()}_${process.pid}`;
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const fixture = {
  organizationId: undefined,
  sourceId: undefined,
  batchId: undefined,
  outboxId: undefined,
  auditId: undefined,
};
const logLines = [];
let api;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function remember(chunk) {
  logLines.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  if (logLines.length > 80) logLines.splice(0, logLines.length - 80);
}

async function request(route, token) {
  return fetch(`${baseUrl}${route}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function waitUntilReady() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (api.exitCode !== null)
      throw new Error(`API exited before readiness:\n${logLines.join("\n")}`);
    try {
      const response = await request("/health/ready");
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`API readiness timeout:\n${logLines.join("\n")}`);
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

async function cleanup() {
  if (fixture.auditId)
    await prisma.auditLog.deleteMany({ where: { id: fixture.auditId } });
  if (fixture.outboxId)
    await prisma.outboxEvent.deleteMany({ where: { id: fixture.outboxId } });
  if (fixture.batchId)
    await prisma.importBatch.deleteMany({ where: { id: fixture.batchId } });
  if (fixture.sourceId)
    await prisma.supplierDataSource.deleteMany({
      where: { id: fixture.sourceId },
    });
  if (fixture.organizationId)
    await prisma.organization.deleteMany({
      where: { id: fixture.organizationId },
    });
}

try {
  const organization = await prisma.organization.create({
    data: {
      legalName: `B4.1 Observability ${runId}`,
      displayName: `B4.1 Observability ${runId}`,
      bin: String(Date.now()).slice(-12),
      supplierProfile: { create: {} },
    },
  });
  fixture.organizationId = organization.id;
  const source = await prisma.supplierDataSource.create({
    data: {
      supplierOrganizationId: organization.id,
      name: `B4.1 source ${runId}`,
      type: "CSV",
    },
  });
  fixture.sourceId = source.id;
  const batch = await prisma.importBatch.create({
    data: {
      supplierOrganizationId: organization.id,
      sourceId: source.id,
      fileName: `${runId}.csv`,
      fileType: "CSV",
      status: "ROLLING_BACK",
      updatedAt: new Date(Date.now() - 10 * 60_000),
    },
  });
  fixture.batchId = batch.id;
  const outbox = await prisma.outboxEvent.create({
    data: {
      aggregateType: "ObservabilityVerification",
      aggregateId: randomUUID(),
      eventType: runId,
      payload: { verification: "B4.1" },
      status: "DEAD_LETTER",
      attempts: 3,
      lastError: "Synthetic B4.1 verification error",
    },
  });
  fixture.outboxId = outbox.id;
  const audit = await prisma.auditLog.create({
    data: {
      action: "import.batch.rolled_back",
      entityType: "ImportBatch",
      entityId: batch.id,
      after: { verification: "B4.1" },
    },
  });
  fixture.auditId = audit.id;

  api = spawn(process.execPath, [apiEntry], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PROCESS_ROLE: "api",
      DATABASE_URL: databaseUrl,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      AUTH_MODE: "development",
      BACKGROUND_QUEUE_ENABLED: "false",
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      SENTRY_DSN: "",
      METRICS_BEARER_TOKEN: metricsToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout.on("data", remember);
  api.stderr.on("data", remember);
  await waitUntilReady();

  const unauthorized = await request("/metrics");
  assert(
    unauthorized.status === 401,
    `Metrics without token returned ${unauthorized.status}`,
  );
  const response = await request("/metrics", metricsToken);
  assert(
    response.status === 200,
    `Authorized metrics returned ${response.status}`,
  );
  assert(
    response.headers.get("content-type")?.includes("text/plain"),
    "Metrics content type is not Prometheus text",
  );
  const body = await response.text();
  assert(
    body.includes("dentmarket_http_request_duration_seconds_count"),
    "HTTP metric is missing",
  );
  assert(
    body.includes('route="/api/health/ready"'),
    "HTTP route template was not exported",
  );
  assert(
    !body.includes(organization.id),
    "High-cardinality organization id leaked into metrics",
  );
  assert(
    body.includes(
      'dentmarket_outbox_events{status="DEAD_LETTER",service="marketplace-api"}',
    ),
    "Dead-letter gauge is missing",
  );
  assert(
    body.includes(
      `dentmarket_outbox_attempts{event_type="${runId}",service="marketplace-api"} 3`,
    ),
    "Outbox attempts by event type are missing",
  );
  assert(
    body.includes(
      'dentmarket_import_batches{status="ROLLING_BACK",service="marketplace-api"}',
    ),
    "Import rollback gauge is missing",
  );
  const age = body.match(
    /dentmarket_import_rollback_oldest_age_seconds\{service="marketplace-api"\} ([\d.]+)/,
  );
  assert(
    age && Number(age[1]) >= 300,
    "Stuck import rollback age was not exported",
  );
  assert(
    body.includes("dentmarket_import_rollbacks"),
    "Import rollback audit gauge is missing",
  );

  console.log(
    JSON.stringify(
      {
        endpoint: "/api/metrics",
        unauthorized: 401,
        authorized: 200,
        postgresGauges: true,
        outboxEventType: runId,
      },
      null,
      2,
    ),
  );
} finally {
  await stopApi();
  await cleanup();
  await prisma.$disconnect();
}
