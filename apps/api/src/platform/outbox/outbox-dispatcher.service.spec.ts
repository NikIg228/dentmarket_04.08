import type { OutboxEvent } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { PermanentOutboxError } from "./outbox.errors";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";

const now = new Date("2026-08-18T10:00:00.000Z");

function event(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    aggregateType: "Order",
    aggregateId: "order-1",
    eventType: "OrderCreated",
    payload: { organizationId: "organization-1" },
    status: "PENDING",
    attempts: 0,
    maxAttempts: 3,
    availableAt: now,
    lockedAt: null,
    lockedBy: null,
    publishedAt: null,
    lastError: null,
    createdAt: new Date("2026-08-18T09:59:00.000Z"),
    ...overrides,
  };
}

function setup(events: OutboxEvent[], updateCounts: number[] = []) {
  const updateMany = vi.fn();
  for (const count of updateCounts) {
    updateMany.mockResolvedValueOnce({ count });
  }
  updateMany.mockResolvedValue({ count: 1 });
  const prisma = {
    outboxEvent: {
      findMany: vi.fn().mockResolvedValue(events),
      updateMany,
    },
  };
  const registry = new OutboxHandlerRegistry();
  const dispatcher = new OutboxDispatcherService(prisma as never, registry);
  return { dispatcher, prisma, registry };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("OutboxDispatcherService", () => {
  it("publishes only after every matching handler succeeds", async () => {
    const current = event();
    const { dispatcher, prisma, registry } = setup([current]);
    const notificationHandler = vi.fn().mockResolvedValue(undefined);
    const integrationHandler = vi.fn().mockResolvedValue(undefined);
    registry.register({
      name: "notifications",
      supports: () => true,
      handle: notificationHandler,
    });
    registry.register({
      name: "orders",
      supports: (message) => message.eventType === "OrderCreated",
      handle: integrationHandler,
    });

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      scanned: 1,
      published: 1,
      failed: 0,
      deadLettered: 0,
      skipped: 0,
    });
    expect(notificationHandler).toHaveBeenCalledWith(current);
    expect(integrationHandler).toHaveBeenCalledWith(current);
    expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PUBLISHED",
          lockedAt: null,
          lockedBy: null,
        }),
      }),
    );
  });

  it("schedules a retry with exponential backoff after a retryable error", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { dispatcher, prisma, registry } = setup([event()]);
    registry.register({
      name: "failing",
      supports: () => true,
      handle: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });

    await expect(dispatcher.dispatchBatch()).resolves.toMatchObject({
      failed: 1,
      deadLettered: 0,
    });
    expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          lastError: "provider unavailable",
          availableAt: new Date("2026-08-18T10:00:05.000Z"),
        }),
      }),
    );
  });

  it("dead-letters the final failed attempt", async () => {
    const { dispatcher, prisma, registry } = setup([
      event({ status: "FAILED", attempts: 2 }),
    ]);
    registry.register({
      name: "failing",
      supports: () => true,
      handle: vi.fn().mockRejectedValue(new Error("still unavailable")),
    });

    await expect(dispatcher.dispatchBatch()).resolves.toMatchObject({
      failed: 0,
      deadLettered: 1,
    });
    expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DEAD_LETTER" }),
      }),
    );
  });

  it("dead-letters permanent errors without consuming every retry", async () => {
    const { dispatcher, prisma, registry } = setup([event()]);
    registry.register({
      name: "permanent",
      supports: () => true,
      handle: vi
        .fn()
        .mockRejectedValue(new PermanentOutboxError("invalid aggregate")),
    });

    await expect(dispatcher.dispatchBatch()).resolves.toMatchObject({
      deadLettered: 1,
    });
    expect(prisma.outboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DEAD_LETTER",
          lastError: "invalid aggregate",
        }),
      }),
    );
  });

  it("reclaims a stale processing lease", async () => {
    const lockedAt = new Date("2026-08-18T09:58:00.000Z");
    const { dispatcher, prisma, registry } = setup([
      event({ status: "PROCESSING", attempts: 1, lockedAt, lockedBy: "old" }),
    ]);
    registry.register({
      name: "notifications",
      supports: () => true,
      handle: vi.fn().mockResolvedValue(undefined),
    });

    await dispatcher.dispatchBatch();
    expect(prisma.outboxEvent.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PROCESSING",
          attempts: 1,
          lockedAt,
        }),
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
  });

  it("skips an event lost to another concurrent dispatcher", async () => {
    const { dispatcher, registry } = setup([event()], [0]);
    const handler = vi.fn().mockResolvedValue(undefined);
    registry.register({
      name: "notifications",
      supports: () => true,
      handle: handler,
    });

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      scanned: 1,
      published: 0,
      failed: 0,
      deadLettered: 0,
      skipped: 1,
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
