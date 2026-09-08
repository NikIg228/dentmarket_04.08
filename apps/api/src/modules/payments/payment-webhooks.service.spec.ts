import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../platform/prisma/prisma.service";
import { paymentWebhookSecret, PaymentWebhooksService } from "./payment-webhooks.service";

describe("payment webhook signatures", () => {
  it("accepts only the matching HMAC-SHA256 signature", () => {
    const service = new PaymentWebhooksService({} as PrismaService, {} as never);
    const body = Buffer.from(JSON.stringify({ id: "evt-1", type: "capture.succeeded" }));
    const now = Date.UTC(2026, 6, 17, 0, 0, 0);
    const timestamp = String(Math.floor(now / 1_000));
    const signature = createHmac("sha256", "webhook-secret").update(timestamp).update(".").update(body).digest("hex");
    expect(service.verify(body, `sha256=${signature}`, "webhook-secret", timestamp, now)).toBe(true);
    expect(service.verify(body, signature.replace(/^./, signature[0] === "a" ? "b" : "a"), "webhook-secret", timestamp, now)).toBe(false);
    expect(service.verify(body, undefined, "webhook-secret", timestamp, now)).toBe(false);
    expect(service.verify(body, signature, "webhook-secret", String(Math.floor((now - 301_000) / 1_000)), now)).toBe(false);
  });

  it("binds every non-mock external provider code to the configured secret", () => {
    const originalMode = process.env.PAYMENT_PROVIDER_MODE;
    const originalExternal = process.env.PAYMENT_WEBHOOK_SECRET_EXTERNAL;
    const originalKaspi = process.env.PAYMENT_WEBHOOK_SECRET_KASPI;
    const originalMock = process.env.PAYMENT_WEBHOOK_SECRET_MOCK;
    try {
      process.env.PAYMENT_PROVIDER_MODE = "external";
      process.env.PAYMENT_WEBHOOK_SECRET_EXTERNAL = "external-secret";
      process.env.PAYMENT_WEBHOOK_SECRET_KASPI = "wrong-provider-secret";
      delete process.env.PAYMENT_WEBHOOK_SECRET_MOCK;
      expect(paymentWebhookSecret("KASPI")).toBe("external-secret");
      expect(paymentWebhookSecret("MOCK")).toBeUndefined();
    } finally {
      if (originalMode === undefined) delete process.env.PAYMENT_PROVIDER_MODE; else process.env.PAYMENT_PROVIDER_MODE = originalMode;
      if (originalExternal === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET_EXTERNAL; else process.env.PAYMENT_WEBHOOK_SECRET_EXTERNAL = originalExternal;
      if (originalKaspi === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET_KASPI; else process.env.PAYMENT_WEBHOOK_SECRET_KASPI = originalKaspi;
      if (originalMock === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET_MOCK; else process.env.PAYMENT_WEBHOOK_SECRET_MOCK = originalMock;
    }
  });
});
