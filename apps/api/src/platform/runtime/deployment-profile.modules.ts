import type { Type } from "@nestjs/common";
import { AiModule } from "../../modules/ai/ai.module";
import { BillingModule } from "../../modules/billing/billing.module";
import { PromotionsModule } from "../../modules/promotions/promotions.module";
import { SmartRecommendationsModule } from "../../modules/trust-commerce/smart-recommendations.module";
import { TrustCommerceModule } from "../../modules/trust-commerce/trust-commerce.module";
import type { MarketplaceEnvironment } from "../config/environment";

export const OUT_OF_PILOT_MODULE_NAMES = [
  "PromotionsModule",
  "BillingModule",
  "AiModule",
  "TrustCommerceModule",
  "SmartRecommendationsModule",
] as const;

export const OUT_OF_PILOT_ROUTE_PREFIXES = [
  "/promotions",
  "/billing",
  "/ai",
  "/trust",
  "/recommendations",
] as const;

const goLiveOnlyModules: Type<unknown>[] = [
  PromotionsModule,
  BillingModule,
  AiModule,
  TrustCommerceModule,
  SmartRecommendationsModule,
];

export function deploymentProfileModules(
  profile: MarketplaceEnvironment["DEPLOYMENT_PROFILE"],
): Type<unknown>[] {
  return profile === "go_live" ? [...goLiveOnlyModules] : [];
}
