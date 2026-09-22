import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { localAuthConfig } from "./lib/local-auth-config.mjs";
import { assertPortsAvailable } from "./lib/local-readiness.mjs";

// Fetch normalizes Host; use HTTP to put the exact hostile Host on the wire.
const rawRequest = (url, headers = {}) => new Promise((resolve, reject) => {
  const request = http.get(url, { headers }, response => { response.resume(); response.once("end", () => resolve(response.statusCode)); });
  request.once("error", reject);
});

test("normal local login requires JWT and never enables a demo account", () => {
  const config = localAuthConfig({ JWT_SECRET: "synthetic-test-key-with-at-least-32-characters", PUBLIC_DEMO_MODE: "true" });
  assert.equal(config.AUTH_MODE, "jwt"); assert.equal(config.PUBLIC_DEMO_MODE, "false");
  assert.throws(() => localAuthConfig({ AUTH_MODE: "development" }), /requires AUTH_MODE=jwt/);
  assert.throws(() => localAuthConfig({ JWT_SECRET: "short" }), /at least 32/);
  assert.throws(() => localAuthConfig({ JWT_PUBLIC_KEY: "only-one-key" }), /Both/);
});

test("occupied port is reported without disturbing the existing process", async () => {
  const existing = http.createServer((_, response) => response.end("still alive"));
  await new Promise(resolve => existing.listen(0, "127.0.0.1", resolve));
  const port = existing.address().port;
  try { await assert.rejects(assertPortsAvailable([port]), /occupied/); assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "still alive"); }
  finally { existing.closeAllConnections(); await new Promise(resolve => existing.close(resolve)); }
});

test("gateway validates Host and Origin before API routing and preserves allowed Origin", async () => {
  let observedOrigin;
  const api = http.createServer((request, response) => { observedOrigin = request.headers.origin; response.end("ok"); });
  const reserve = http.createServer();
  await new Promise(resolve => api.listen(0, "127.0.0.1", resolve));
  await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const gateway = spawn(process.execPath, ["scripts/dev-gateway.mjs"], { env: { ...process.env, API_PORT: String(api.address().port), DEV_GATEWAY_PORT: String(port) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let logs = ""; gateway.stdout.on("data", chunk => { logs += chunk; }); gateway.stderr.resume();
  const deadline = Date.now() + 10000;
  try {
    while (!logs.includes("listening") && Date.now() < deadline && gateway.exitCode === null) await new Promise(resolve => setTimeout(resolve, 50));
    assert.match(logs, /listening/);
    const url = `http://127.0.0.1:${port}/api/health`;
    assert.equal(await rawRequest(url, { host: "foreign.invalid" }), 421);
    assert.equal(await rawRequest(url, { origin: "http://foreign.invalid" }), 403);
    const origin = `http://supplier.localhost:${port}`;
    assert.equal(await rawRequest(url, { host: `supplier.localhost:${port}`, origin }), 200);
    assert.equal(observedOrigin, origin);
    // No web apps are running: a listening gateway must not claim full readiness.
    assert.equal((await fetch(`http://127.0.0.1:${port}/__gateway/health`)).status, 503);
  } finally {
    const exited = new Promise(resolve => gateway.once("exit", resolve)); gateway.kill(); await exited;
    api.closeAllConnections(); await new Promise(resolve => api.close(resolve));
  }
});
