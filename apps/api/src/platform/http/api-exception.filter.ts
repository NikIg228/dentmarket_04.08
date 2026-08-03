import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

const statusCodes: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "UNPROCESSABLE_ENTITY",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_SERVER_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

type ErrorContext = {
  path: string;
  requestId?: string;
  production: boolean;
  timestamp?: string;
};

function objectResponse(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function toApiErrorResponse(exception: unknown, context: ErrorContext) {
  const httpException = exception instanceof HttpException ? exception : null;
  const statusCode = httpException?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;
  const raw = httpException?.getResponse();
  const payload = objectResponse(raw);
  const rawMessage = typeof raw === "string" ? raw : payload?.message;
  const message =
    statusCode === HttpStatus.INTERNAL_SERVER_ERROR
      ? "Internal server error"
      : typeof rawMessage === "string" || Array.isArray(rawMessage)
        ? rawMessage
        : httpException?.message || "Request failed";
  const error = typeof payload?.error === "string" ? payload.error : undefined;
  const explicitCode = typeof payload?.code === "string" ? payload.code : undefined;
  const standardKeys = new Set(["statusCode", "message", "error", "code"]);
  const detailEntries = payload
    ? Object.entries(payload).filter(([key]) => !standardKeys.has(key))
    : [];
  const details =
    statusCode !== HttpStatus.INTERNAL_SERVER_ERROR && detailEntries.length > 0
      ? Object.fromEntries(detailEntries)
      : statusCode !== HttpStatus.INTERNAL_SERVER_ERROR && payload && rawMessage === undefined
        ? payload
        : undefined;

  return {
    statusCode,
    code: explicitCode ?? statusCodes[statusCode] ?? `HTTP_${statusCode}`,
    message,
    ...(error ? { error } : {}),
    ...(details ? { details } : {}),
    path: context.path,
    ...(context.requestId ? { requestId: context.requestId } : {}),
    timestamp: context.timestamp ?? new Date().toISOString(),
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestIdHeader = response.getHeader("x-request-id");
    const requestId =
      typeof requestIdHeader === "string" ? requestIdHeader : undefined;
    const body = toApiErrorResponse(exception, {
      path: request.originalUrl || request.url,
      requestId,
      production: process.env.NODE_ENV === "production",
    });
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `${request.method} ${request.originalUrl || request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(body.statusCode).json(body);
  }
}
