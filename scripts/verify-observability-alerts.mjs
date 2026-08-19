import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rulesPath = path.join(
  root,
  "infra",
  "observability",
  "dentmarket-alert-rules.json",
);
const runbookPath = path.join(
  root,
  "actual_docs",
  "operations",
  "observability-runbook.md",
);
const rules = JSON.parse(await readFile(rulesPath, "utf8"));
const runbook = await readFile(runbookPath, "utf8");
const runbookAnchors = new Set(
  [...runbook.matchAll(/^##\s+(.+)$/gm)].map(([, heading]) =>
    heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-"),
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function compare(value, operator, threshold) {
  if (operator === ">") return value > threshold;
  if (operator === ">=") return value >= threshold;
  throw new Error(`Unsupported alert operator: ${operator}`);
}

assert(rules.version === 1, "Alert catalog version must be 1");
assert(rules.owner, "Alert catalog owner is required");
assert(
  Array.isArray(rules.rules) && rules.rules.length >= 6,
  "Critical alert rules are missing",
);

const ids = new Set();
const coveredMetrics = new Set();
for (const rule of rules.rules) {
  assert(
    typeof rule.id === "string" && rule.id.length > 0,
    "Alert id is required",
  );
  assert(!ids.has(rule.id), `Duplicate alert id: ${rule.id}`);
  ids.add(rule.id);
  assert(
    ["warning", "critical"].includes(rule.severity),
    `${rule.id}: invalid severity`,
  );
  assert(
    typeof rule.promql === "string" && rule.promql.includes(rule.metric),
    `${rule.id}: PromQL must reference its metric`,
  );
  assert(/^\d+[smhd]$/.test(rule.for), `${rule.id}: invalid for duration`);
  assert(
    rule.runbook.startsWith("actual_docs/operations/observability-runbook.md#"),
    `${rule.id}: invalid runbook link`,
  );
  const anchor = rule.runbook.split("#")[1];
  assert(runbookAnchors.has(anchor), `${rule.id}: runbook anchor is missing`);
  assert(
    !compare(rule.synthetic.healthy, rule.operator, rule.threshold),
    `${rule.id}: healthy synthetic vector fires`,
  );
  assert(
    compare(rule.synthetic.firing, rule.operator, rule.threshold),
    `${rule.id}: firing synthetic vector does not fire`,
  );
  coveredMetrics.add(rule.metric);
}

for (const metric of [
  "dentmarket_http_request_duration_seconds_count",
  "dentmarket_outbox_oldest_event_age_seconds",
  "dentmarket_outbox_expired_leases",
  "dentmarket_outbox_events",
  "dentmarket_import_rollback_oldest_age_seconds",
]) {
  assert(coveredMetrics.has(metric), `No alert covers ${metric}`);
}

console.log(
  JSON.stringify(
    {
      alertCatalog: true,
      rules: rules.rules.length,
      syntheticVectors: rules.rules.length * 2,
      owner: rules.owner,
      runbook: path.relative(root, runbookPath),
    },
    null,
    2,
  ),
);
