import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const buyerBuildDirectory = resolve(repositoryRoot, "apps/buyer-web/.next");
const routeManifestPath = resolve(
  buyerBuildDirectory,
  "server/app/page_client-reference-manifest.js",
);
const buildManifestPath = resolve(buyerBuildDirectory, "build-manifest.json");

const MAX_INITIAL_JS_FILES = 24;
const MAX_INITIAL_JS_RAW_BYTES = 1_500_000;
const MAX_INITIAL_JS_GZIP_BYTES = 450_000;

const sandbox = { globalThis: {} };
vm.runInNewContext(readFileSync(routeManifestPath, "utf8"), sandbox, {
  filename: routeManifestPath,
});

const routeManifest = sandbox.globalThis.__RSC_MANIFEST?.["/page"];
if (!routeManifest) {
  throw new Error("Buyer /page client reference manifest was not found");
}

const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8"));
const javascriptAssets = new Set([
  ...(buildManifest.polyfillFiles ?? []),
  ...(buildManifest.rootMainFiles ?? []),
]);

for (const module of Object.values(routeManifest.clientModules ?? {})) {
  for (const chunk of module.chunks ?? []) {
    if (typeof chunk === "string" && chunk.endsWith(".js")) {
      javascriptAssets.add(chunk);
    }
  }
}

const files = [...javascriptAssets].map((asset) => {
  const path = resolve(buyerBuildDirectory, asset);
  const content = readFileSync(path);
  return {
    asset,
    rawBytes: statSync(path).size,
    gzipBytes: gzipSync(content).length,
  };
});

const totals = files.reduce(
  (result, file) => ({
    rawBytes: result.rawBytes + file.rawBytes,
    gzipBytes: result.gzipBytes + file.gzipBytes,
  }),
  { rawBytes: 0, gzipBytes: 0 },
);

const violations = [];
if (files.length > MAX_INITIAL_JS_FILES) {
  violations.push(
    `initial JS file count ${files.length} exceeds ${MAX_INITIAL_JS_FILES}`,
  );
}
if (totals.rawBytes > MAX_INITIAL_JS_RAW_BYTES) {
  violations.push(
    `initial JS raw size ${totals.rawBytes} exceeds ${MAX_INITIAL_JS_RAW_BYTES} bytes`,
  );
}
if (totals.gzipBytes > MAX_INITIAL_JS_GZIP_BYTES) {
  violations.push(
    `initial JS gzip size ${totals.gzipBytes} exceeds ${MAX_INITIAL_JS_GZIP_BYTES} bytes`,
  );
}

console.log(
  JSON.stringify(
    {
      route: "/",
      javascriptFiles: files.length,
      rawBytes: totals.rawBytes,
      gzipBytes: totals.gzipBytes,
      budgets: {
        javascriptFiles: MAX_INITIAL_JS_FILES,
        rawBytes: MAX_INITIAL_JS_RAW_BYTES,
        gzipBytes: MAX_INITIAL_JS_GZIP_BYTES,
      },
      largestFiles: files
        .sort((left, right) => right.rawBytes - left.rawBytes)
        .slice(0, 5),
    },
    null,
    2,
  ),
);

if (violations.length) {
  throw new Error(`Buyer bundle budget failed: ${violations.join("; ")}`);
}
