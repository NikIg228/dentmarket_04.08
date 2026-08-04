import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apiDist = resolve(root, "apps/api/dist/src");
const probe = resolve(apiDist, "platform/runtime/runtime-role-probe.js");
for (const entrypoint of [resolve(apiDist, "main.js"), resolve(apiDist, "worker.js"), probe]) {
  if (!existsSync(entrypoint)) throw new Error(`Missing built runtime entrypoint: ${entrypoint}`);
}

const expected = {
  api: { http: true, schedules: false, queueProducer: true, queueConsumer: false },
  worker: { http: false, schedules: true, queueProducer: true, queueConsumer: true },
  all: { http: true, schedules: true, queueProducer: true, queueConsumer: true },
};

const baseEnvironment = { ...process.env, NODE_ENV: "test", DATABASE_URL: "postgresql://runtime:runtime@127.0.0.1:1/runtime", BACKGROUND_QUEUE_ENABLED: "false", OTEL_EXPORTER_OTLP_ENDPOINT: "", SENTRY_DSN: "" };

for (const [role, capabilities] of Object.entries(expected)) {
  const result = spawnSync(process.execPath, [probe], {
    cwd: root,
    encoding: "utf8",
    env: { ...baseEnvironment, PROCESS_ROLE: role },
  });
  if (result.status !== 0) throw new Error(`Runtime probe failed for ${role}: ${result.stderr || result.stdout}`);
  const actual = JSON.parse(result.stdout.trim());
  if (actual.role !== role || JSON.stringify(actual.capabilities) !== JSON.stringify(capabilities) || actual.scheduleModule !== capabilities.schedules) throw new Error(`Unexpected runtime plan for ${role}: ${result.stdout.trim()}`);
  process.stdout.write(`PASS ${role}: ${JSON.stringify(actual.capabilities)}, ScheduleModule=${actual.scheduleModule}\n`);
}

for (const [entrypoint, role, expectedError] of [
  [resolve(apiDist, "main.js"), "worker", "must be started with the worker entrypoint"],
  [resolve(apiDist, "worker.js"), "api", "worker entrypoint requires PROCESS_ROLE=worker"],
]) {
  const result = spawnSync(process.execPath, [entrypoint], { cwd: root, encoding: "utf8", env: { ...baseEnvironment, PROCESS_ROLE: role } });
  const output = `${result.stderr}${result.stdout}`;
  if (result.status === 0 || !output.includes(expectedError)) throw new Error(`Entrypoint ${entrypoint} accepted forbidden role ${role}: ${output}`);
  process.stdout.write(`PASS entrypoint guard: ${role} rejected by ${entrypoint.endsWith("worker.js") ? "worker" : "main"}\n`);
}

const productionAll = spawnSync(process.execPath, [probe], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://runtime:runtime@127.0.0.1:1/runtime", PROCESS_ROLE: "all", AUTH_MODE: "jwt", JWT_SECRET: "runtime-smoke-secret-runtime-smoke-secret", AV_SCAN_MODE: "required", BACKGROUND_QUEUE_ENABLED: "false", DEPLOYMENT_PROFILE: "pilot" },
});
if (productionAll.status === 0 || !`${productionAll.stderr}${productionAll.stdout}`.includes("all process role is restricted")) throw new Error("PROCESS_ROLE=all must be rejected in production");
process.stdout.write("PASS production: PROCESS_ROLE=all rejected\n");
process.stdout.write("Runtime split smoke test passed.\n");
