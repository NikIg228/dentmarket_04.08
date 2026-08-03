import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const apply = process.argv.includes("--apply");
const mediaManifestPath = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-media.json",
);
const productsDirectory = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const media = JSON.parse(await fs.readFile(mediaManifestPath, "utf8"));
if (media.catalogMode !== "PILOT") {
  throw new Error("Refusing to prune media without a PILOT media manifest");
}

const referenced = new Set(
  Object.values(media.entries ?? {})
    .map((entry) => entry.securePath)
    .filter((value) => String(value).startsWith("/catalog/products/"))
    .map((value) => path.basename(value)),
);
const files = await fs.readdir(productsDirectory, { withFileTypes: true });
const productFiles = files.filter((entry) => entry.isFile());
const missing = [];
for (const filename of referenced) {
  try {
    await fs.access(path.join(productsDirectory, filename));
  } catch {
    missing.push(filename);
  }
}
if (missing.length) {
  throw new Error(`Pilot manifest references ${missing.length} missing media files`);
}

const removable = [];
let removableBytes = 0;
for (const entry of productFiles) {
  if (referenced.has(entry.name)) continue;
  const absolutePath = path.resolve(productsDirectory, entry.name);
  if (!absolutePath.startsWith(`${path.resolve(productsDirectory)}${path.sep}`)) {
    throw new Error(`Unsafe media path: ${absolutePath}`);
  }
  const stat = await fs.stat(absolutePath);
  removable.push(absolutePath);
  removableBytes += stat.size;
}

if (apply) {
  for (const absolutePath of removable) await fs.unlink(absolutePath);
}

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      manifestEntries: Object.keys(media.entries ?? {}).length,
      referencedProductFiles: referenced.size,
      existingProductFiles: productFiles.length,
      removableFiles: removable.length,
      removableBytes,
      remainingProductFiles: productFiles.length - (apply ? removable.length : 0),
    },
    null,
    2,
  ),
);
