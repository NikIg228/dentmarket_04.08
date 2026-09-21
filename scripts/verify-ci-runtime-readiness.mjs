import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { assertApiReadiness, assertCiEnvironment, workerReadiness } from "./lib/ci-verification.mjs";

assertCiEnvironment(process.env);
if (process.argv[2] === "--preflight") {
  console.log("CI runtime configuration: disposable services, test adapters, no external providers");
} else {
  const [apiPid, workerPid] = process.argv.slice(2, 4).map(Number);
  assert(Number.isInteger(apiPid) && apiPid > 1 && Number.isInteger(workerPid) && workerPid > 1, "Expected owned API and worker PIDs");
  const workerLog = process.argv[4];
  assert(workerLog, "Worker log path is required");
  const deadline = Date.now() + 60_000;
  let ready = false;
  let lastApiState = "not contacted";
  while (Date.now() < deadline) {
    process.kill(apiPid, 0);
    process.kill(workerPid, 0);
    let response;
    try {
      response = await fetch(`${process.env.API_URL}/health/ready`, { signal: AbortSignal.timeout(Math.max(1, Math.min(5_000, deadline - Date.now()))) });
    } catch (error) {
      if (error.cause?.code !== "ECONNREFUSED" && error.name !== "TimeoutError") throw error;
      lastApiState = error.cause?.code ?? error.name;
    }
    let apiReady = false;
    if (response) {
      lastApiState = `HTTP ${response.status}`;
      if (response.status !== 503) {
        assert(response.ok, `API readiness returned HTTP ${response.status}`);
        assertApiReadiness(await response.json());
        apiReady = true;
      }
    }
    if (apiReady && workerReadiness(await readFile(workerLog, "utf8"))) {
      process.kill(apiPid, 0);
      process.kill(workerPid, 0);
      ready = true;
      console.log(JSON.stringify({ api: "ready", worker: "ready", dependencies: ["database", "storage", "queue"], evidence: ["GET /health/ready", "worker runtime.ready"] }));
      break;
    }
    await sleep(Math.min(250, Math.max(0, deadline - Date.now())));
  }
  assert(ready, `API/worker readiness timeout after 60s; API: ${lastApiState}; inspect both runtime logs`);
}
