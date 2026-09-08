#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import IORedis from "ioredis";
import { RedisMemoryServer } from "redis-memory-server";

const root = path.resolve(import.meta.dirname, "..");
const apiDirectory = path.join(root, "apps", "api");
const apiEntry = path.join(apiDirectory, "dist", "src", "main.js");
const startedAt = new Date();
const runId =
  `${startedAt.toISOString().replace(/[-:.TZ]/g, "")}_${process.pid}_${randomBytes(3).toString("hex")}`.toLowerCase();
const evidencePath = path.resolve(
  process.env.B46_REDIS_EVIDENCE_PATH ??
    path.join(root, ".tmp", "b4-6", `${runId}_multi_instance.json`),
);
const databaseUrl =
  process.env.POSTGRES_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const requestLimit = 12;
const processes = [];
const logs = new Map();
let redisServer;
let redis;
let report = {
  status: "failed",
  runId,
  startedAt: startedAt.toISOString(),
  revision: gitRevision(),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function gitRevision() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function isLocalHost(hostname) {
  return ["127.0.0.1", "localhost", "::1"].includes(hostname.toLowerCase());
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function rememberLog(instance, chunk) {
  const lines = [
    ...(logs.get(instance) ?? []),
    ...String(chunk).split(/\r?\n/).filter(Boolean),
  ];
  logs.set(instance, lines.slice(-50));
}

function startApi(instance, port, redisUrl) {
  const child = spawn(process.execPath, [apiEntry], {
    cwd: apiDirectory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEPLOYMENT_PROFILE: "pilot",
      PROCESS_ROLE: "api",
      DATABASE_URL: databaseUrl,
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      AUTH_MODE: "development",
      REDIS_URL: redisUrl,
      BACKGROUND_QUEUE_ENABLED: "true",
      OBJECT_STORAGE_DRIVER: "local",
      AV_SCAN_MODE: "disabled",
      RATE_LIMIT_REQUESTS: String(requestLimit),
      RATE_LIMIT_TTL_MS: "60000",
      LOG_LEVEL: "warn",
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      SENTRY_DSN: "",
      APP_RELEASE: `b4-6-${runId}-${instance}`,
    },
  });
  child.stdout.on("data", (chunk) => rememberLog(instance, chunk));
  child.stderr.on("data", (chunk) => rememberLog(instance, chunk));
  child.once("error", (error) =>
    rememberLog(instance, error.stack ?? error.message),
  );
  processes.push(child);
  return child;
}

async function waitForReadiness(instance, child, port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = "not attempted";
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(
        `API instance ${instance} exited with ${child.exitCode}: ${(logs.get(instance) ?? []).join("\n")}`,
      );
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/health/ready`,
        {
          signal: AbortSignal.timeout(2_000),
        },
      );
      const body = await response.json();
      if (response.ok && body?.status === "ready") return body;
      lastProbe = `HTTP ${response.status}`;
    } catch (error) {
      lastProbe = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `API instance ${instance} readiness timed out (${lastProbe}): ${(logs.get(instance) ?? []).join("\n")}`,
  );
}

async function stopApi(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

try {
  const parsedDatabaseUrl = new URL(databaseUrl);
  assert(
    ["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol),
    "DATABASE_URL must use PostgreSQL",
  );
  assert(
    isLocalHost(parsedDatabaseUrl.hostname) ||
      process.env.B46_ALLOW_REMOTE === "true",
    "The multi-instance local gate requires local PostgreSQL unless B46_ALLOW_REMOTE=true",
  );

  redisServer = new RedisMemoryServer();
  const redisHost = await redisServer.getHost();
  const redisPort = await redisServer.getPort();
  const redisUrl = `redis://${redisHost}:${redisPort}`;
  redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
  assert(
    (await redis.ping()) === "PONG",
    "Ephemeral Redis did not answer PING",
  );

  const ports = await Promise.all([availablePort(), availablePort()]);
  assert(ports[0] !== ports[1], "API instances must use distinct ports");
  const apis = ports.map((port, index) => startApi(index + 1, port, redisUrl));
  const readiness = await Promise.all(
    apis.map((child, index) =>
      waitForReadiness(index + 1, child, ports[index]),
    ),
  );
  for (const [index, snapshot] of readiness.entries()) {
    assert(
      snapshot.role === "api",
      `Instance ${index + 1} did not start with PROCESS_ROLE=api`,
    );
    assert(
      snapshot.checks?.queue?.status === "ok",
      `Instance ${index + 1} queue health is not ok`,
    );
    assert(
      snapshot.checks?.queue?.configured === true,
      `Instance ${index + 1} did not configure Redis`,
    );
    assert(
      snapshot.checks?.queue?.producer === "ready",
      `Instance ${index + 1} Redis producer is not ready`,
    );
  }

  await redis.flushall();
  const statuses = [];
  for (let index = 0; index < requestLimit; index += 1) {
    const port = ports[index % ports.length];
    const response = await fetch(`http://127.0.0.1:${port}/api/catalog/cities`);
    statuses.push(response.status);
    assert(
      response.status === 200,
      `Request ${index + 1} returned ${response.status} before the shared limit`,
    );
  }
  const blockedPort = ports[requestLimit % ports.length];
  const blocked = await fetch(
    `http://127.0.0.1:${blockedPort}/api/catalog/cities`,
  );
  statuses.push(blocked.status);
  assert(
    blocked.status === 429,
    `Cross-instance request ${requestLimit + 1} returned ${blocked.status}, expected 429`,
  );

  const keys = (await redis.keys("dentmarket:rate-limit:v1:*")).sort();
  assert(keys.length > 0, "Shared rate-limit keys were not written to Redis");
  report = {
    status: "passed",
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    revision: gitRevision(),
    environment: {
      platform: process.platform,
      osRelease: os.release(),
      architecture: process.arch,
      node: process.version,
      redisRuntime:
        process.platform === "win32"
          ? "Memurai via redis-memory-server"
          : "Redis via redis-memory-server",
      apiInstances: 2,
    },
    assertions: {
      bothInstancesReadyWithSharedQueueProducer: true,
      alternatingSuccessfulRequests: requestLimit,
      crossInstanceBlockedRequestStatus: blocked.status,
      redisRateLimitKeyCount: keys.length,
    },
    statuses,
    limitations: [
      "This is an isolated local multi-instance correctness gate, not a managed Redis failover or staging endurance test.",
      "The ephemeral Redis-compatible runtime is a test dependency and must not be used as production infrastructure.",
    ],
  };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report = {
    ...report,
    status: "failed",
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    apiLogTail: Object.fromEntries(logs),
  };
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await Promise.all(processes.map(stopApi));
  if (redis) await redis.quit().catch(() => undefined);
  if (redisServer) await redisServer.stop().catch(() => undefined);
  report.cleanup = {
    apiProcessesStopped: processes.every(
      (child) => child.exitCode !== null || child.killed,
    ),
    redisStopped: !redisServer?.getInstanceInfo()?.running,
  };
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error(`B4.6 multi-instance evidence: ${evidencePath}`);
}
