import { Module } from "@nestjs/common";
import { GeoCommerceController } from "./geo-commerce.controller";
import { GeoCommerceService } from "./geo-commerce.service";

@Module({
  controllers: [GeoCommerceController],
  providers: [GeoCommerceService],
  exports: [GeoCommerceService],
})
export class GeoCommerceModule {}
