import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";
import { ComplianceModule } from "../compliance/compliance.module";
import { MarketplaceAgreementsModule } from "../agreements/marketplace-agreements.module";
import { SearchModule } from "../search/search.module";

@Module({ imports: [AccessControlModule, SuppliersModule, ComplianceModule, MarketplaceAgreementsModule, SearchModule], controllers: [OffersController], providers: [OffersService] })
export class OffersModule {}
