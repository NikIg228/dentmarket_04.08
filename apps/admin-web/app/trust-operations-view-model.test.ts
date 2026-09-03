import { describe, expect, it } from "vitest";
import { summarizeTrustOperations } from "./trust-operations-view-model";

describe("trust operations summary", () => {
  it("counts only active restrictions and unresolved appeals", () => {
    expect(
      summarizeTrustOperations({
        incidents: [
          {
            status: "OPEN",
            actionType: "HARD_BLOCK",
            appeals: [{ status: "OPEN" }, { status: "REJECTED" }],
          },
          {
            status: "UNDER_REVIEW",
            actionType: "REVIEW_REQUIRED",
            appeals: [{ status: "UNDER_REVIEW" }],
          },
          {
            status: "RESOLVED",
            actionType: "HARD_BLOCK",
            appeals: [{ status: "RESOLVED" }],
          },
        ],
        ratingStatuses: ["CALCULATED", "INSUFFICIENT_DATA", "CALCULATED"],
        warehouseStats: { total: 7, verified: 5 },
      }),
    ).toEqual({
      open: 2,
      hardBlocks: 1,
      pendingAppeals: 2,
      calculatedRatings: 2,
      totalWarehouses: 7,
      verifiedWarehouses: 5,
    });
  });

  it("keeps the empty state deterministic", () => {
    expect(
      summarizeTrustOperations({
        incidents: [],
        ratingStatuses: [],
        warehouseStats: { total: 0, verified: 0 },
      }),
    ).toEqual({
      open: 0,
      hardBlocks: 0,
      pendingAppeals: 0,
      calculatedRatings: 0,
      totalWarehouses: 0,
      verifiedWarehouses: 0,
    });
  });
});
