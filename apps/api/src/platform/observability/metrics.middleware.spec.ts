import { describe, expect, it, vi } from "vitest";
import { httpMetricsMiddleware, normalizedRoute } from "./metrics.middleware";

describe("HTTP metrics middleware", () => {
  it("uses the Express route template instead of a tenant or entity id", () => {
    expect(
      normalizedRoute({
        baseUrl: "/api",
        route: { path: "/carts/:cartId/checkout" },
      } as never),
    ).toBe("/api/carts/:cartId/checkout");
    expect(normalizedRoute({ baseUrl: "", route: undefined } as never)).toBe(
      "unmatched",
    );
  });

  it("records the final response status", () => {
    const observeHttpRequest = vi.fn();
    let finish: (() => void) | undefined;
    const middleware = httpMetricsMiddleware({ observeHttpRequest } as never);
    const request = {
      method: "GET",
      baseUrl: "/api",
      route: { path: "/health" },
    };
    const response = {
      statusCode: 503,
      once: vi.fn((_event, callback) => {
        finish = callback;
      }),
    };
    const next = vi.fn();

    middleware(request as never, response as never, next);
    finish?.();

    expect(next).toHaveBeenCalledOnce();
    expect(observeHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        route: "/api/health",
        statusCode: 503,
      }),
    );
  });
});
