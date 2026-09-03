type IncidentSummaryInput = {
  status: string;
  actionType: string;
  appeals: Array<{ status: string }>;
};

export function summarizeTrustOperations(input: {
  incidents: IncidentSummaryInput[];
  ratingStatuses: string[];
  warehouseStats: { total: number; verified: number };
}) {
  const open = input.incidents.filter(({ status }) => status !== "RESOLVED");
  return {
    open: open.length,
    hardBlocks: open.filter(({ actionType }) => actionType === "HARD_BLOCK").length,
    pendingAppeals: input.incidents
      .flatMap(({ appeals }) => appeals)
      .filter(({ status }) => status === "OPEN" || status === "UNDER_REVIEW")
      .length,
    calculatedRatings: input.ratingStatuses.filter(
      (status) => status === "CALCULATED",
    ).length,
    totalWarehouses: input.warehouseStats.total,
    verifiedWarehouses: input.warehouseStats.verified,
  };
}
