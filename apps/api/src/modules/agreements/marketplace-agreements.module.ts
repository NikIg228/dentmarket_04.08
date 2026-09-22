import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { MarketplaceAgreementsController } from "./marketplace-agreements.controller";
import { MarketplaceAgreementsService } from "./marketplace-agreements.service";
import { SignatureCallbacksController } from "./signature-callbacks.controller";
import { SignatureCallbacksService } from "./signature-callbacks.service";
import { BuyerSupplierAgreementsModule } from "../buyer-supplier-agreements/buyer-supplier-agreements.module";
import { EdsSignatureVerificationService } from "./eds-signature-verification.service";
import { SupplierTermsController } from "./supplier-terms.controller";
import { SupplierTermsService } from "./supplier-terms.service";
import { SupplierLegalDocuments } from "./supplier-legal-documents";

@Module({ imports: [DocumentsModule, BuyerSupplierAgreementsModule], controllers: [MarketplaceAgreementsController, SignatureCallbacksController, SupplierTermsController], providers: [MarketplaceAgreementsService, SignatureCallbacksService, EdsSignatureVerificationService, SupplierTermsService, SupplierLegalDocuments], exports: [MarketplaceAgreementsService, SupplierTermsService] })
export class MarketplaceAgreementsModule {}
