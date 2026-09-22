import { Module } from "@nestjs/common";
import { PublicCatalogController, SearchController } from "./search.controller";
import { SearchProjectionService } from "./search-projection.service";
import { SearchService } from "./search.service";
import { SearchAnalyticsService } from "./search-analytics.service";
import { MarketplaceAgreementsModule } from "../agreements/marketplace-agreements.module";

@Module({ imports: [MarketplaceAgreementsModule], controllers: [SearchController, PublicCatalogController], providers: [SearchService, SearchProjectionService, SearchAnalyticsService], exports: [SearchProjectionService, SearchAnalyticsService] })
export class SearchModule {}
