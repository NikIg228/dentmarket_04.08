const PLACEHOLDER_PATTERNS = [
  /replace/i,
  /change[_-]?me/i,
  /example\.(?:kz|com|test)/i,
  /(?:^|[_.-])(?:user|password|secret|token|db_host|redis_host)(?:$|[_.-])/i,
];

export const LIVE_HEALTH_PROBES = [
  {
    id: "eds.gateway",
    baseUrlKey: "SIGNATURE_GATEWAY_URL",
    urlKey: "SIGNATURE_GATEWAY_HEALTHCHECK_URL",
    tokenKey: "SIGNATURE_GATEWAY_TOKEN",
  },
  {
    id: "psp.gateway",
    baseUrlKey: "PAYMENT_GATEWAY_URL",
    urlKey: "PAYMENT_GATEWAY_HEALTHCHECK_URL",
    tokenKey: "PAYMENT_GATEWAY_TOKEN",
  },
  {
    id: "notification.email",
    baseUrlKey: "EMAIL_PROVIDER_URL",
    urlKey: "EMAIL_PROVIDER_HEALTHCHECK_URL",
    tokenKey: "EMAIL_PROVIDER_TOKEN",
  },
  {
    id: "notification.sms",
    baseUrlKey: "SMS_PROVIDER_URL",
    urlKey: "SMS_PROVIDER_HEALTHCHECK_URL",
    tokenKey: "SMS_PROVIDER_TOKEN",
  },
];

export const LIVE_EVIDENCE_REQUIREMENTS = [
  "psp.capture",
  "psp.refund",
  "psp.webhook",
  "eds.session",
  "eds.callback",
  "eds.legal_signoff",
  "supplier.test_connection",
  "supplier.catalog_sync",
  "supplier.price_sync",
  "supplier.stock_sync",
  "supplier.order_export",
  "notification.email_delivery",
  "notification.sms_delivery",
  "infrastructure.postgresql_pitr_restore",
  "infrastructure.redis_ha_failover",
  "infrastructure.object_storage_versioning_restore",
  "infrastructure.dns_tls",
  "infrastructure.monitoring_alert_delivery",
  "infrastructure.timed_restore_drill",
  "performance.staging_soak",
];

export const LIVE_EVIDENCE_APPROVALS = [
  "engineering",
  "security",
  "product_operations",
  "legal",
];

function normalized(env, key) {
  return typeof env[key] === "string" ? env[key].trim() : "";
}

function looksLikePlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function requiredValue(env, key, minimumLength = 1) {
  const value = normalized(env, key);
  if (!value) return `${key} is missing`;
  if (value.length < minimumLength) return `${key} is too short`;
  if (looksLikePlaceholder(value)) return `${key} still contains a placeholder`;
  return null;
}

function requiredHttpsUrl(env, key) {
  const required = requiredValue(env, key);
  if (required) return required;
  try {
    const url = new URL(normalized(env, key));
    return url.protocol === "https:" ? null : `${key} must use HTTPS`;
  } catch {
    return `${key} is not a valid URL`;
  }
}

function postgresTlsIssue(env) {
  const required = requiredValue(env, "DATABASE_URL");
  if (required) return required;
  try {
    const url = new URL(normalized(env, "DATABASE_URL"));
    const secure =
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["require", "verify-ca", "verify-full"].includes(
        url.searchParams.get("sslmode") ?? "",
      );
    return secure
      ? null
      : "DATABASE_URL must use PostgreSQL TLS via sslmode=require, verify-ca or verify-full";
  } catch {
    return "DATABASE_URL is not a valid PostgreSQL URL";
  }
}

function redisTlsIssue(env) {
  const required = requiredValue(env, "REDIS_URL");
  if (required) return required;
  try {
    return new URL(normalized(env, "REDIS_URL")).protocol === "rediss:"
      ? null
      : "REDIS_URL must use rediss://";
  } catch {
    return "REDIS_URL is not a valid URL";
  }
}

function check(id, category, issues) {
  const filtered = issues.filter(Boolean);
  return { id, category, configured: filtered.length === 0, issues: filtered };
}

export function evaluateProductionConfiguration(env) {
  const checks = [
    check("runtime.release", "runtime", [
      normalized(env, "DEPLOYMENT_PROFILE") === "go_live"
        ? null
        : "DEPLOYMENT_PROFILE must equal go_live",
      requiredValue(env, "APP_RELEASE", 3),
    ]),
    check("psp.gateway", "provider", [
      normalized(env, "PAYMENT_PROVIDER_MODE") === "external"
        ? null
        : "PAYMENT_PROVIDER_MODE must equal external",
      requiredHttpsUrl(env, "PAYMENT_GATEWAY_URL"),
      requiredValue(env, "PAYMENT_GATEWAY_TOKEN", 16),
      requiredValue(env, "PAYMENT_WEBHOOK_SECRET_EXTERNAL", 32),
    ]),
    check("eds.gateway", "provider", [
      requiredHttpsUrl(env, "SIGNATURE_GATEWAY_URL"),
      requiredValue(env, "SIGNATURE_GATEWAY_TOKEN", 16),
      requiredValue(env, "SIGNATURE_CALLBACK_SECRET", 32),
    ]),
    check("notification.email", "provider", [
      requiredHttpsUrl(env, "EMAIL_PROVIDER_URL"),
      requiredValue(env, "EMAIL_PROVIDER_TOKEN", 16),
    ]),
    check("notification.sms", "provider", [
      requiredHttpsUrl(env, "SMS_PROVIDER_URL"),
      requiredValue(env, "SMS_PROVIDER_TOKEN", 16),
    ]),
    check("notification.webhook", "provider", [
      requiredValue(env, "NOTIFICATION_WEBHOOK_SECRET", 32),
    ]),
    check("infrastructure.postgresql", "infrastructure", [
      postgresTlsIssue(env),
    ]),
    check("infrastructure.redis", "infrastructure", [redisTlsIssue(env)]),
    check("infrastructure.object_storage", "infrastructure", [
      normalized(env, "OBJECT_STORAGE_DRIVER") === "s3"
        ? null
        : "OBJECT_STORAGE_DRIVER must equal s3",
      normalized(env, "S3_ENDPOINT")
        ? requiredHttpsUrl(env, "S3_ENDPOINT")
        : null,
      requiredValue(env, "S3_BUCKET"),
      requiredValue(env, "S3_ACCESS_KEY_ID"),
      requiredValue(env, "S3_SECRET_ACCESS_KEY", 16),
      ["AES256", "aws:kms"].includes(
        normalized(env, "S3_SERVER_SIDE_ENCRYPTION"),
      )
        ? null
        : "S3_SERVER_SIDE_ENCRYPTION must equal AES256 or aws:kms",
    ]),
    check("infrastructure.observability", "infrastructure", [
      requiredHttpsUrl(env, "SENTRY_DSN"),
      requiredHttpsUrl(env, "OTEL_EXPORTER_OTLP_ENDPOINT"),
      requiredValue(env, "METRICS_BEARER_TOKEN", 32),
    ]),
  ];
  return {
    configured: checks.every((item) => item.configured),
    checks,
    issues: checks.flatMap((item) =>
      item.issues.map((issue) => `${item.id}: ${issue}`),
    ),
  };
}

export function evaluateHealthProbeConfiguration(env) {
  return LIVE_HEALTH_PROBES.map((probe) => {
    const issues = [
      requiredHttpsUrl(env, probe.baseUrlKey),
      requiredHttpsUrl(env, probe.urlKey),
      requiredValue(env, probe.tokenKey, 16),
    ].filter(Boolean);
    if (issues.length === 0) {
      const baseOrigin = new URL(normalized(env, probe.baseUrlKey)).origin;
      const healthOrigin = new URL(normalized(env, probe.urlKey)).origin;
      if (baseOrigin !== healthOrigin)
        issues.push(
          `${probe.urlKey} must use the same origin as ${probe.baseUrlKey}`,
        );
    }
    return { ...probe, configured: issues.length === 0, issues };
  });
}

function validDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function nonPlaceholderString(value, minimumLength = 3) {
  return (
    typeof value === "string" &&
    value.trim().length >= minimumLength &&
    !looksLikePlaceholder(value.trim())
  );
}

export function validateLiveEvidence(
  manifest,
  { revision, now = Date.now(), maxAgeDays = 30 } = {},
) {
  const issues = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    return { valid: false, issues: ["Evidence manifest must be an object"] };
  if (manifest.schemaVersion !== 1) issues.push("schemaVersion must equal 1");
  if (!["staging", "production"].includes(manifest.environment))
    issues.push("environment must equal staging or production");
  if (!/^[0-9a-f]{40}$/i.test(manifest.revision ?? ""))
    issues.push("revision must be a full 40-character git SHA");
  else if (
    revision &&
    manifest.revision.toLowerCase() !== revision.toLowerCase()
  )
    issues.push("manifest revision does not match the checked-out revision");
  if (!nonPlaceholderString(manifest.release))
    issues.push(
      "release must be a non-placeholder immutable release identifier",
    );

  const startedAt = validDate(manifest.window?.startedAt);
  const endedAt = validDate(manifest.window?.endedAt);
  if (startedAt === null || endedAt === null || startedAt > endedAt)
    issues.push("window must contain a valid ordered startedAt/endedAt pair");
  else {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1_000;
    if (endedAt > now + 5 * 60 * 1_000)
      issues.push("evidence window ends in the future");
    if (now - endedAt > maxAgeMs)
      issues.push(`evidence window is older than ${maxAgeDays} days`);
  }

  const checks = Array.isArray(manifest.checks) ? manifest.checks : [];
  const duplicateIds = checks
    .map((item) => item?.id)
    .filter(
      (id, index, all) => typeof id === "string" && all.indexOf(id) !== index,
    );
  if (duplicateIds.length > 0)
    issues.push(
      `duplicate evidence IDs: ${[...new Set(duplicateIds)].join(", ")}`,
    );
  const byId = new Map(checks.map((item) => [item?.id, item]));
  for (const id of LIVE_EVIDENCE_REQUIREMENTS) {
    const item = byId.get(id);
    if (!item) {
      issues.push(`${id}: evidence is missing`);
      continue;
    }
    if (item.status !== "passed")
      issues.push(`${id}: status must equal passed`);
    const observedAt = validDate(item.observedAt);
    if (observedAt === null) issues.push(`${id}: observedAt is invalid`);
    else if (
      startedAt !== null &&
      endedAt !== null &&
      (observedAt < startedAt || observedAt > endedAt)
    )
      issues.push(`${id}: observedAt is outside the evidence window`);
    if (!nonPlaceholderString(item.reference, 8))
      issues.push(`${id}: reference must identify a real non-secret receipt`);
    if (!nonPlaceholderString(item.actor, 3))
      issues.push(`${id}: actor must identify who ran the check`);
  }

  const approvals = Array.isArray(manifest.approvals) ? manifest.approvals : [];
  const duplicateApprovalRoles = approvals
    .map((approval) => approval?.role)
    .filter(
      (role, index, all) =>
        typeof role === "string" && all.indexOf(role) !== index,
    );
  if (duplicateApprovalRoles.length > 0)
    issues.push(
      `duplicate approval roles: ${[...new Set(duplicateApprovalRoles)].join(", ")}`,
    );
  const approvalsByRole = new Map(
    approvals.map((approval) => [approval?.role, approval]),
  );
  for (const role of LIVE_EVIDENCE_APPROVALS) {
    const approval = approvalsByRole.get(role);
    if (!approval) {
      issues.push(`approval ${role} is missing`);
      continue;
    }
    if (!nonPlaceholderString(approval.approver, 3))
      issues.push(`approval ${role}: approver is missing`);
    const approvedAt = validDate(approval.approvedAt);
    if (approvedAt === null)
      issues.push(`approval ${role}: approvedAt is invalid`);
    else {
      if (endedAt !== null && approvedAt < endedAt)
        issues.push(
          `approval ${role}: approvedAt precedes the evidence window`,
        );
      if (approvedAt > now + 5 * 60 * 1_000)
        issues.push(`approval ${role}: approvedAt is in the future`);
    }
    if (!nonPlaceholderString(approval.reference, 8))
      issues.push(`approval ${role}: reference is missing`);
  }
  return {
    valid: issues.length === 0,
    issues,
    requiredChecks: LIVE_EVIDENCE_REQUIREMENTS.length,
    requiredApprovals: LIVE_EVIDENCE_APPROVALS.length,
  };
}
