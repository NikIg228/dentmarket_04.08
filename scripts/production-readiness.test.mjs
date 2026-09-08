import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  evaluateHealthProbeConfiguration,
  evaluateProductionConfiguration,
  LIVE_EVIDENCE_APPROVALS,
  LIVE_EVIDENCE_REQUIREMENTS,
  validateLiveEvidence,
} from "./lib/production-readiness.mjs";

const validEnvironment = {
  DEPLOYMENT_PROFILE: "go_live",
  APP_RELEASE: "v2026.09.08-1",
  DATABASE_URL:
    "postgresql://app:strong-pass@db.dentmarket.kz:5432/dentmarket?sslmode=verify-full",
  REDIS_URL: "rediss://app:strong-pass@redis.dentmarket.kz:6379",
  OBJECT_STORAGE_DRIVER: "s3",
  S3_ENDPOINT: "https://objects.dentmarket.kz",
  S3_BUCKET: "dentmarket-production",
  S3_ACCESS_KEY_ID: "production-access-key",
  S3_SECRET_ACCESS_KEY: "s3-prod-7f9c4a2b8d6e1a0f",
  S3_SERVER_SIDE_ENCRYPTION: "AES256",
  PAYMENT_PROVIDER_MODE: "external",
  PAYMENT_GATEWAY_URL: "https://payments.dentmarket.kz/api",
  PAYMENT_GATEWAY_TOKEN: "pay-7f9c4a2b8d6e1a0f",
  PAYMENT_GATEWAY_HEALTHCHECK_URL: "https://payments.dentmarket.kz/health",
  PAYMENT_WEBHOOK_SECRET_EXTERNAL: "p".repeat(48),
  SIGNATURE_GATEWAY_URL: "https://sign.dentmarket.kz/api",
  SIGNATURE_GATEWAY_TOKEN: "sig-7f9c4a2b8d6e1a0f",
  SIGNATURE_GATEWAY_HEALTHCHECK_URL: "https://sign.dentmarket.kz/health",
  SIGNATURE_CALLBACK_SECRET: "s".repeat(48),
  EMAIL_PROVIDER_URL: "https://mail.dentmarket.kz/send",
  EMAIL_PROVIDER_TOKEN: "mail-7f9c4a2b8d6e1a0f",
  EMAIL_PROVIDER_HEALTHCHECK_URL: "https://mail.dentmarket.kz/health",
  SMS_PROVIDER_URL: "https://sms.dentmarket.kz/send",
  SMS_PROVIDER_TOKEN: "sms-7f9c4a2b8d6e1a0f",
  SMS_PROVIDER_HEALTHCHECK_URL: "https://sms.dentmarket.kz/health",
  NOTIFICATION_WEBHOOK_SECRET: "n".repeat(48),
  SENTRY_DSN: "https://public@sentry.dentmarket.kz/1",
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.dentmarket.kz/v1/traces",
  METRICS_BEARER_TOKEN: "m".repeat(48),
};

function validManifest(now) {
  const startedAt = new Date(now - 60_000).toISOString();
  const endedAt = new Date(now - 1_000).toISOString();
  return {
    schemaVersion: 1,
    environment: "staging",
    revision: "a".repeat(40),
    release: "v2026.09.08-1",
    window: { startedAt, endedAt },
    checks: LIVE_EVIDENCE_REQUIREMENTS.map((id) => ({
      id,
      status: "passed",
      observedAt: endedAt,
      reference: `ci://dentmarket/${id}/run-42`,
      actor: "release-engineer",
    })),
    approvals: LIVE_EVIDENCE_APPROVALS.map((role) => ({
      role,
      approver: `${role}-owner`,
      approvedAt: endedAt,
      reference: `ticket://DENT-${role.length + 100}`,
    })),
  };
}

test("accepts a complete non-placeholder production configuration", () => {
  assert.equal(
    evaluateProductionConfiguration(validEnvironment).configured,
    true,
  );
  assert.equal(
    evaluateHealthProbeConfiguration(validEnvironment).every(
      (probe) => probe.configured,
    ),
    true,
  );
});

test("rejects missing webhook, SMS and encrypted infrastructure transports", () => {
  const result = evaluateProductionConfiguration({
    ...validEnvironment,
    PAYMENT_WEBHOOK_SECRET_EXTERNAL: "",
    SMS_PROVIDER_TOKEN: "",
    DATABASE_URL:
      "postgresql://app:strong-pass@db.dentmarket.kz:5432/dentmarket",
    REDIS_URL: "redis://app:strong-pass@redis.dentmarket.kz:6379",
  });
  assert.equal(result.configured, false);
  assert.match(result.issues.join("\n"), /PAYMENT_WEBHOOK_SECRET_EXTERNAL/);
  assert.match(result.issues.join("\n"), /SMS_PROVIDER_TOKEN/);
  assert.match(result.issues.join("\n"), /DATABASE_URL/);
  assert.match(result.issues.join("\n"), /rediss/);
});

test("rejects example and replace placeholders", () => {
  const result = evaluateProductionConfiguration({
    ...validEnvironment,
    PAYMENT_GATEWAY_URL: "https://psp.example.kz/api",
    EMAIL_PROVIDER_TOKEN: "REPLACE_WITH_TOKEN",
  });
  assert.equal(result.configured, false);
  assert.match(result.issues.join("\n"), /placeholder/);
});

test("rejects a health endpoint that could exfiltrate the provider token", () => {
  const probes = evaluateHealthProbeConfiguration({
    ...validEnvironment,
    PAYMENT_GATEWAY_HEALTHCHECK_URL: "https://attacker.dentmarket.kz/health",
  });
  const payment = probes.find((probe) => probe.id === "psp.gateway");
  assert.equal(payment.configured, false);
  assert.match(payment.issues.join("\n"), /same origin/);
});

test("production connector CLI proves configuration without claiming live", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify-production-connectors.mjs"],
    {
      encoding: "utf8",
      env: { ...process.env, ...validEnvironment },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.configured, true);
  assert.equal(output.reachabilityRequested, false);
  assert.equal(output.liveVerified, false);
  assert.equal(output.liveEvidenceRequired, true);
});

test("production connector CLI fails closed when a provider secret is absent", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify-production-connectors.mjs"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ...validEnvironment,
        PAYMENT_WEBHOOK_SECRET_EXTERNAL: "",
      },
    },
  );
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.configured, false);
  assert.match(JSON.stringify(output.configurationChecks), /PAYMENT_WEBHOOK/);
});

test("accepts complete current-revision evidence", () => {
  const now = Date.now();
  const result = validateLiveEvidence(validManifest(now), {
    revision: "a".repeat(40),
    now,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);
});

test("rejects pending, stale and revision-mismatched evidence", () => {
  const now = Date.now();
  const manifest = validManifest(now - 40 * 24 * 60 * 60 * 1_000);
  manifest.revision = "b".repeat(40);
  manifest.checks[0].status = "pending";
  const result = validateLiveEvidence(manifest, {
    revision: "a".repeat(40),
    now,
    maxAgeDays: 30,
  });
  assert.equal(result.valid, false);
  assert.match(result.issues.join("\n"), /revision/);
  assert.match(result.issues.join("\n"), /older than 30 days/);
  assert.match(result.issues.join("\n"), /status must equal passed/);
});
