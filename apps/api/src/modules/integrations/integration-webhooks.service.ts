import { BadRequestException, ConflictException, Injectable, NotFoundException, PayloadTooLargeException, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { IntegrationCryptoService } from "./integration-crypto.service";
import { IntegrationJobsService } from "./integration-jobs.service";
import { asRecord } from "./adapters/integration-adapter";
import { INTEGRATION_WEBHOOK_MAX_BODY_BYTES } from "./integration-webhooks.constants";

@Injectable()
export class IntegrationWebhooksService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: IntegrationCryptoService, private readonly jobs: IntegrationJobsService) {}

  async ingest(endpointId: string, body: unknown, rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>) {
    const connection = await this.prisma.integrationConnection.findUnique({ where: { webhookEndpointId: endpointId } });
    if (!connection || connection.status === "REVOKED") throw new NotFoundException("Integration webhook endpoint not found");
    if (!rawBody) throw new BadRequestException("Raw webhook body is required");
    const payload = Array.isArray(body) ? body : asRecord(body);
    const payloadBytes = rawBody;
    if (payloadBytes.length > INTEGRATION_WEBHOOK_MAX_BODY_BYTES) throw new PayloadTooLargeException("Integration webhook payload exceeds 1 MB");
    const signature = this.header(headers, "x-marketplace-signature");
    const timestamp = this.header(headers, "x-marketplace-timestamp");
    if (!this.verify(connection.encryptedWebhookSecret, payloadBytes, signature, timestamp)) throw new UnauthorizedException("Webhook signature is invalid");
    const signatureStatus = "VERIFIED" as const;
    const payloadRecord = asRecord(Array.isArray(payload) ? payload[0] : payload);
    const externalEventId = [payloadRecord.id, payloadRecord.eventId, payloadRecord.event_id].find((value): value is string => typeof value === "string" && value.length > 0) ?? createHash("sha256").update(payloadBytes).digest("hex");
    const eventType = this.eventType(payload);
    const safeHeaders = Object.fromEntries(["user-agent", "x-event-id", "x-event-type", "x-request-id", "x-lognex-webhook-id", "x-marketplace-timestamp"].map((name) => [name, this.header(headers, name)]).filter((entry) => entry[1]));

    let event;
    try {
      event = await this.prisma.integrationWebhookEvent.create({
        data: {
          connectionId: connection.id,
          provider: connection.provider,
          externalEventId,
          eventType,
          signatureStatus,
          status: "RECEIVED",
          payload: payload as Prisma.InputJsonValue,
          headers: safeHeaders,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.integrationWebhookEvent.findUniqueOrThrow({ where: { connectionId_externalEventId: { connectionId: connection.id, externalEventId } } });
        if (existing.signatureStatus !== "VERIFIED") {
          event = await this.prisma.integrationWebhookEvent.update({
            where: { id: existing.id },
            data: {
              provider: connection.provider,
              eventType,
              signatureStatus: "VERIFIED",
              status: "RECEIVED",
              payload: payload as Prisma.InputJsonValue,
              headers: safeHeaders,
              attempt: 0,
              availableAt: new Date(),
              processedAt: null,
              lastError: null,
            },
          });
        } else {
          if (JSON.stringify(existing.payload) !== JSON.stringify(payload)) throw new ConflictException("Webhook event ID was already used with a different payload");
          event = existing;
        }
      } else {
        throw error;
      }
    }
    await this.jobs.enqueue(connection.id, { type: "WEBHOOK_PROCESS", idempotencyKey: `webhook:${externalEventId}`, payload: { webhookEventId: event.id, eventType }, maxAttempts: 5 }, "WEBHOOK");
    return { accepted: true, duplicate: event.status !== "RECEIVED", eventId: event.id };
  }

  private verify(encryptedSecret: string | null, payload: Buffer, signature?: string, timestamp?: string) {
    if (!encryptedSecret || !signature || !timestamp || !/^\d{10,13}$/.test(timestamp)) return false;
    const timestampMs = timestamp.length === 10 ? Number(timestamp) * 1_000 : Number(timestamp);
    const toleranceMs = Number(process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS ?? 300) * 1_000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > toleranceMs) return false;
    const secret = this.crypto.decrypt(encryptedSecret).secret;
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(timestamp).update(".").update(payload).digest("hex");
    const actual = signature.replace(/^sha256=/i, "").toLowerCase();
    const expectedBuffer = Buffer.from(expected, "hex");
    const actualBuffer = Buffer.from(actual, "hex");
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  private eventType(payload: unknown) {
    const record = asRecord(Array.isArray(payload) ? payload[0] : payload);
    return typeof record.action === "string" ? record.action : typeof record.eventType === "string" ? record.eventType : "unknown";
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}
