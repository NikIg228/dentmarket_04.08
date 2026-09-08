import { spawnSync } from "node:child_process";

const base = {
  ...process.env,
  NODE_ENV: "production",
  DEPLOYMENT_PROFILE: "go_live",
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
  SIGNATURE_GATEWAY_URL: "https://eds.example.kz",
  SIGNATURE_CALLBACK_SECRET: "e".repeat(48),
  PAYMENT_PROVIDER_MODE: "external",
  PAYMENT_GATEWAY_URL: "https://pay.example.kz",
  PAYMENT_GATEWAY_TOKEN: "p".repeat(32),
  EMAIL_PROVIDER_URL: "https://mail.example.kz/send",
  EMAIL_PROVIDER_TOKEN: "m".repeat(32),
  AUTH_EMAIL_BASE_URL: "https://example.kz",
  NOTIFICATION_WEBHOOK_SECRET: "n".repeat(48),
  SENTRY_DSN: "https://public@sentry.example.kz/1",
  OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.kz/v1/traces",
  METRICS_BEARER_TOKEN: "t".repeat(48),
};

const run = (overrides = {}) =>
  spawnSync(
    process.execPath,
    [
      "-e",
      "require('./apps/api/dist/src/platform/config/environment.js').environment(); console.log('valid')",
    ],
    { env: { ...base, ...overrides }, encoding: "utf8" },
  );

const accepted = run();
if (accepted.status !== 0) {
  throw new Error(
    `Valid production auth contract rejected: ${accepted.stderr}`,
  );
}

const rejected = [
  ["missing shared Redis", { REDIS_URL: "" }, "Redis is required"],
  [
    "development authentication",
    { AUTH_MODE: "development" },
    "Development identity headers",
  ],
  ["MFA disabled", { JWT_REQUIRE_MFA: "false" }, "MFA must be required"],
  ["unbounded rate-limit window", { RATE_LIMIT_TTL_MS: "3600001" }, "Too big"],
  ["unbounded rate-limit budget", { RATE_LIMIT_REQUESTS: "100001" }, "Too big"],
];

for (const [name, overrides, expected] of rejected) {
  const result = run(overrides);
  if (result.status === 0 || !result.stderr.includes(expected)) {
    throw new Error(
      `Production auth contract accepted ${name}: ${result.stderr}`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      productionAuthContract: true,
      sharedRedisRequired: true,
      developmentAuthRejected: true,
      mfaRequired: true,
      rateLimitBoundsEnforced: true,
    },
    null,
    2,
  ),
);
