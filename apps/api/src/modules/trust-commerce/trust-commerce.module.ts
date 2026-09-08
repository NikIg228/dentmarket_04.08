import { Module } from "@nestjs/common";
import { TrustCommerceController } from "./trust-commerce.controller";
import { TrustCommerceService } from "./trust-commerce.service";

@Module({
  controllers: [TrustCommerceController],
  providers: [TrustCommerceService],
  exports: [TrustCommerceService],
})
export class TrustCommerceModule {}
