import { describe, expect, it, vi } from "vitest";
import { OperationsService } from "./operations.service";

function prismaFixture() {
  const fixture = {
    organizationCapability: { findUnique: vi.fn() },
    productCandidate: { findMany: vi.fn().mockResolvedValue([]) },
    complianceCheck: { findMany: vi.fn().mockResolvedValue([]) },
    integrationReconciliationEntry: { findMany: vi.fn().mockResolvedValue([]) },
    importBatch: { findMany: vi.fn().mockResolvedValue([]) },
    marketplaceAgreement: { findMany: vi.fn().mockResolvedValue([]) },
    supplierOrder: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryBalance: { findMany: vi.fn().mockResolvedValue([]) },
    outboxEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "idempotency-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return Object.assign(fixture, {
    $transaction: vi.fn(async (callback: (tx: typeof fixture) => unknown) =>
      callback(fixture),
    ),
  });
}

describe("OperationsService", () => {
  it("denies the work queue to non-operators", async () => {
    const prisma = prismaFixture();
    prisma.organizationCapability.findUnique.mockResolvedValue(null);
    await expect(
      new OperationsService(prisma as never).workQueue({
        actorId: "user",
        organizationId: "org",
      }),
    ).rejects.toThrow("Marketplace operator access is required");
  });

  it("aggregates actionable business blockers into one queue", async () => {
    const prisma = prismaFixture();
    prisma.organizationCapability.findUnique.mockResolvedValue({
      organizationId: "operator",
    });
    prisma.productCandidate.findMany.mockResolvedValue([{ id: "candidate-1" }]);
    prisma.complianceCheck.findMany.mockResolvedValue([
      { id: "check-1" },
      { id: "check-2" },
    ]);
    prisma.supplierOrder.findMany.mockResolvedValue([{ id: "order-1" }]);
    const result = await new OperationsService(prisma as never).workQueue({
      actorId: "user",
      organizationId: "operator",
    });
    expect(result.totalOpenItems).toBe(4);
    expect(
      result.sections.map(({ type, count }) => ({ type, count })),
    ).toContainEqual({ type: "COMPLIANCE_REVIEW", count: 2 });
    expect(
      result.sections.map(({ type, count }) => ({ type, count })),
    ).toContainEqual({ type: "SUPPLIER_CONFIRMATION", count: 1 });
  });

  it("lists only dead-letter metadata for an authorized operator", async () => {
    const prisma = prismaFixture();
    prisma.organizationCapability.findUnique.mockResolvedValue({
      organizationId: "operator",
    });
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000101",
        aggregateType: "Order",
        aggregateId: "order-1",
        eventType: "order.created",
        status: "DEAD_LETTER",
        attempts: 10,
        maxAttempts: 10,
        availableAt: new Date("2026-08-20T10:00:00.000Z"),
        lockedAt: null,
        publishedAt: null,
        lastError: "handler failed",
        createdAt: new Date("2026-08-20T09:00:00.000Z"),
      },
    ]);
    prisma.outboxEvent.count.mockResolvedValue(1);
    const result = await new OperationsService(prisma as never).listDeadLetters(
      { limit: 50 },
      { actorId: "user", organizationId: "operator" },
    );
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      status: "DEAD_LETTER",
      eventType: "order.created",
    });
    expect(result.items[0]).not.toHaveProperty("payload");
  });

  it("replays a dead-letter event atomically with a fresh retry budget and audit record", async () => {
    const prisma = prismaFixture();
    prisma.organizationCapability.findUnique.mockResolvedValue({
      organizationId: "operator",
    });
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000101",
      aggregateType: "Order",
      aggregateId: "order-1",
      eventType: "order.created",
      status: "DEAD_LETTER",
      attempts: 10,
      maxAttempts: 10,
      availableAt: new Date("2026-08-20T10:00:00.000Z"),
      lockedAt: null,
      publishedAt: null,
      lastError: "handler failed",
      createdAt: new Date("2026-08-20T09:00:00.000Z"),
    });
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    const eventId = "00000000-0000-4000-8000-000000000101";
    const result = await new OperationsService(
      prisma as never,
    ).replayDeadLetter(
      eventId,
      {
        idempotencyKey: "replay-key-1",
        reason: "Retry after correcting the downstream handler",
      },
      { actorId: "user", organizationId: "operator" },
    );
    expect(result).toMatchObject({ eventId, status: "PENDING", attempts: 0 });
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: eventId, status: "DEAD_LETTER" },
        data: expect.objectContaining({
          status: "PENDING",
          attempts: 0,
          lastError: null,
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "outbox.dead_letter.replayed",
          entityId: eventId,
        }),
      }),
    );
    expect(prisma.idempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responseCode: 200 }),
      }),
    );
  });

  it("returns the stored response for a repeated replay key and rejects key reuse for another event", async () => {
    const prisma = prismaFixture();
    prisma.organizationCapability.findUnique.mockResolvedValue({
      organizationId: "operator",
    });
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000101",
      status: "DEAD_LETTER",
      attempts: 10,
      lastError: "handler failed",
    });
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    const service = new OperationsService(prisma as never);
    const first = await service.replayDeadLetter(
      "00000000-0000-4000-8000-000000000101",
      {
        idempotencyKey: "replay-key-1",
        reason: "Retry after correcting the downstream handler",
      },
      { actorId: "user", organizationId: "operator" },
    );
    const requestHash =
      prisma.idempotencyRecord.create.mock.calls[0][0].data.requestHash;
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash,
      responseCode: 200,
      responseBody: first,
    });
    const repeated = await service.replayDeadLetter(
      "00000000-0000-4000-8000-000000000101",
      {
        idempotencyKey: "replay-key-1",
        reason: "Retry after correcting the downstream handler",
      },
      { actorId: "user", organizationId: "operator" },
    );
    expect(repeated).toEqual(first);
    await expect(
      service.replayDeadLetter(
        "00000000-0000-4000-8000-000000000102",
        {
          idempotencyKey: "replay-key-1",
          reason: "Retry after correcting the downstream handler",
        },
        { actorId: "user", organizationId: "operator" },
      ),
    ).rejects.toThrow("already used");
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not replay a non-dead-letter event", async () => {
    const prisma = prismaFixture();
    prisma.organizationCapability.findUnique.mockResolvedValue({
      organizationId: "operator",
    });
    prisma.outboxEvent.findUnique.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000101",
      status: "PUBLISHED",
    });
    await expect(
      new OperationsService(prisma as never).replayDeadLetter(
        "00000000-0000-4000-8000-000000000101",
        {
          idempotencyKey: "replay-key-2",
          reason: "Retry after a verified handler repair",
        },
        { actorId: "user", organizationId: "operator" },
      ),
    ).rejects.toThrow("Only DEAD_LETTER");
    expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled();
  });
});
