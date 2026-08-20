import { BadRequestException, Body, Controller, Headers, HttpCode, Param, Post, RawBody } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IntegrationWebhooksService } from "./integration-webhooks.service";
import { INTEGRATION_WEBHOOK_RATE_LIMIT, INTEGRATION_WEBHOOK_RATE_TTL_MS } from "./integration-webhooks.constants";

@ApiTags("integration-webhooks")
@Controller("integrations/webhooks")
export class IntegrationWebhooksController {
  constructor(private readonly webhooks: IntegrationWebhooksService) {}

  @Post(":endpointId")
  @Throttle({ ip: { limit: INTEGRATION_WEBHOOK_RATE_LIMIT, ttl: INTEGRATION_WEBHOOK_RATE_TTL_MS } })
  @HttpCode(202)
  ingest(@Param("endpointId") endpointId: string, @Body() body: unknown, @RawBody() rawBody: Buffer | undefined, @Headers() headers: Record<string, string | string[] | undefined>) {
    if (!rawBody) throw new BadRequestException("Raw webhook body is required");
    return this.webhooks.ingest(endpointId, body, rawBody, headers);
  }
}
