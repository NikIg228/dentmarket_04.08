import { describe, expect, it, vi } from "vitest";
import { IntegrationJobsService } from "./integration-jobs.service";

describe("IntegrationJobsService completion lease", () => {
  it("atomically replaces the agent lock before result application", async () => {
    const prisma = {
      integrationSyncJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "job-1", connectionId: "connection-1", status: "RUNNING" }),
      },
    };
    const service = new IntegrationJobsService(prisma as never);

    const result = await service.acquireCompletion("job-1", "connection-1", "agent:agent-1");

    expect(result.workerId).toMatch(/^agent:agent-1:complete:/);
    expect(prisma.integrationSyncJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", connectionId: "connection-1", status: "RUNNING", lockedBy: "agent:agent-1" },
      data: { lockedBy: result.workerId, lockedAt: expect.any(Date) },
    });
  });

  it("rejects a replay when the completion lease is already owned", async () => {
    const prisma = {
      integrationSyncJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({ id: "job-1" }),
      },
    };
    const service = new IntegrationJobsService(prisma as never);

    await expect(service.acquireCompletion("job-1", "connection-1", "agent:agent-1"))
      .rejects.toThrow("already claimed or no longer running");
  });

  it("returns the lease to the agent after a recoverable application error", async () => {
    const prisma = { integrationSyncJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const service = new IntegrationJobsService(prisma as never);

    await service.releaseCompletion("job-1", "agent:agent-1:complete:lease", "agent:agent-1");

    expect(prisma.integrationSyncJob.updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: "RUNNING", lockedBy: "agent:agent-1:complete:lease" },
      data: { lockedBy: "agent:agent-1", lockedAt: expect.any(Date) },
    });
  });
});
