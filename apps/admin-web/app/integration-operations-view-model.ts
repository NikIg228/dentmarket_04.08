export function summarizeIntegrationHealth(input: {
  connectionStatuses: string[];
  jobStatuses: string[];
  reconciliationStatuses: string[];
}) {
  return {
    active: input.connectionStatuses.filter((status) => status === "ACTIVE").length,
    queued: input.jobStatuses.filter((status) =>
      ["PENDING", "FAILED", "RUNNING"].includes(status),
    ).length,
    dead: input.jobStatuses.filter((status) => status === "DEAD_LETTER").length,
    mismatches: input.reconciliationStatuses.filter(
      (status) => status !== "MATCHED" && status !== "RESOLVED",
    ).length,
  };
}
