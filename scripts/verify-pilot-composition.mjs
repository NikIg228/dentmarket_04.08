import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const probe = resolve(
  root,
  "apps/api/dist/src/platform/runtime/deployment-profile-probe.js",
);

if (!existsSync(probe))
  throw new Error(`Missing built deployment profile probe: ${probe}`);

const outOfPilotModules = [
  "PromotionsModule",
  "BillingModule",
  "AiModule",
  "TrustCommerceModule",
  "SmartRecommendationsModule",
];
const outOfPilotPrefixes = [
  "/promotions",
  "/billing",
  "/ai",
  "/trust",
  "/recommendations",
];
const requiredPilotPaths = [
  "/geo/addresses",
  "/marketplace/search",
  "/buyers/{buyerOrganizationId}/carts",
  "/carts/{cartId}/checkout",
];

function runProbe(profile) {
  const probeEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    PROCESS_ROLE: "api",
    DATABASE_URL:
      "postgresql://profile:profile@127.0.0.1:1/profile_composition",
    BACKGROUND_QUEUE_ENABLED: "false",
    OTEL_EXPORTER_OTLP_ENDPOINT: "",
    SENTRY_DSN: "",
  };
  if (profile) probeEnvironment.DEPLOYMENT_PROFILE = profile;
  else delete probeEnvironment.DEPLOYMENT_PROFILE;
  const result = spawnSync(process.execPath, [probe], {
    cwd: root,
    encoding: "utf8",
    env: probeEnvironment,
  });
  if (result.status !== 0)
    throw new Error(
      `${profile} profile probe failed: ${result.stderr || result.stdout}`,
    );
  return JSON.parse(result.stdout.trim());
}

function matchingPaths(paths, prefixes) {
  return paths.filter((path) =>
    prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)),
  );
}

const pilot = runProbe("pilot");
const goLive = runProbe("go_live");
const defaultProfile = runProbe();

if (defaultProfile.profile !== "pilot")
  throw new Error(
    `Missing DEPLOYMENT_PROFILE defaulted to ${defaultProfile.profile}, expected pilot`,
  );

const pilotModules = outOfPilotModules.filter((name) =>
  pilot.moduleNames.includes(name),
);
if (pilotModules.length > 0)
  throw new Error(
    `Pilot imported out-of-scope modules: ${pilotModules.join(", ")}`,
  );

const pilotRoutes = matchingPaths(pilot.paths, outOfPilotPrefixes);
if (pilotRoutes.length > 0)
  throw new Error(
    `Pilot exposed out-of-scope routes: ${pilotRoutes.join(", ")}`,
  );

const missingPilotPaths = requiredPilotPaths.filter(
  (path) => !pilot.paths.includes(path),
);
if (missingPilotPaths.length > 0)
  throw new Error(
    `Pilot lost required routes: ${missingPilotPaths.join(", ")}`,
  );

const missingGoLiveModules = outOfPilotModules.filter(
  (name) => !goLive.moduleNames.includes(name),
);
if (missingGoLiveModules.length > 0)
  throw new Error(
    `go_live omitted modules: ${missingGoLiveModules.join(", ")}`,
  );

for (const prefix of outOfPilotPrefixes) {
  if (matchingPaths(goLive.paths, [prefix]).length === 0)
    throw new Error(`go_live omitted route surface: ${prefix}`);
}

process.stdout.write(
  `PASS pilot: ${pilot.moduleNames.length} modules, ${pilot.paths.length} routes, out-of-scope surface absent\n`,
);
process.stdout.write(
  `PASS go_live: ${goLive.moduleNames.length} modules, ${goLive.paths.length} routes, optional surface present\n`,
);
process.stdout.write("Deployment profile composition gate passed.\n");
