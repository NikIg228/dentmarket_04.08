import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  OutboxHandlerRegistry,
  type OutboxMessage,
} from "../../platform/outbox/outbox-handler.registry";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { PermanentOutboxError } from "../../platform/outbox/outbox.errors";
import { IntegrationJobsService } from "./integration-jobs.service";

@Injectable()
export class PaymentCapturedOutboxHandler implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: IntegrationJobsService,
    private readonly handlers: OutboxHandlerRegistry,
  ) {}

  onModuleInit() {
    this.handlers.register({
      name: "integration.payment-captured",
      supports: (event) => event.eventType === "PaymentCaptured",
      handle: (event) => this.handle(event),
    });
  }

  async handle(event: OutboxMessage) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: event.aggregateId },
      include: {
        allocations: {
          include: { supplierOrder: { include: { items: true } } },
        },
      },
    });
    if (!intent) {
      throw new PermanentOutboxError(
        `Payment intent ${event.aggregateId} not found`,
      );
    }

    for (const allocation of intent.allocations) {
      const order = allocation.supplierOrder;
      const warehouseIds = order.items.map(({ warehouseId }) => warehouseId);
      const offerIds = order.items.map(({ offerId }) => offerId);
      const bindings = await this.prisma.integrationDataBinding.findMany({
        where: {
          dataType: "ORDER",
          status: "ACTIVE",
          connection: {
            supplierOrganizationId: order.supplierOrganizationId,
            status: { in: ["PENDING", "ACTIVE", "ERROR"] },
          },
          OR: [
            { warehouseId: null, offerId: null },
            { warehouseId: { in: warehouseIds } },
            { offerId: { in: offerIds } },
          ],
        },
        select: { connectionId: true },
        orderBy: { priority: "asc" },
      });
      const connectionIds = [
        ...new Set(bindings.map(({ connectionId }) => connectionId)),
      ];
      for (const connectionId of connectionIds) {
        await this.jobs.enqueue(
          connectionId,
          {
            type: "ORDER_EXPORT",
            idempotencyKey: `order-export:${order.id}:payment:${intent.id}`,
            payload: {
              supplierOrderId: order.id,
              paymentIntentId: intent.id,
              paymentCapturedAt: event.createdAt.toISOString(),
            },
            maxAttempts: 5,
          },
          "OUTBOX",
        );
      }
    }
  }
}
