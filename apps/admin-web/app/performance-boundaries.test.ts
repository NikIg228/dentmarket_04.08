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

describe("Admin performance boundaries", () => {
  const adminApp = resolve(process.cwd(), "app");

  it("does not import the Fluent icon root barrel", () => {
    const offenders = sourceFiles(adminApp)
      .filter((file) => !file.endsWith("performance-boundaries.test.ts"))
      .filter((file) =>
        /(?:from|vi\.mock\()\s*["']@fluentui\/react-icons["']/.test(
          readFileSync(file, "utf8"),
        ),
      );

    expect(offenders).toEqual([]);
  });

  it("keeps only overview panels as eager route imports", () => {
    const source = readFileSync(join(adminApp, "page.tsx"), "utf8");

    expect(source).toContain('from "./admin-section-components"');
    expect(source).toContain('from "./live-metrics"');
    expect(source).toContain('from "./operation-queue"');
    expect(source).not.toMatch(/from "\.\/(?:supplier|catalog|platform|trust|audit|foundation|agreement|resource|organization|integration|connector)-/);
  });

  it("defines every non-overview panel through a dynamic import", () => {
    const source = readFileSync(
      join(adminApp, "admin-section-components.tsx"),
      "utf8",
    );
    const dynamicImports = source.match(/\bimport\("\.\//g) ?? [];

    expect(source).toContain('import dynamic from "next/dynamic"');
    expect(source).toContain('import("./supplier-operations")');
    expect(source).toContain('import("./catalog-import-review")');
    expect(source).toContain('import("./platform-settings")');
    expect(dynamicImports).toHaveLength(16);
  });
});
