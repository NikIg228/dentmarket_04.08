import { spawn, spawnSync } from "node:child_process";

const surface = process.argv[2] ?? "buyer";
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

const env = {
  ...process.env,
  NODE_ENV: "development",
  DEPLOYMENT_PROFILE: process.env.DEPLOYMENT_PROFILE ?? "pilot",
  PROCESS_ROLE: process.env.PROCESS_ROLE ?? "all",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public",
  API_HOST: process.env.API_HOST ?? "127.0.0.1",
  API_PORT: process.env.API_PORT ?? "4012",
  AUTH_MODE: process.env.AUTH_MODE ?? "development",
  BACKGROUND_QUEUE_ENABLED: process.env.BACKGROUND_QUEUE_ENABLED ?? "false",
  OBJECT_STORAGE_DRIVER: process.env.OBJECT_STORAGE_DRIVER ?? "local",
  PUBLIC_CATALOG_ORGANIZATION_ID:
    process.env.PUBLIC_CATALOG_ORGANIZATION_ID ??
    "00000000-0000-4000-8000-000000000030",
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL ??
    (surface === "all" ? "/api" : "http://127.0.0.1:4012/api"),
  INTERNAL_API_URL:
    process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4012/api",
  NEXT_PUBLIC_BUYER_APP_URL:
    process.env.NEXT_PUBLIC_BUYER_APP_URL ??
    (surface === "all"
      ? "http://marketplace.localhost:3080"
      : "http://127.0.0.1:3001"),
  NEXT_PUBLIC_LANDING_APP_URL:
    process.env.NEXT_PUBLIC_LANDING_APP_URL ??
    (surface === "all"
      ? "http://dentmarket.localhost:3080"
      : "http://127.0.0.1:3003"),
  NEXT_PUBLIC_SUPPLIER_APP_URL:
    process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ??
    (surface === "all"
      ? "http://supplier.localhost:3080"
      : "http://127.0.0.1:3002"),
};

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
  const healthUrl = `http://127.0.0.1:${env.API_PORT}/api/health`;
  const healthTimeoutMs = 300_000;
  const deadline = Date.now() + healthTimeoutMs;

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

console.log("Starting DentMarket API in development mode...");
const api = spawnNpm(["run", "dev", "--workspace=@marketplace/api"]);

let healthUrl;
try {
  healthUrl = await waitForApi(api);
} catch (error) {
  shutdown(1, error instanceof Error ? error.message : String(error));
}

const frontendWorkspaces =
  surface === "all"
    ? Object.values(workspaceBySurface)
    : [workspaceBySurface[surface]];
const filters = frontendWorkspaces.map((workspace) => `--filter=${workspace}`);

console.log(`API is healthy at ${healthUrl}. Starting ${surface} web surface(s)...`);
const frontend = spawnNpm(["exec", "--", "turbo", "dev", ...filters]);
const gateway = surface === "all" ? spawnNpm(["run", "dev:gateway"]) : null;

if (gateway) {
  console.log("A single public gateway will expose every surface on port 3080.");
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
