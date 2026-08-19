import { Injectable } from "@nestjs/common";
import {
  CheckoutStatus,
  ImportBatchStatus,
  OutboxStatus,
} from "@prisma/client";
import { collectDefaultMetrics, Gauge, Histogram, Registry } from "prom-client";
import { PrismaService } from "../prisma/prisma.service";

const OUTBOX_LEASE_SECONDS = 60;

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpRequests = new Histogram({
    name: "dentmarket_http_request_duration_seconds",
    help: "Marketplace HTTP request duration and count.",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly outboxEvents = new Gauge({
    name: "dentmarket_outbox_events",
    help: "Current transactional outbox depth by status.",
    labelNames: ["status"],
    registers: [this.registry],
  });
  private readonly outboxOldestAge = new Gauge({
    name: "dentmarket_outbox_oldest_event_age_seconds",
    help: "Age of the oldest transactional outbox event by retryable status.",
    labelNames: ["status"],
    registers: [this.registry],
  });
  private readonly outboxExpiredLeases = new Gauge({
    name: "dentmarket_outbox_expired_leases",
    help: "Number of PROCESSING outbox events whose worker lease has expired.",
    registers: [this.registry],
  });
  private readonly outboxAttempts = new Gauge({
    name: "dentmarket_outbox_attempts",
    help: "Persisted delivery attempts by outbox event type.",
    labelNames: ["event_type"],
    registers: [this.registry],
  });
  private readonly outboxErrors = new Gauge({
    name: "dentmarket_outbox_errors",
    help: "Current failed or dead-letter outbox events by event type.",
    labelNames: ["event_type"],
    registers: [this.registry],
  });
  private readonly checkoutStates = new Gauge({
    name: "dentmarket_checkouts",
    help: "Current checkout records by status.",
    labelNames: ["status"],
    registers: [this.registry],
  });
  private readonly importBatchStates = new Gauge({
    name: "dentmarket_import_batches",
    help: "Current supplier import batches by status.",
    labelNames: ["status"],
    registers: [this.registry],
  });
  private readonly importRollbackOldestAge = new Gauge({
    name: "dentmarket_import_rollback_oldest_age_seconds",
    help: "Age of the oldest import batch currently rolling back.",
    registers: [this.registry],
  });
  private readonly importRollbacks = new Gauge({
    name: "dentmarket_import_rollbacks",
    help: "Persisted successful import rollback audit records.",
    registers: [this.registry],
  });

  constructor(private readonly prisma: PrismaService) {
    this.registry.setDefaultLabels({ service: "marketplace-api" });
    collectDefaultMetrics({ prefix: "dentmarket_", register: this.registry });
  }

  observeHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
  }) {
    this.httpRequests.observe(
      {
        method: input.method.toUpperCase(),
        route: input.route,
        status_code: String(input.statusCode),
      },
      input.durationSeconds,
    );
  }

  async render() {
    await this.refreshDatabaseMetrics();
    return this.registry.metrics();
  }

  contentType() {
    return this.registry.contentType;
  }

  private ageSeconds(createdAt: Date | undefined, now: Date) {
    return createdAt
      ? Math.max(0, (now.getTime() - createdAt.getTime()) / 1_000)
      : 0;
  }

  private async refreshDatabaseMetrics() {
    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - OUTBOX_LEASE_SECONDS * 1_000);
    const [
      outboxByStatus,
      oldestPending,
      oldestFailed,
      expiredLeases,
      attemptsByType,
      errorsByType,
      checkoutByStatus,
      importByStatus,
      oldestRollback,
      rollbackCount,
    ] = await Promise.all([
      this.prisma.outboxEvent.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.outboxEvent.findFirst({
        where: { status: OutboxStatus.PENDING },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      this.prisma.outboxEvent.findFirst({
        where: { status: OutboxStatus.FAILED },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      this.prisma.outboxEvent.count({
        where: {
          status: OutboxStatus.PROCESSING,
          lockedAt: { lt: leaseCutoff },
        },
      }),
      this.prisma.outboxEvent.groupBy({
        by: ["eventType"],
        _sum: { attempts: true },
      }),
      this.prisma.outboxEvent.groupBy({
        by: ["eventType"],
        where: {
          status: { in: [OutboxStatus.FAILED, OutboxStatus.DEAD_LETTER] },
          lastError: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.checkout.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.importBatch.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.importBatch.findFirst({
        where: { status: ImportBatchStatus.ROLLING_BACK },
        orderBy: { updatedAt: "asc" },
        select: { updatedAt: true },
      }),
      this.prisma.auditLog.count({
        where: { action: "import.batch.rolled_back" },
      }),
    ]);

    this.outboxEvents.reset();
    for (const status of Object.values(OutboxStatus))
      this.outboxEvents.set({ status }, 0);
    for (const row of outboxByStatus)
      this.outboxEvents.set({ status: row.status }, row._count._all);

    this.outboxOldestAge.reset();
    this.outboxOldestAge.set(
      { status: OutboxStatus.PENDING },
      this.ageSeconds(oldestPending?.createdAt, now),
    );
    this.outboxOldestAge.set(
      { status: OutboxStatus.FAILED },
      this.ageSeconds(oldestFailed?.createdAt, now),
    );
    this.outboxExpiredLeases.set(expiredLeases);

    this.outboxAttempts.reset();
    for (const row of attemptsByType)
      this.outboxAttempts.set(
        { event_type: row.eventType },
        row._sum.attempts ?? 0,
      );
    this.outboxErrors.reset();
    for (const row of errorsByType)
      this.outboxErrors.set({ event_type: row.eventType }, row._count._all);

    this.checkoutStates.reset();
    for (const status of Object.values(CheckoutStatus))
      this.checkoutStates.set({ status }, 0);
    for (const row of checkoutByStatus)
      this.checkoutStates.set({ status: row.status }, row._count._all);

    this.importBatchStates.reset();
    for (const status of Object.values(ImportBatchStatus))
      this.importBatchStates.set({ status }, 0);
    for (const row of importByStatus)
      this.importBatchStates.set({ status: row.status }, row._count._all);
    this.importRollbackOldestAge.set(
      this.ageSeconds(oldestRollback?.updatedAt, now),
    );
    this.importRollbacks.set(rollbackCount);
  }
}
