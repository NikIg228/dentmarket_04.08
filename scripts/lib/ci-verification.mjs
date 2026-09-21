import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

export function assertCiEnvironment(env) {
  assert(env.GITHUB_ACTIONS === "true" && env.RUNNER_ENVIRONMENT === "github-hosted", "Requires the disposable GitHub-hosted CI environment");
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { throw new Error("Invalid CI database target"); }
  assert(database.protocol === "postgresql:" && database.hostname === "localhost" && database.port === "5432" && database.pathname === "/marketplace" && database.username === "marketplace" && database.search === "?schema=public", "Unexpected CI database target");
  assert(env.REDIS_URL === "redis://localhost:6379", "Unexpected CI queue target");
  assert(env.API_URL === "http://127.0.0.1:4012/api" && env.API_PORT === "4012", "Unexpected CI API target");
  assert(env.NODE_ENV === "test" && env.DEPLOYMENT_PROFILE === "go_live" && env.PAYMENT_PROVIDER_MODE === "mock" && env.OBJECT_STORAGE_DRIVER === "local" && env.BACKGROUND_QUEUE_ENABLED === "true", "CI requires the standard test adapters and enabled queue");
  for (const key of ["EMAIL_PROVIDER_URL", "SMS_PROVIDER_URL", "SIGNATURE_GATEWAY_URL", "PAYMENT_GATEWAY_URL", "OPENAI_API_KEY", "OTEL_EXPORTER_OTLP_ENDPOINT", "SENTRY_DSN"]) {
    assert(!env[key], `External provider configuration is not allowed: ${key}`);
  }
}

function assertCapabilities(snapshot, role) {
  assert.equal(snapshot.role, role, "Unexpected runtime role");
  assert.deepEqual(snapshot.capabilities, { http: role === "api", schedules: role === "worker", queueProducer: true, queueConsumer: role === "worker" });
  for (const check of ["database", "storage", "queue"]) assert(snapshot.requiredChecks.includes(check), `Missing readiness check: ${check}`);
}

export function assertApiReadiness(snapshot) {
  assertCapabilities(snapshot, "api");
  assert.equal(snapshot.status, "ready");
  for (const check of snapshot.requiredChecks) assert.equal(snapshot.checks[check]?.status, "ok", `Dependency is not ready: ${check}`);
  assert.equal(snapshot.checks.queue.producer, "ready");
}

export function workerReadiness(log) {
  for (const line of log.split(/\r?\n/)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.event !== "runtime.ready") continue;
    // The standard worker emits this event only after a successful dependency snapshot.
    assertCapabilities(entry, "worker");
    return true;
  }
  return false;
}

export async function waitForSentNotifications(read, { timeoutMs = 60_000, intervalMs = 1_000, now = Date.now, pause = sleep } = {}) {
  const deadline = now() + timeoutMs;
  let relevant = [];
  while (now() < deadline) {
    relevant = await read(deadline - now());
    if (relevant.length > 0 && relevant.every(({ status }) => status === "SENT")) return relevant;
    if (now() < deadline) await pause(Math.min(intervalMs, deadline - now()));
  }
  return relevant;
}
