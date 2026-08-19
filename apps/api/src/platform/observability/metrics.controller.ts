import {
  Controller,
  Get,
  Headers,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { environment } from "../config/environment";
import { MetricsService } from "./metrics.service";

function authorizedMetricsRequest(authorization: string | undefined) {
  const token = environment().METRICS_BEARER_TOKEN;
  if (!token || !authorization?.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

@ApiTags("observability")
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiBearerAuth("access-token")
  @ApiOkResponse({ description: "Prometheus text exposition format" })
  async scrape(
    @Headers("authorization") authorization: string | undefined,
    @Res() response: Response,
  ) {
    if (!authorizedMetricsRequest(authorization))
      throw new UnauthorizedException("Metrics credentials are invalid");
    response.type(this.metrics.contentType());
    response.send(await this.metrics.render());
  }
}
