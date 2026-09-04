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

describe("Buyer performance boundaries", () => {
  const buyerApp = resolve(process.cwd(), "app");
  const sharedUi = resolve(process.cwd(), "../../packages/ui/src");

  it("does not import the Fluent icon root barrel", () => {
    const offenders = [...sourceFiles(buyerApp), ...sourceFiles(sharedUi)]
      .filter((file) => !file.endsWith("performance-boundaries.test.ts"))
      .filter((file) =>
        /(?:from|vi\.mock\()\s*["']@fluentui\/react-icons["']/.test(
          readFileSync(file, "utf8"),
        ),
      );

    expect(offenders).toEqual([]);
  });

  it("keeps the catalog snapshots outside client component imports", () => {
    const offenders = sourceFiles(buyerApp).filter((file) => {
      const source = readFileSync(file, "utf8");
      const isClientComponent = /^\s*["']use client["'];/m.test(source);
      return (
        isClientComponent &&
        /public-catalog-(?:fallback|media)\.json/.test(source)
      );
    });

    expect(offenders).toEqual([]);
  });

  it("keeps the initial catalog page at the 24-card budget", () => {
    const source = readFileSync(join(buyerApp, "page.tsx"), "utf8");

    expect(source).toContain("const CATALOG_PAGE_SIZE = 24;");
    expect(source).not.toContain('limit: "60"');
  });
});
