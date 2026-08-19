import { describe, expect, it, vi } from "vitest";
import { OutboundRequestGateway } from "../../../platform/security/outbound-request.gateway";
import {
  PermanentIntegrationError,
  RetryableIntegrationError,
} from "./integration-adapter";
import { CustomApiIntegrationAdapter } from "./custom-api.adapter";

const context = {
  connectionId: "connection-1",
  credentials: { accessToken: "api-secret" },
  configuration: { baseUrl: "https://supplier.example.kz/api" },
};

describe("CustomApiIntegrationAdapter", () => {
  it("normalizes catalog, price and inventory contract pages", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ id: "p-1", name: "Композит", sku: "SKU-1" }],
            nextCursor: { page: 2 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              { externalId: "p-1", amountMinor: 125000, currency: "KZT" },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              { externalId: "p-1", warehouseId: "w-1", stock: 10, reserved: 2 },
            ],
          }),
          { status: 200 },
        ),
      );
    const adapter = new CustomApiIntegrationAdapter({ request } as never);
    await expect(adapter.pullCatalog(context)).resolves.toMatchObject({
      items: [{ externalId: "p-1", supplierSku: "SKU-1" }],
      nextCursor: { page: 2 },
    });
    await expect(adapter.pullPrices(context)).resolves.toMatchObject({
      items: [{ externalId: "p-1", valueMinor: 125000, currency: "KZT" }],
    });
    await expect(adapter.pullInventory(context)).resolves.toMatchObject({
      items: [
        {
          externalId: "p-1",
          externalWarehouseId: "w-1",
          stock: 10,
          reserved: 2,
          available: 8,
        },
      ],
    });
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "Bearer api-secret" }),
    });
  });

  it("adds idempotency and maps retryable upstream failures", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ externalId: "order-1" }), {
        status: 200,
      }),
    );
    const adapter = new CustomApiIntegrationAdapter({ request } as never);
    await expect(
      adapter.exportOrder(context, {
        idempotencyKey: "order-key",
        orderId: "local-order",
      }),
    ).resolves.toMatchObject({ externalId: "order-1" });
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "idempotency-key": "order-key" }),
    });
  });

  it("blocks private destinations before the integration can read a response", async () => {
    const adapter = new CustomApiIntegrationAdapter(
      new OutboundRequestGateway(),
    );
    await expect(
      adapter.pullCatalog({
        ...context,
        configuration: { baseUrl: "https://127.0.0.1/internal" },
      }),
    ).rejects.toMatchObject({
      constructor: PermanentIntegrationError,
      message: "CUSTOM_API outbound policy rejected the request",
    });
  });

  it("does not disclose low-level network errors through job results", async () => {
    const request = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:443"));
    const adapter = new CustomApiIntegrationAdapter({ request } as never);
    await expect(adapter.pullCatalog(context)).rejects.toMatchObject({
      constructor: RetryableIntegrationError,
      message: "CUSTOM_API network request failed",
    });
  });
});
