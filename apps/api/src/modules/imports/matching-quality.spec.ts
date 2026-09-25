import { describe, expect, it } from "vitest";
import { isConfidentAutomaticMatch, normalizeCatalogText, rankVariants } from "./matching";

// Labels are fixed before measurement. Identifiers are synthetic, never supplier data.
const families = ["Filtek One", "Filtek Universal", "RelyX Universal", "Scotchbond Universal",
  "Clinpro", "Equia Forte", "FujiCEM Evolve", "G-aenial", "G-CEM ONE", "G-Premio BOND",
  "Tetric Prime", "Variolink", "Harmonize", "Maxcem", "OptiBond", "SimpliShade",
  "Omnichroma", "Estelite", "Futurabond", "Grandio", "Charisma", "Venus", "Ceram",
  "Spectrum", "Clearfil"];
const variants = families.flatMap((name, index) => ["A1", "A2"].map((shade, offset) => ({
  id: `${index}-${shade}`, sku: `TEST-${index}-${shade}`, gtin: `999${String(index * 2 + offset).padStart(10, "0")}`,
  product: { canonicalName: name },
})));
const rows = families.flatMap((name, index) => {
  const first = variants[index * 2]!, second = variants[index * 2 + 1]!;
  return [
    { label: `${name}: exact GTIN`, item: { name, gtin: first.gtin }, expected: first.id },
    { label: `${name}: exact SKU`, item: { name: "Supplier abbreviation", supplierSku: second.sku }, expected: second.id },
    { label: `${name}: ambiguous shade`, item: { name }, expected: null },
    { label: `${name}: conflicting identifiers`, item: { name, gtin: first.gtin, supplierSku: second.sku }, expected: null },
  ];
});

describe("CORE-04 fixed 100-row matching sample", () => {
  it("never automatically assigns a wrong variant or an ambiguous row", () => {
    const failures: string[] = [];
    let automatic = 0;
    for (const row of rows) {
      const ranked = rankVariants({ ...row.item, normalizedName: normalizeCatalogText(row.item.name) }, variants);
      if (!isConfidentAutomaticMatch(ranked)) continue;
      automatic += 1;
      if (ranked[0]?.variant.id !== row.expected) failures.push(row.label);
    }
    expect(rows).toHaveLength(100);
    console.info(JSON.stringify({ sample: rows.length, automatic, manual: rows.length - automatic, wrongAutomatic: failures.length }));
    expect(failures).toEqual([]);
    // Prevent an implementation that sends everything to review from hiding its lost utility.
    expect(automatic).toBeGreaterThanOrEqual(50);
  });
});
