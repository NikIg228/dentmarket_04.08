import { BadRequestException, Body, Controller, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { browserEdsSignatureSchema, signatureGatewayCallbackSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { SignatureCallbacksService } from "./signature-callbacks.service";

@ApiTags("signature-gateway")
@Controller("documents/signatures")
export class SignatureCallbacksController {
  constructor(private readonly callbacks: SignatureCallbacksService) {}

  @Post("callback")
  @Throttle({ ip: { limit: 120, ttl: 60_000 } })
  callback(@Body() body: unknown, @Req() request: RawBodyRequest<Request>, @Headers("x-signature-event-id") eventId: string, @Headers("x-signature-timestamp") timestamp: string, @Headers("x-signature-signature") signature: string) {
    const parsed = signatureGatewayCallbackSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    if (!request.rawBody) throw new BadRequestException("Raw callback body is required");
    return this.callbacks.process(parsed.data, request.rawBody, { eventId, timestamp, signature });
  }

  @Post("browser")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("document.sign")
  @Throttle({ ip: { limit: 20, ttl: 60_000 } })
  browser(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = browserEdsSignatureSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.callbacks.processBrowser(parsed.data, { actorId, organizationId });
  }
}
