import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";

const requiredFiles = [
  ".env.production.example",
  "compose.production.yaml",
  "infra/Caddyfile",
  "scripts/backup.sh",
  "scripts/restore.sh",
  "scripts/backup-production.sh",
  "scripts/restore-production.sh",
  "scripts/verify-backup-restore.mjs",
  "scripts/verify-restore-drill.sh",
  "actual_docs/operations/backup-restore-runbook.md",
  "actual_docs/operations/production-deployment.md",
  "actual_docs/operations/production-auth-runbook.md",
  ".github/workflows/release.yml",
  ".github/workflows/security.yml",
];
for (const file of requiredFiles) {
  let nonEmpty = false;
  try {
    nonEmpty = statSync(file).size > 0;
  } catch {}
  if (!nonEmpty)
    throw new Error(
      `Required production artifact is missing or empty: ${file}`,
    );
}

const valid = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL:
    "postgresql://user:password@db.example.kz:5432/marketplace?sslmode=require",
  REDIS_URL: "rediss://default:password@redis.example.kz:6379",
  AUTH_MODE: "jwt",
  JWT_SECRET: "x".repeat(64),
  JWT_ISSUER: "https://api.example.kz",
  JWT_AUDIENCE: "dentmarket-kz",
  JWT_REQUIRE_MFA: "true",
  TRUST_PROXY: "true",
  CORS_ORIGINS:
    "https://admin.example.kz,https://buyer.example.kz,https://supplier.example.kz,https://example.kz",
  INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 105).toString("base64"),
  APP_SECURITY_ENCRYPTION_KEY: Buffer.alloc(32, 97).toString("base64"),
  OBJECT_STORAGE_DRIVER: "s3",
  S3_ENDPOINT: "https://s3.example.kz",
  S3_BUCKET: "marketplace",
  S3_ACCESS_KEY_ID: "access",
  S3_SECRET_ACCESS_KEY: "s".repeat(32),
  S3_SERVER_SIDE_ENCRYPTION: "AES256",
  MEDIA_SIGNING_SECRET: "s".repeat(48),
  AV_SCAN_MODE: "required",
  SUPABASE_URL: "https://storage.example.kz",
  SUPABASE_SERVICE_ROLE_KEY: "u".repeat(32),
  SIGNATURE_GATEWAY_URL: "https://eds.example.kz",
  SIGNATURE_CALLBACK_SECRET: "e".repeat(48),
  PAYMENT_PROVIDER_MODE: "external",
  PAYMENT_GATEWAY_URL: "https://pay.example.kz",
  PAYMENT_GATEWAY_TOKEN: "p".repeat(32),
  EMAIL_PROVIDER_URL: "https://mail.example.kz/send",
  EMAIL_PROVIDER_TOKEN: "m".repeat(32),
  AUTH_EMAIL_BASE_URL: "https://example.kz",
  SMS_PROVIDER_URL: "https://sms.example.kz/send",
  SMS_PROVIDER_TOKEN: "s".repeat(32),
  NOTIFICATION_WEBHOOK_SECRET: "n".repeat(48),
  SENTRY_DSN: "https://public@sentry.example.kz/1",
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.kz/v1/traces",
  METRICS_BEARER_TOKEN: "t".repeat(48),
  OPENAI_BASE_URL: "https://api.openai.com/v1",
};
const run = (env) =>
  spawnSync(
    process.execPath,
    [
      "-e",
      "require('./apps/api/dist/src/platform/config/environment.js').environment(); console.log('valid')",
    ],
    { env, encoding: "utf8" },
  );
const accepted = run(valid);
if (accepted.status !== 0)
  throw new Error(`Valid production contract rejected: ${accepted.stderr}`);
const insecure = run({ ...valid, CORS_ORIGINS: "http://localhost:3000" });
if (insecure.status === 0)
  throw new Error("Insecure localhost production CORS was accepted");
const mockPayment = run({
  ...valid,
  PAYMENT_PROVIDER_MODE: "mock",
  PAYMENT_GATEWAY_URL: "",
});
if (mockPayment.status === 0)
  throw new Error("Mock payment mode was accepted in production");
const unprotectedMetrics = run({ ...valid, METRICS_BEARER_TOKEN: "" });
if (unprotectedMetrics.status === 0)
  throw new Error("Production accepted an unprotected metrics endpoint");

const secretBearingHttpsUrls = {
  OPENAI_BASE_URL: "http://openai.example.test/v1",
  SUPABASE_URL: "http://storage.example.test",
  S3_ENDPOINT: "http://s3.example.test",
  SIGNATURE_GATEWAY_URL: "http://eds.example.test",
  PAYMENT_GATEWAY_URL: "http://pay.example.test",
  EMAIL_PROVIDER_URL: "http://mail.example.test/send",
  AUTH_EMAIL_BASE_URL: "http://app.example.test",
  SMS_PROVIDER_URL: "http://sms.example.test/send",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel.example.test/v1/traces",
  SENTRY_DSN: "http://public@sentry.example.test/1",
};
const insecureTransportAccepted = [];
for (const [key, insecureUrl] of Object.entries(secretBearingHttpsUrls)) {
  if (run({ ...valid, [key]: insecureUrl }).status === 0)
    insecureTransportAccepted.push(key);
}
if (insecureTransportAccepted.length > 0)
  throw new Error(
    `Production accepted insecure outbound URLs: ${insecureTransportAccepted.join(", ")}`,
  );

const localHttp = run({
  ...valid,
  NODE_ENV: "development",
  DEPLOYMENT_PROFILE: "pilot",
  AUTH_MODE: "development",
  AV_SCAN_MODE: "disabled",
  PAYMENT_GATEWAY_URL: "http://127.0.0.1:4100",
  AUTH_EMAIL_BASE_URL: "http://localhost:3000",
});
if (localHttp.status !== 0)
  throw new Error(
    `Development HTTP provider compatibility was rejected: ${localHttp.stderr}`,
  );
console.log(
  JSON.stringify(
    {
      productionContract: true,
      insecureCorsRejected: true,
      mockPaymentsRejected: true,
      unprotectedMetricsRejected: true,
      insecureTransportRejected: Object.keys(secretBearingHttpsUrls),
      developmentHttpAccepted: true,
      artifacts: requiredFiles,
    },
    null,
    2,
  ),
);
