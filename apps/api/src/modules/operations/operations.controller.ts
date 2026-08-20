import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  outboxDeadLetterQuerySchema,
  outboxEventIdSchema,
  outboxReplaySchema,
} from "@marketplace/schemas";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import {
  ApiCoreBody,
  ApiCoreErrors,
  ApiCoreProtected,
  ApiCoreQuery,
  ApiCoreResponse,
  ApiUuidParam,
} from "../../platform/openapi/core-openapi";
import { OperationsService } from "./operations.service";

@ApiTags("marketplace-operations")
@ApiCoreProtected()
@ApiCoreErrors()
@UseGuards(PermissionsGuard)
@Controller("operations")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("work-queue")
  @RequirePermissions("organization.view")
  workQueue(
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.operations.workQueue({ actorId, organizationId });
  }

  @Get("outbox/dead-letter")
  @ApiCoreQuery("OutboxDeadLetterQuery")
  @ApiCoreResponse("OutboxDeadLetterListResponse")
  @RequirePermissions("operations.outbox.view")
  deadLetters(
    @Query() query: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    const parsed = outboxDeadLetterQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.operations.listDeadLetters(parsed.data, {
      actorId,
      organizationId,
    });
  }

  @Post("outbox/dead-letter/:eventId/replay")
  @ApiUuidParam("eventId", "Dead-letter outbox event identifier")
  @ApiCoreBody("OutboxReplayRequest")
  @ApiCoreResponse("OutboxReplayResponse", 200)
  @RequirePermissions("operations.outbox.replay")
  replayDeadLetter(
    @Param("eventId") eventId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    const eventIdResult = outboxEventIdSchema.safeParse(eventId);
    if (!eventIdResult.success)
      throw new BadRequestException(eventIdResult.error.flatten());
    const parsed = outboxReplaySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.operations.replayDeadLetter(eventId, parsed.data, {
      actorId,
      organizationId,
    });
  }
}
