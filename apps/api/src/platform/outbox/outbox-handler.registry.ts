import { Injectable } from "@nestjs/common";
import type { OutboxEvent } from "@prisma/client";

export type OutboxMessage = Pick<
  OutboxEvent,
  "id" | "aggregateType" | "aggregateId" | "eventType" | "payload" | "createdAt"
>;

export type OutboxHandler = {
  name: string;
  supports: (event: OutboxMessage) => boolean;
  handle: (event: OutboxMessage) => Promise<void>;
};

@Injectable()
export class OutboxHandlerRegistry {
  private readonly handlers = new Map<string, OutboxHandler>();

  register(handler: OutboxHandler) {
    if (this.handlers.has(handler.name)) {
      throw new Error(`Outbox handler ${handler.name} is already registered`);
    }
    this.handlers.set(handler.name, handler);
  }

  resolve(event: OutboxMessage) {
    return [...this.handlers.values()].filter((handler) =>
      handler.supports(event),
    );
  }
}
