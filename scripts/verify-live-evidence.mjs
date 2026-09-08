import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validateLiveEvidence } from "./lib/production-readiness.mjs";

const evidencePath = process.env.LIVE_EVIDENCE_FILE;
if (!evidencePath) {
  console.error("LIVE_EVIDENCE_FILE is required");
  process.exit(1);
}

const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
if (git.status !== 0) {
  console.error("Cannot resolve the checked-out git revision");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(await readFile(resolve(evidencePath), "utf8"));
} catch (error) {
  console.error(
    `Cannot read live evidence manifest: ${
      error instanceof Error ? error.message : "unknown error"
    }`,
  );
  process.exit(1);
}

const maxAgeDays = Number(process.env.LIVE_EVIDENCE_MAX_AGE_DAYS ?? 30);
if (!Number.isFinite(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 90) {
  console.error("LIVE_EVIDENCE_MAX_AGE_DAYS must be between 1 and 90");
  process.exit(1);
}

const result = validateLiveEvidence(manifest, {
  revision: git.stdout.trim(),
  maxAgeDays,
});
console.log(
  JSON.stringify(
    {
      valid: result.valid,
      environment: manifest.environment,
      revision: manifest.revision,
      release: manifest.release,
      requiredChecks: result.requiredChecks,
      requiredApprovals: result.requiredApprovals,
      issues: result.issues,
    },
    null,
    2,
  ),
);
if (!result.valid) process.exitCode = 1;
