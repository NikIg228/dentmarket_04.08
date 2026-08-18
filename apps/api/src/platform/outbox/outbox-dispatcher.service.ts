import { Injectable } from "@nestjs/common";
import type { OutboxEvent } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  OutboxHandlerRegistry,
  type OutboxMessage,
} from "./outbox-handler.registry";
import { PermanentOutboxError } from "./outbox.errors";

const DEFAULT_BATCH_SIZE = 25;
const PROCESSING_LEASE_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

type DispatchStats = {
  scanned: number;
  published: number;
  failed: number;
  deadLettered: number;
  skipped: number;
};

@Injectable()
export class OutboxDispatcherService {
  private readonly workerId = `outbox:${process.pid}:${randomUUID()}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly handlers: OutboxHandlerRegistry,
  ) {}

  async dispatchBatch(batchSize = DEFAULT_BATCH_SIZE): Promise<DispatchStats> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        OR: [
          {
            status: { in: ["PENDING", "FAILED"] },
            availableAt: { lte: now },
          },
          {
            status: "PROCESSING",
            OR: [{ lockedAt: null }, { lockedAt: { lte: staleBefore } }],
          },
        ],
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      take: batchSize,
    });
    const stats: DispatchStats = {
      scanned: events.length,
      published: 0,
      failed: 0,
      deadLettered: 0,
      skipped: 0,
    };

    for (const event of events) {
      if (event.attempts >= event.maxAttempts) {
        const exhausted = await this.markExhausted(event);
        stats.deadLettered += exhausted ? 1 : 0;
        stats.skipped += exhausted ? 0 : 1;
        continue;
      }

      const claimed = await this.claim(event, now);
      if (!claimed) {
        stats.skipped += 1;
        continue;
      }

      const attempt = event.attempts + 1;
      try {
        const matchingHandlers = this.handlers.resolve(event);
        if (matchingHandlers.length === 0) {
          throw new Error(
            `No outbox handler registered for ${event.eventType}`,
          );
        }
        for (const handler of matchingHandlers) {
          await handler.handle(event);
        }
        await this.prisma.outboxEvent.updateMany({
          where: {
            id: event.id,
            status: "PROCESSING",
            lockedBy: this.workerId,
          },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
            lastError: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
        stats.published += 1;
      } catch (error) {
        const deadLetter =
          error instanceof PermanentOutboxError || attempt >= event.maxAttempts;
        const message =
          error instanceof Error ? error.message : "Outbox dispatch failed";
        await this.prisma.outboxEvent.updateMany({
          where: {
            id: event.id,
            status: "PROCESSING",
            lockedBy: this.workerId,
          },
          data: {
            status: deadLetter ? "DEAD_LETTER" : "FAILED",
            lastError: message.slice(0, 4_000),
            availableAt: deadLetter
              ? event.availableAt
              : new Date(Date.now() + this.backoffMs(attempt)),
            lockedAt: null,
            lockedBy: null,
          },
        });
        stats.failed += deadLetter ? 0 : 1;
        stats.deadLettered += deadLetter ? 1 : 0;
      }
    }

    return stats;
  }

  private async claim(event: OutboxEvent, now: Date) {
    const claimed = await this.prisma.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: event.status,
        attempts: event.attempts,
        ...(event.status === "PROCESSING"
          ? { lockedAt: event.lockedAt }
          : { availableAt: { lte: now } }),
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        lockedAt: now,
        lockedBy: this.workerId,
      },
    });
    return claimed.count === 1;
  }

  private async markExhausted(event: OutboxEvent) {
    const result = await this.prisma.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: event.status,
        attempts: event.attempts,
      },
      data: {
        status: "DEAD_LETTER",
        lastError: event.lastError ?? "Outbox retry limit exhausted",
        lockedAt: null,
        lockedBy: null,
      },
    });
    return result.count === 1;
  }

  private backoffMs(attempt: number) {
    return Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** Math.max(0, attempt - 1));
  }
}
