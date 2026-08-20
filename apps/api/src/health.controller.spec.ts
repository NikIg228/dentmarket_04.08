import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController readiness", () => {
  it("does not return dependency error details to unauthenticated callers", async () => {
    const controller = new HealthController({
      snapshot: vi.fn().mockResolvedValue({
        status: "not_ready",
        checks: { database: { status: "down" } },
      }),
    } as never);

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        code: "SERVICE_NOT_READY",
        message: "Service dependencies are not ready",
        status: "not_ready",
      },
    });
  });
});
