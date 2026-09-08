import { Module } from "@nestjs/common";
import { SmartRecommendationService } from "./smart-recommendation.service";
import { SmartRecommendationsController } from "./smart-recommendations.controller";

@Module({
  controllers: [SmartRecommendationsController],
  providers: [SmartRecommendationService],
  exports: [SmartRecommendationService],
})
export class SmartRecommendationsModule {}
