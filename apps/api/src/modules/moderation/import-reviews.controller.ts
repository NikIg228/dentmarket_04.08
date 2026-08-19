import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { approveImportProductCandidateSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { ApiCoreBody, ApiCoreErrors, ApiCoreProtected, ApiCoreResponse, ApiUuidParam } from "../../platform/openapi/core-openapi";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { ModerationService } from "./moderation.service";

@ApiTags("catalog-import-review")
@ApiCoreProtected()
@ApiCoreErrors()
@UseGuards(PermissionsGuard)
@Controller("moderation/import-reviews")
export class ImportReviewsController {
  constructor(private readonly moderation: ModerationService) {}

  private context(actorId: string, organizationId: string) {
    return { actorId, organizationId };
  }

  @Get()
  @RequirePermissions("catalog.candidate.moderate")
  @ApiCoreResponse("CatalogImportReviewQueueResponse")
  list(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.moderation.listImportReviews(this.context(actorId, organizationId));
  }

  @Post(":candidateId/approve")
  @RequirePermissions("catalog.candidate.moderate")
  @ApiUuidParam("candidateId", "Imported product candidate")
  @ApiCoreBody("ApproveImportProductCandidateRequest")
  @ApiCoreResponse("CatalogImportReviewResponse", 201)
  approve(@Param("candidateId") candidateId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = approveImportProductCandidateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.moderation.approveImportCandidate(candidateId, parsed.data, this.context(actorId, organizationId));
  }
}
