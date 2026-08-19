import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const adapterPaths = [
  "apps/api/src/modules/integrations/adapters/custom-api.adapter.ts",
  "apps/api/src/modules/integrations/adapters/moysklad.adapter.ts",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sources = await Promise.all(
  adapterPaths.map(async (relativePath) => ({
    relativePath,
    source: await readFile(path.join(root, relativePath), "utf8"),
  })),
);

for (const { relativePath, source } of sources) {
  assert(
    source.includes("this.outbound.request("),
    `${relativePath} does not use OutboundRequestGateway`,
  );
  assert(
    !/\bfetch\s*\(/.test(source),
    `${relativePath} contains a direct fetch bypass`,
  );
}

const moysklad = sources.find(({ relativePath }) =>
  relativePath.endsWith("moysklad.adapter.ts"),
)?.source;
assert(moysklad, "MySklad adapter source was not loaded");
assert(
  moysklad.includes('allowedHosts: ["api.moysklad.ru"]'),
  "MySklad provider host allowlist is missing",
);
assert(
  !moysklad.includes("context.configuration.baseUrl"),
  "MySklad still accepts a tenant-controlled base URL",
);

console.log(
  JSON.stringify(
    {
      status: "passed",
      adapters: adapterPaths,
      directFetchBypass: false,
      providerAllowlist: { MOYSKLAD: ["api.moysklad.ru"] },
      customApiPolicy: "central_gateway",
    },
    null,
    2,
  ),
);
