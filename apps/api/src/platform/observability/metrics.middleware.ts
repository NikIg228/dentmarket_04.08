import type { NextFunction, Request, Response } from "express";
import type { MetricsService } from "./metrics.service";

export function normalizedRoute(request: Request) {
  const routePath = request.route?.path;
  if (typeof routePath !== "string" || routePath.length === 0)
    return "unmatched";
  const base = request.baseUrl === "/" ? "" : request.baseUrl;
  return `${base}${routePath}`.replace(/\/{2,}/g, "/");
}

export function httpMetricsMiddleware(metrics: MetricsService) {
  return (request: Request, response: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    response.once("finish", () => {
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      metrics.observeHttpRequest({
        method: request.method,
        route: normalizedRoute(request),
        statusCode: response.statusCode,
        durationSeconds,
      });
    });
    next();
  };
}
