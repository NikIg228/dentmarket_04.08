import { BadRequestException, Controller, Headers, Param, Post, RawBodyRequest, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { PaymentWebhooksService } from "./payment-webhooks.service";

@ApiTags("payment-webhooks")
@Controller("payments/webhooks")
export class PaymentWebhooksController {
  constructor(private readonly webhooks: PaymentWebhooksService) {}

  @Post(":providerCode")
  @Throttle({ ip: { limit: 120, ttl: 60_000 } })
  receive(@Param("providerCode") providerCode: string, @Req() request: RawBodyRequest<Request>, @Headers() headers: Record<string, string | string[] | undefined>) {
    if (!request.rawBody) throw new BadRequestException("Raw payment webhook body is required");
    return this.webhooks.receive(providerCode, request.rawBody, headers);
  }
}
