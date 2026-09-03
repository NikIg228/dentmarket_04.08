export type CatalogQualitySummary = {
  missingVariants: number;
  missingCategories: number;
  missingIndustries: number;
};

export type SearchAnalyticsRow = {
  query: string;
  searches: number;
  noResults: number;
  avgResults: number;
};

export function createCatalogImportSlug(value: string, fallbackId: string) {
  const normalized = value
    .toLocaleLowerCase("ru")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || `import-${fallbackId}`;
}

export function canApproveCatalogImport(input: {
  canonicalName: string;
  slug: string;
  industryId: string;
  categoryId: string;
  unitId: string;
  packageQuantity: string;
  decisionReason: string;
}) {
  const quantity = Number(input.packageQuantity);
  return Boolean(
    input.canonicalName.trim() &&
      input.slug.trim() &&
      input.industryId &&
      input.categoryId &&
      input.unitId &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      input.decisionReason.trim().length >= 5,
  );
}

export function canDecideCorrection(input: {
  action: "approve" | "reject";
  draft: string;
  comment: string;
}) {
  if (input.comment.trim().length < 3) return false;
  return input.action === "reject" || Boolean(input.draft.trim());
}

export function correctionDecisionLabel(draft: string, proposedValue: string) {
  return draft.trim() === proposedValue.trim() ? "Принять" : "Принять с редактурой";
}

export function catalogQualityGapCount(quality: CatalogQualitySummary) {
  return quality.missingVariants + quality.missingCategories + quality.missingIndustries;
}

export function noResultQueries(rows: SearchAnalyticsRow[], limit = 8) {
  return rows.filter((row) => row.noResults > 0).slice(0, limit);
}
