import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { describe, expect, it, vi } from "vitest";
import { ApiExceptionFilter, toApiErrorResponse } from "./api-exception.filter";

const context = {
  path: "/api/catalog/search?limit=0",
  requestId: "request-1",
  production: false,
  timestamp: "2026-08-03T00:00:00.000Z",
};

describe("API exception envelope", () => {
  it("wraps object-shaped Zod validation details", () => {
    const response = toApiErrorResponse(
      new BadRequestException({
        formErrors: [],
        fieldErrors: { limit: ["Too small"] },
      }),
      context,
    );

    expect(response).toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: "Bad Request Exception",
      requestId: "request-1",
      details: { formErrors: [], fieldErrors: { limit: ["Too small"] } },
    });
  });

  it("preserves safe HTTP messages", () => {
    expect(
      toApiErrorResponse(new ForbiddenException("Wrong tenant"), context),
    ).toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "Wrong tenant",
    });
  });

  it("does not expose an unexpected error", () => {
    expect(
      toApiErrorResponse(new Error("database password leaked"), context),
    ).toMatchObject({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
    expect(
      JSON.stringify(
        toApiErrorResponse(new Error("database password leaked"), context),
      ),
    ).not.toContain("database password");
  });

  it("uses a stable rate-limit code", () => {
    expect(toApiErrorResponse(new ThrottlerException(), context)).toMatchObject(
      {
        statusCode: 429,
        code: "RATE_LIMIT_EXCEEDED",
      },
    );
  });

  it("normalizes scoped throttler retry headers", () => {
    const headers = new Map<string, unknown>([
      ["x-request-id", "request-1"],
      ["Retry-After-ip", 17],
    ]);
    const json = vi.fn();
    const response = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: unknown) => headers.set(name, value),
      status: () => ({ json }),
    } as any;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "GET",
          originalUrl: "/api/test",
          url: "/api/test",
        }),
        getResponse: () => response,
      }),
    } as any;

    new ApiExceptionFilter().catch(new ThrottlerException(), host);

    expect(headers.get("Retry-After")).toBe(17);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "RATE_LIMIT_EXCEEDED", statusCode: 429 }),
    );
  });
});
