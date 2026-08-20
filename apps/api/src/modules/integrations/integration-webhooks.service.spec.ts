import { BadRequestException, PayloadTooLargeException, UnauthorizedException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { IntegrationWebhooksService } from "./integration-webhooks.service";

const nowSeconds = () => String(Math.floor(Date.now() / 1_000));

function fixture() {
  const connection = { id: "connection-1", provider: "CUSTOM_API", status: "ACTIVE", encryptedWebhookSecret: "encrypted-secret", configuration: {} };
  const prisma = {
    integrationConnection: { findUnique: vi.fn().mockResolvedValue(connection) },
    integrationWebhookEvent: { create: vi.fn().mockResolvedValue({ id: "event-1", status: "RECEIVED" }), findUniqueOrThrow: vi.fn() },
  };
  const crypto = { decrypt: vi.fn().mockReturnValue({ secret: "webhook-secret" }) };
  const jobs = { enqueue: vi.fn().mockResolvedValue({ id: "job-1" }) };
  return { service: new IntegrationWebhooksService(prisma as never, crypto as never, jobs as never), prisma, jobs };
}

describe("integration webhook security", () => {
  it("rejects an unsigned payload and does not enqueue it", async () => {
    const { service, jobs, prisma } = fixture();
    await expect(service.ingest("endpoint-1", { type: "catalog.updated" }, Buffer.from('{"type":"catalog.updated"}'), { "x-event-id": "event-1" })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.integrationWebhookEvent.create).not.toHaveBeenCalled();
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it("requires the wire body so signatures cannot be reconstructed from parsed JSON", async () => {
    const { service, prisma } = fixture();
    await expect(service.ingest("endpoint-1", { type: "catalog.updated" }, undefined, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.integrationWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("accepts only a current HMAC signature over the raw body", async () => {
    const { service, jobs } = fixture();
    const body = Buffer.from('{"type":"catalog.updated"}');
    const timestamp = nowSeconds();
    const signature = createHmac("sha256", "webhook-secret").update(timestamp).update(".").update(body).digest("hex");
    await expect(service.ingest("endpoint-1", JSON.parse(body.toString()), body, { "x-event-id": "event-2", "x-marketplace-timestamp": timestamp, "x-marketplace-signature": `sha256=${signature}` })).resolves.toMatchObject({ accepted: true });
    expect(jobs.enqueue).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized payloads before persistence", async () => {
    const { service, prisma } = fixture();
    await expect(service.ingest("endpoint-1", {}, Buffer.alloc(1_048_577), {})).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(prisma.integrationWebhookEvent.create).not.toHaveBeenCalled();
  });
});
