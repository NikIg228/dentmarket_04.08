import { describe, expect, it, vi } from "vitest";
import { MetricsService } from "./metrics.service";

function prismaFixture() {
  return {
    outboxEvent: {
      groupBy: vi
        .fn()
        .mockResolvedValueOnce([{ status: "DEAD_LETTER", _count: { _all: 2 } }])
        .mockResolvedValueOnce([
          { eventType: "OrderCreated", _sum: { attempts: 4 } },
        ])
        .mockResolvedValueOnce([
          { eventType: "OrderCreated", _count: { _all: 2 } },
        ]),
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({ createdAt: new Date(Date.now() - 10_000) })
        .mockResolvedValueOnce(null),
      count: vi.fn().mockResolvedValue(1),
    },
    checkout: {
      groupBy: vi
        .fn()
        .mockResolvedValue([{ status: "FAILED", _count: { _all: 3 } }]),
    },
    importBatch: {
      groupBy: vi
        .fn()
        .mockResolvedValue([{ status: "ROLLING_BACK", _count: { _all: 1 } }]),
      findFirst: vi
        .fn()
        .mockResolvedValue({ updatedAt: new Date(Date.now() - 20_000) }),
    },
    auditLog: { count: vi.fn().mockResolvedValue(7) },
  };
}

describe("operational metrics", () => {
  it("renders HTTP and PostgreSQL-backed critical-flow metrics", async () => {
    const metrics = new MetricsService(prismaFixture() as never);
    metrics.observeHttpRequest({
      method: "post",
      route: "/api/carts/:cartId/checkout",
      statusCode: 500,
      durationSeconds: 0.25,
    });

    const rendered = await metrics.render();

    expect(rendered).toContain(
      'dentmarket_http_request_duration_seconds_count{service="marketplace-api",method="POST",route="/api/carts/:cartId/checkout",status_code="500"} 1',
    );
    expect(rendered).toContain(
      'dentmarket_outbox_events{status="DEAD_LETTER",service="marketplace-api"} 2',
    );
    expect(rendered).toContain(
      'dentmarket_outbox_expired_leases{service="marketplace-api"} 1',
    );
    expect(rendered).toContain(
      'dentmarket_outbox_attempts{event_type="OrderCreated",service="marketplace-api"} 4',
    );
    expect(rendered).toContain(
      'dentmarket_import_batches{status="ROLLING_BACK",service="marketplace-api"} 1',
    );
    expect(rendered).toContain(
      'dentmarket_import_rollbacks{service="marketplace-api"} 7',
    );
  });
});
