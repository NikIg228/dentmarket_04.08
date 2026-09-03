import { describe, expect, it } from "vitest";
import { summarizeIntegrationHealth } from "./integration-operations-view-model";

describe("integration operations summary", () => {
  it("separates active connections, retryable jobs, dead letters and mismatches", () => {
    expect(
      summarizeIntegrationHealth({
        connectionStatuses: ["ACTIVE", "ACTIVE", "PAUSED"],
        jobStatuses: ["PENDING", "RUNNING", "FAILED", "DEAD_LETTER", "SUCCEEDED"],
        reconciliationStatuses: ["MATCHED", "RESOLVED", "MISMATCH", "OPEN"],
      }),
    ).toEqual({ active: 2, queued: 3, dead: 1, mismatches: 2 });
  });

  it("returns a stable zero state for an empty registry", () => {
    expect(
      summarizeIntegrationHealth({
        connectionStatuses: [],
        jobStatuses: [],
        reconciliationStatuses: [],
      }),
    ).toEqual({ active: 0, queued: 0, dead: 0, mismatches: 0 });
  });
});
