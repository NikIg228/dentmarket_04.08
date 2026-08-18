import { describe, expect, it, vi } from "vitest";
import { PermanentOutboxError } from "../../platform/outbox/outbox.errors";
import { OutboxHandlerRegistry } from "../../platform/outbox/outbox-handler.registry";
import { PaymentCapturedOutboxHandler } from "./payment-captured.outbox-handler";

const capturedEvent = {
  id: "event-1",
  aggregateType: "PaymentIntent",
  aggregateId: "payment-1",
  eventType: "PaymentCaptured",
  payload: {},
  createdAt: new Date("2026-08-18T10:00:00.000Z"),
};

describe("PaymentCapturedOutboxHandler", () => {
  it("enqueues one idempotent export per matching connection", async () => {
    const enqueue = vi.fn().mockResolvedValue({ id: "job-1" });
    const prisma = {
      paymentIntent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "payment-1",
          allocations: [
            {
              supplierOrder: {
                id: "order-1",
                supplierOrganizationId: "supplier-1",
                items: [{ offerId: "offer-1", warehouseId: "warehouse-1" }],
              },
            },
          ],
        }),
      },
      integrationDataBinding: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { connectionId: "connection-1" },
            { connectionId: "connection-1" },
            { connectionId: "connection-2" },
          ]),
      },
    };
    const registry = new OutboxHandlerRegistry();
    const handler = new PaymentCapturedOutboxHandler(
      prisma as never,
      { enqueue } as never,
      registry,
    );
    handler.onModuleInit();

    const registered = registry.resolve(capturedEvent);
    expect(registered).toHaveLength(1);
    await registered[0]!.handle(capturedEvent);

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledWith(
      "connection-1",
      expect.objectContaining({
        type: "ORDER_EXPORT",
        idempotencyKey: "order-export:order-1:payment:payment-1",
      }),
      "OUTBOX",
    );
  });

  it("classifies a missing payment aggregate as permanent", async () => {
    const handler = new PaymentCapturedOutboxHandler(
      {
        paymentIntent: { findUnique: vi.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
      new OutboxHandlerRegistry(),
    );

    await expect(handler.handle(capturedEvent)).rejects.toBeInstanceOf(
      PermanentOutboxError,
    );
  });
});
