export type AssuranceSummary = {
  products: number;
  documents: number;
  signedDocuments: number;
  activeRules: number;
  blockedChecks: number;
  notifications: number;
  paymentProviders: number;
};

export function buildAssuranceSummary(input: {
  searchTotal: number;
  documents: Array<{ status: string }>;
  rules: Array<{ status: string }>;
  checks: Array<{ decision: string; status: string }>;
  notificationCount: number;
  paymentProviderCount: number;
}): AssuranceSummary {
  return {
    products: input.searchTotal,
    documents: input.documents.length,
    signedDocuments: input.documents.filter(({ status }) => status === "SIGNED").length,
    activeRules: input.rules.filter(({ status }) => status === "ACTIVE").length,
    blockedChecks: input.checks.filter(
      ({ decision, status }) => decision === "BLOCKED" || status === "FAILED",
    ).length,
    notifications: input.notificationCount,
    paymentProviders: input.paymentProviderCount,
  };
}
