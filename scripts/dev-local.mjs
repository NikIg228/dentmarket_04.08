import { spawn, spawnSync } from "node:child_process";
import { localDevelopmentProfile } from "./lib/local-development-profile.mjs";
import { localAuthConfig } from "./lib/local-auth-config.mjs";
import { assertPortsAvailable, waitForSurface } from "./lib/local-readiness.mjs";
import { assertLocalSchema } from "./lib/local-schema.mjs";

const surface = process.argv[2] ?? "buyer";
const apiPort = Number(process.env.API_PORT ?? 4012);
const gatewayPort = Number(process.env.DEV_GATEWAY_PORT ?? 3080);
if (![apiPort, gatewayPort].every(port => Number.isInteger(port) && port > 0 && port <= 65535)) throw new Error("API_PORT/DEV_GATEWAY_PORT must be valid ports");
const webPorts = { admin: 3000, buyer: 3001, supplier: 3002, landing: 3003 };
const workspaceBySurface = {
  admin: "@marketplace/admin-web",
  buyer: "@marketplace/buyer-web",
  landing: "@marketplace/landing-web",
  supplier: "@marketplace/supplier-web",
};

if (surface !== "all" && !workspaceBySurface[surface]) {
  console.error(
    `Unknown surface "${surface}". Use buyer, supplier, admin, landing, or all.`,
  );
  process.exit(1);
}

const selectedSurfaces = surface === "all" ? Object.keys(webPorts) : [...new Set([surface, "landing"])];
const startupDeadline = Date.now() + 300_000;

const env = {
  ...process.env,
  NODE_ENV: "development",
  ...localDevelopmentProfile({
    ...process.env,
    ...(process.argv.includes("--pilot") ? { DEPLOYMENT_PROFILE: "pilot" } : {}),
  }),
  PROCESS_ROLE: process.env.PROCESS_ROLE ?? "all",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public",
  API_HOST: process.env.API_HOST ?? "127.0.0.1",
  API_PORT: process.env.API_PORT ?? "4012",
  ...localAuthConfig(process.env),
  BACKGROUND_QUEUE_ENABLED: process.env.BACKGROUND_QUEUE_ENABLED ?? "false",
  OBJECT_STORAGE_DRIVER: process.env.OBJECT_STORAGE_DRIVER ?? "local",
  PUBLIC_CATALOG_ORGANIZATION_ID:
    process.env.PUBLIC_CATALOG_ORGANIZATION_ID ??
    "00000000-0000-4000-8000-000000000030",
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL ??
    "/api",
  INTERNAL_API_URL:
    process.env.INTERNAL_API_URL ?? `http://127.0.0.1:${apiPort}/api`,
  NEXT_PUBLIC_BUYER_APP_URL:
    process.env.NEXT_PUBLIC_BUYER_APP_URL ??
    (surface === "all"
      ? `http://marketplace.localhost:${gatewayPort}`
      : "http://127.0.0.1:3001"),
  NEXT_PUBLIC_LANDING_APP_URL:
    process.env.NEXT_PUBLIC_LANDING_APP_URL ??
    (surface === "all"
      ? `http://dentmarket.localhost:${gatewayPort}`
      : "http://127.0.0.1:3003"),
  NEXT_PUBLIC_SUPPLIER_APP_URL:
    process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ??
    (surface === "all"
      ? `http://supplier.localhost:${gatewayPort}`
      : "http://127.0.0.1:3002"),
};
env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? [
  ...["dentmarket.localhost", "marketplace.localhost", "buyer.localhost", "supplier.localhost", "admin.localhost", "localhost", "127.0.0.1"].map(host => `http://${host}:${gatewayPort}`),
  ...Object.values(webPorts).flatMap(port => [`http://localhost:${port}`, `http://127.0.0.1:${port}`]),
].join(",");
env.AUTH_EMAIL_BASE_URL = process.env.AUTH_EMAIL_BASE_URL ?? env.NEXT_PUBLIC_LANDING_APP_URL;
if (process.env.DEV_GATEWAY_HOST && process.env.DEV_GATEWAY_HOST !== "127.0.0.1") throw new Error("The standard local profile listens on loopback. LAN requires a separately configured trusted Host/Origin profile.");

if (env.API_HOST !== "127.0.0.1") throw new Error("API_HOST must use loopback in the standard local profile.");
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Run this launcher through npm, for example: npm run dev");
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function spawnNpm(args) {
  const child = spawn(process.execPath, [npmCli, ...args], {
    env,
    stdio: "inherit",
  });
  children.push(child);
  child.once("error", (error) => {
    shutdown(1, `Unable to start npm: ${error.message}`);
  });
  return child;
}

function stopChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill("SIGTERM");
}

function shutdown(code, message) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (message) console.error(message);
  for (const child of children.toReversed()) stopChild(child);
  process.exit(code);
}

async function waitForApi(api) {
  const healthUrl = `http://127.0.0.1:${env.API_PORT}/api/health/ready`;
  const healthTimeoutMs = 300_000;
  const deadline = startupDeadline;

  while (Date.now() < deadline) {
    if (api.exitCode !== null || api.signalCode) {
      throw new Error("API development process exited before becoming healthy.");
    }
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) return healthUrl;
    } catch {
      // The API is still compiling or opening the database connection.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `API did not become healthy within ${healthTimeoutMs / 1_000} seconds: ${healthUrl}`,
  );
}

process.once("SIGINT", () => shutdown(130));
process.once("SIGTERM", () => shutdown(143));

console.log(
  `Starting DentMarket locally with deployment profile ${env.DEPLOYMENT_PROFILE}...`,
);
await assertPortsAvailable([apiPort, ...selectedSurfaces.map(name => webPorts[name]), ...(surface === "all" ? [gatewayPort] : [])]);
await assertLocalSchema(env.DATABASE_URL);
// Shared CommonJS schemas are the only runtime package output required by dev.
const schemas = spawnNpm(["run", "build", "--workspace=@marketplace/schemas"]);
const schemaExit = await new Promise(resolve => schemas.once("exit", resolve));
if (schemaExit !== 0) shutdown(1, "Shared schemas failed to build; API/frontend were not started.");
const api = spawnNpm(["run", "dev", "--workspace=@marketplace/api"]);

let healthUrl;
try {
  healthUrl = await waitForApi(api);
} catch (error) {
  shutdown(1, error instanceof Error ? error.message : String(error));
}

const frontendWorkspaces = selectedSurfaces.map(name => workspaceBySurface[name]);
const filters = frontendWorkspaces.map((workspace) => `--filter=${workspace}`);

console.log(`API is healthy at ${healthUrl}. Starting ${surface} web surface(s)...`);
const frontend = spawnNpm(["exec", "--", "turbo", "dev", ...filters]);
const gateway = surface === "all" ? spawnNpm(["run", "dev:gateway"]) : null;

if (gateway) {
  console.log(`Gateway is starting on port ${gatewayPort}; waiting for the requested surfaces.`);
}

api.once("exit", (code, signal) => {
  if (!shuttingDown) {
    shutdown(
      code ?? 1,
      `API development process stopped${signal ? ` (${signal})` : ""}.`,
    );
  }
});

frontend.once("exit", (code, signal) => {
  if (!shuttingDown) {
    shutdown(
      code ?? 1,
      `Frontend development process stopped${signal ? ` (${signal})` : ""}.`,
    );
  }
});

gateway?.once("exit", (code, signal) => {
  if (!shuttingDown) {
    shutdown(
      code ?? 1,
      `Development gateway stopped${signal ? ` (${signal})` : ""}.`,
    );
  }
});

try {
  // Warm one route at a time to avoid four simultaneous first compilations.
  for (const name of selectedSurfaces) {
    await waitForSurface(`http://127.0.0.1:${webPorts[name]}${name === "landing" ? "/login" : "/"}`, () => frontend.exitCode !== null || Boolean(frontend.signalCode), Math.max(0, startupDeadline - Date.now()));
    console.log(`${name}: ready`);
  }
  if (gateway) await waitForSurface(`http://127.0.0.1:${gatewayPort}/__gateway/health`, () => gateway.exitCode !== null, Math.max(0, startupDeadline - Date.now()));
  console.log(`DentMarket ${surface} is ready. Auth: JWT; public catalog; no demo login.`);
} catch (error) { shutdown(1, error instanceof Error ? error.message : "Local readiness failed"); }
