import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UseGuards,
} from "@nestjs/common";
import { smartRecommendationSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { SmartRecommendationService } from "./smart-recommendation.service";

@ApiTags("smart-recommendations")
@UseGuards(PermissionsGuard)
@Controller("recommendations")
export class SmartRecommendationsController {
  constructor(private readonly recommendations: SmartRecommendationService) {}

  @Post("smart")
  @RequirePermissions("recommendation.use")
  recommend(
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    const parsed = smartRecommendationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.recommendations.recommend(parsed.data, {
      actorId,
      organizationId,
    });
  }
}
