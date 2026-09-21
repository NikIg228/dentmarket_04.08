import assert from "node:assert/strict";
import test from "node:test";
import { assertApiReadiness, assertCiEnvironment, waitForSentNotifications, workerReadiness } from "./lib/ci-verification.mjs";

const env = {
  GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted",
  DATABASE_URL: "postgresql://marketplace:marketplace@localhost:5432/marketplace?schema=public",
  REDIS_URL: "redis://localhost:6379", API_URL: "http://127.0.0.1:4012/api", API_PORT: "4012",
  NODE_ENV: "test", DEPLOYMENT_PROFILE: "go_live", PAYMENT_PROVIDER_MODE: "mock",
  OBJECT_STORAGE_DRIVER: "local", BACKGROUND_QUEUE_ENABLED: "true",
};
const api = {
  role: "api", status: "ready", requiredChecks: ["database", "storage", "queue"],
  capabilities: { http: true, schedules: false, queueProducer: true, queueConsumer: false },
  checks: { database: { status: "ok" }, storage: { status: "ok" }, queue: { status: "ok", producer: "ready" } },
};
const worker = {
  event: "runtime.ready", role: "worker", requiredChecks: ["database", "storage", "queue"],
  capabilities: { http: false, schedules: true, queueProducer: true, queueConsumer: true },
};

test("CI preflight rejects non-isolated targets and external providers", () => {
  assertCiEnvironment(env);
  for (const delta of [
    { GITHUB_ACTIONS: "false" }, { RUNNER_ENVIRONMENT: "self-hosted" },
    { DATABASE_URL: env.DATABASE_URL.replace("schema=public", "schema=other") },
    { REDIS_URL: "redis://example.invalid:6379" }, { API_URL: "https://example.invalid/api" },
    { NODE_ENV: "production" }, { BACKGROUND_QUEUE_ENABLED: "false" },
    { PAYMENT_PROVIDER_MODE: "external" }, { EMAIL_PROVIDER_URL: "https://example.invalid" },
  ]) assert.throws(() => assertCiEnvironment({ ...env, ...delta }));
});

test("API requires dependency readiness, not health or process startup", () => {
  assertApiReadiness(api);
  assert.throws(() => assertApiReadiness({ ...api, status: "ok" }));
  assert.throws(() => assertApiReadiness({ ...api, checks: { ...api.checks, queue: { status: "down" } } }));
  assert.throws(() => assertApiReadiness({ ...api, requiredChecks: ["database", "storage"] }));
  assert.throws(() => assertApiReadiness({ ...api, role: "all" }));
});

test("worker requires its real readiness event and consumer capability", () => {
  assert.equal(workerReadiness('process started\n{"message":"BullMQ producer connected"}'), false);
  assert.equal(workerReadiness(JSON.stringify(worker)), true);
  assert.throws(() => workerReadiness(JSON.stringify({ ...worker, capabilities: { ...worker.capabilities, queueConsumer: false } })));
  assert.throws(() => workerReadiness(JSON.stringify({ ...worker, requiredChecks: ["database"] })));
});

function clock() {
  let time = 0;
  return { timeoutMs: 30, intervalMs: 10, now: () => time, pause: async ms => { time += ms; } };
}

test("delivery waits through empty and partially sent projections", async () => {
  const sent = [{ status: "SENT" }, { status: "SENT" }];
  const snapshots = [[], [{ status: "SENT" }, { status: "PENDING" }], sent];
  let reads = 0;
  assert.deepEqual(await waitForSentNotifications(async () => snapshots[reads++], clock()), sent);
  assert.equal(reads, 3);
});

test("empty and failed delivery exhaust a finite budget without claiming success", async () => {
  for (const snapshot of [[], [{ status: "FAILED" }]]) {
    let reads = 0;
    const result = await waitForSentNotifications(async () => { reads += 1; return snapshot; }, clock());
    assert(result.length === 0 || result.some(({ status }) => status !== "SENT"));
    assert.equal(reads, 3);
  }
});

test("HTTP errors abort polling immediately instead of being hidden as eventual delivery", async () => {
  let reads = 0;
  await assert.rejects(waitForSentNotifications(async () => { reads += 1; throw new Error("GET failed (403)"); }, clock()), /403/);
  assert.equal(reads, 1);
});
