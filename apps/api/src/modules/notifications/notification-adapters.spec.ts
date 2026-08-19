import { describe, expect, it, vi } from "vitest";
import { OutboundRequestGateway } from "../../platform/security/outbound-request.gateway";
import { WebhookNotificationAdapter } from "./notification-adapters";

const message = {
  id: "notification-1",
  channel: "WEBHOOK" as const,
  destination: "https://hooks.example.test/events",
  subject: "Shipment dispatched",
  body: "Order DM-1 has shipped",
  payload: { orderId: "DM-1" },
};

describe("WebhookNotificationAdapter", () => {
  it("uses the central outbound gateway with bounded signed delivery", async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers({ "x-request-id": "request-1" }),
    });
    const adapter = new WebhookNotificationAdapter({ request });

    await expect(adapter.send(message)).resolves.toMatchObject({
      externalMessageId: "request-1",
      provider: "signed-webhook",
      response: { status: 202 },
    });
    expect(request).toHaveBeenCalledWith(
      message.destination,
      expect.objectContaining({
        method: "POST",
        timeoutMs: 10_000,
        maxResponseBytes: 64 * 1024,
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-marketplace-event-id": message.id,
        }),
      }),
    );
  });

  it("rejects private destinations before any network response", async () => {
    const adapter = new WebhookNotificationAdapter(new OutboundRequestGateway());
    await expect(
      adapter.send({ ...message, destination: "https://127.0.0.1/internal" }),
    ).rejects.toThrow("Outbound destination is not allowed");
  });

  it("rejects an invalid destination before calling the gateway", async () => {
    const request = vi.fn();
    const adapter = new WebhookNotificationAdapter({ request });
    await expect(adapter.send({ ...message, destination: "javascript:alert(1)" })).rejects.toThrow("destination is missing or invalid");
    expect(request).not.toHaveBeenCalled();
  });
});
