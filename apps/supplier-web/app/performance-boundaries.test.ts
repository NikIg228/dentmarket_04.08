import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceExtensions = new Set([".ts", ".tsx"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

describe("Supplier performance boundaries", () => {
  const supplierApp = resolve(process.cwd(), "app");

  it("does not import the Fluent icon root barrel", () => {
    const offenders = sourceFiles(supplierApp)
      .filter((file) => !file.endsWith("performance-boundaries.test.ts"))
      .filter((file) =>
        /(?:from|vi\.mock\()\s*["']@fluentui\/react-icons["']/.test(
          readFileSync(file, "utf8"),
        ),
      );

    expect(offenders).toEqual([]);
  });

  it("keeps non-dashboard workspaces behind dynamic imports", () => {
    const source = readFileSync(join(supplierApp, "page.tsx"), "utf8");

    expect(source).toContain('import dynamic from "next/dynamic"');
    expect(source).toContain('import("./features/supplier-workspace/supplier-offers")');
    expect(source).not.toContain(
      'import { SupplierOffers } from "./features/supplier-workspace/supplier-offers"',
    );
    expect(source).not.toContain(
      'import { SupplierOrders } from "./features/supplier-workspace/supplier-orders"',
    );
  });

  it("delegates root data loading to the active-section loader", () => {
    const source = readFileSync(join(supplierApp, "page.tsx"), "utf8");

    expect(source).toContain(
      "loadSupplierSectionData(api, supplierId, active)",
    );
    expect(source).not.toContain("documentData,");
    expect(source).not.toContain("externalItemData,");
  });
});
