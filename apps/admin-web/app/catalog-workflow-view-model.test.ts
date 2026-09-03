import { describe, expect, it } from "vitest";
import {
  canApproveCatalogImport,
  canDecideCorrection,
  catalogQualityGapCount,
  correctionDecisionLabel,
  createCatalogImportSlug,
  noResultQueries,
} from "./catalog-workflow-view-model";

describe("admin catalog workflow view model", () => {
  it("creates a stable slug and a deterministic fallback", () => {
    expect(createCatalogImportSlug("SafeTouch Ultra 100", "candidate-1")).toBe(
      "safetouch-ultra-100",
    );
    expect(createCatalogImportSlug("Перчатки", "candidate-1")).toBe(
      "import-candidate-1",
    );
  });

  it("guards approval until every required catalog decision is valid", () => {
    const valid = {
      canonicalName: "Перчатки SafeTouch",
      slug: "safetouch",
      industryId: "dental",
      categoryId: "gloves",
      unitId: "pack",
      packageQuantity: "100",
      decisionReason: "Проверено по каталогу",
    };

    expect(canApproveCatalogImport(valid)).toBe(true);
    expect(canApproveCatalogImport({ ...valid, packageQuantity: "0" })).toBe(false);
    expect(canApproveCatalogImport({ ...valid, decisionReason: "нет" })).toBe(false);
  });

  it("requires a moderator comment and a non-empty approved value", () => {
    expect(canDecideCorrection({ action: "reject", draft: "", comment: "Нет источника" })).toBe(true);
    expect(canDecideCorrection({ action: "approve", draft: "", comment: "Проверено" })).toBe(false);
    expect(canDecideCorrection({ action: "approve", draft: "Новое", comment: "Ок" })).toBe(false);
    expect(correctionDecisionLabel("Новое", "Старое")).toBe("Принять с редактурой");
  });

  it("builds quality and no-result summaries", () => {
    expect(catalogQualityGapCount({ missingVariants: 2, missingCategories: 3, missingIndustries: 1 })).toBe(6);
    expect(
      noResultQueries([
        { query: "бор", searches: 5, noResults: 0, avgResults: 4 },
        { query: "редкий товар", searches: 3, noResults: 2, avgResults: 0 },
      ]),
    ).toHaveLength(1);
  });
});
