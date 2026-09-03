import { describe, expect, it } from "vitest";
import { buildAssuranceSummary } from "./platform-assurance-view-model";

describe("platform assurance summary", () => {
  it("counts signed, active and blocking records", () => {
    expect(
      buildAssuranceSummary({
        searchTotal: 500,
        documents: [{ status: "SIGNED" }, { status: "DRAFT" }],
        rules: [{ status: "ACTIVE" }, { status: "ARCHIVED" }],
        checks: [
          { decision: "BLOCKED", status: "COMPLETED" },
          { decision: "PASSED", status: "FAILED" },
          { decision: "PASSED", status: "COMPLETED" },
        ],
        notificationCount: 8,
        paymentProviderCount: 1,
      }),
    ).toEqual({
      products: 500,
      documents: 2,
      signedDocuments: 1,
      activeRules: 1,
      blockedChecks: 2,
      notifications: 8,
      paymentProviders: 1,
    });
  });
});
