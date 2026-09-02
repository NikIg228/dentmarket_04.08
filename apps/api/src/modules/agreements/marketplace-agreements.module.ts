import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { MarketplaceAgreementsController } from "./marketplace-agreements.controller";
import { MarketplaceAgreementsService } from "./marketplace-agreements.service";
import { SignatureCallbacksController } from "./signature-callbacks.controller";
import { SignatureCallbacksService } from "./signature-callbacks.service";
import { BuyerSupplierAgreementsModule } from "../buyer-supplier-agreements/buyer-supplier-agreements.module";
import { EdsSignatureVerificationService } from "./eds-signature-verification.service";

@Module({ imports: [DocumentsModule, BuyerSupplierAgreementsModule], controllers: [MarketplaceAgreementsController, SignatureCallbacksController], providers: [MarketplaceAgreementsService, SignatureCallbacksService, EdsSignatureVerificationService], exports: [MarketplaceAgreementsService] })
export class MarketplaceAgreementsModule {}
