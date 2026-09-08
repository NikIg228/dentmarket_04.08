import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const adapterPaths = [
  "apps/api/src/modules/integrations/adapters/custom-api.adapter.ts",
  "apps/api/src/modules/integrations/adapters/moysklad.adapter.ts",
];
const notificationAdapterPath =
  "apps/api/src/modules/notifications/notification-adapters.ts";
const environmentPath = "apps/api/src/platform/config/environment.ts";
const credentialBearingAdapters = [
  {
    relativePath: "apps/api/src/modules/payments/adapters/http-payment.adapter.ts",
    urlKeys: ["PAYMENT_GATEWAY_URL"],
  },
  {
    relativePath:
      "apps/api/src/modules/documents/signature-adapter-registry.service.ts",
    urlKeys: ["SIGNATURE_GATEWAY_URL"],
  },
  {
    relativePath: "apps/api/src/modules/identity/auth-sessions.service.ts",
    urlKeys: ["EMAIL_PROVIDER_URL", "AUTH_EMAIL_BASE_URL"],
  },
  {
    relativePath: "apps/api/src/modules/ai/openai-responses.service.ts",
    urlKeys: ["OPENAI_BASE_URL"],
  },
  {
    relativePath: "apps/api/src/platform/storage/object-storage.service.ts",
    urlKeys: ["SUPABASE_URL", "S3_ENDPOINT"],
  },
  {
    relativePath:
      "apps/api/src/modules/notifications/notification-adapter-registry.service.ts",
    urlKeys: ["EMAIL_PROVIDER_URL", "SMS_PROVIDER_URL"],
  },
  {
    relativePath: "apps/api/src/instrumentation.ts",
    urlKeys: ["SENTRY_DSN", "OTEL_EXPORTER_OTLP_ENDPOINT"],
  },
];
const requiredProductionHttpsKeys = [
  "OPENAI_BASE_URL",
  "SUPABASE_URL",
  "S3_ENDPOINT",
  "SIGNATURE_GATEWAY_URL",
  "PAYMENT_GATEWAY_URL",
  "EMAIL_PROVIDER_URL",
  "AUTH_EMAIL_BASE_URL",
  "SMS_PROVIDER_URL",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "SENTRY_DSN",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sources = await Promise.all(
  adapterPaths.map(async (relativePath) => ({
    relativePath,
    source: await readFile(path.join(root, relativePath), "utf8"),
  })),
);
const notificationSource = await readFile(
  path.join(root, notificationAdapterPath),
  "utf8",
);
const environmentSource = await readFile(
  path.join(root, environmentPath),
  "utf8",
);
const webhookSource = notificationSource.slice(
  notificationSource.indexOf("export class WebhookNotificationAdapter"),
);
assert(
  webhookSource.includes("this.outbound.request("),
  `${notificationAdapterPath} does not use OutboundRequestGateway`,
);

for (const key of requiredProductionHttpsKeys) {
  assert(
    environmentSource.includes(`"${key}"`),
    `${environmentPath} does not bind ${key} to the production HTTPS policy`,
  );
}
for (const { relativePath, urlKeys } of credentialBearingAdapters) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  for (const key of urlKeys) {
    assert(
      source.includes(key),
      `${relativePath} no longer contains expected URL boundary ${key}; review the transport inventory`,
    );
  }
}
assert(
  !/\bfetch\s*\(/.test(webhookSource),
  `${notificationAdapterPath} webhook contains a direct fetch bypass`,
);

for (const { relativePath, source } of sources) {
  assert(
    source.includes("this.outbound.request("),
    `${relativePath} does not use OutboundRequestGateway`,
  );
  assert(
    !/\bfetch\s*\(/.test(source),
    `${relativePath} contains a direct fetch bypass`,
  );
}

const moysklad = sources.find(({ relativePath }) =>
  relativePath.endsWith("moysklad.adapter.ts"),
)?.source;
assert(moysklad, "MySklad adapter source was not loaded");
assert(
  moysklad.includes('allowedHosts: ["api.moysklad.ru"]'),
  "MySklad provider host allowlist is missing",
);
assert(
  !moysklad.includes("context.configuration.baseUrl"),
  "MySklad still accepts a tenant-controlled base URL",
);

console.log(
  JSON.stringify(
    {
      status: "passed",
      adapters: [...adapterPaths, notificationAdapterPath],
      directFetchBypass: false,
      providerAllowlist: { MOYSKLAD: ["api.moysklad.ru"] },
      customApiPolicy: "central_gateway",
      notificationWebhookPolicy: "central_gateway",
      productionHttpsPolicy: requiredProductionHttpsKeys,
      credentialBearingAdapters: credentialBearingAdapters.map(
        ({ relativePath }) => relativePath,
      ),
    },
    null,
    2,
  ),
);
