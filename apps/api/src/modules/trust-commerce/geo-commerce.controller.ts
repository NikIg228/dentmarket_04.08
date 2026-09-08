import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  updateDeliveryZoneGeoSchema,
  updateGeoPointSchema,
  verifyGeoPointSchema,
} from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { GeoCommerceService } from "./geo-commerce.service";

@ApiTags("geo-commerce")
@UseGuards(PermissionsGuard)
@Controller()
export class GeoCommerceController {
  constructor(private readonly geo: GeoCommerceService) {}

  private context(actorId: string, organizationId: string) {
    return { actorId, organizationId };
  }

  private parse<T>(
    schema: {
      safeParse(
        value: unknown,
      ):
        | { success: true; data: T }
        | { success: false; error: { flatten(): unknown } };
    },
    body: unknown,
  ) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return parsed.data;
  }

  @Get("geo/addresses")
  @RequirePermissions("geo.view")
  addresses(
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.geo.organizationAddresses(
      this.context(actorId, organizationId),
    );
  }

  @Patch("geo/addresses/:addressId")
  @RequirePermissions("geo.manage")
  updateAddress(
    @Param("addressId") addressId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.geo.updateAddress(
      addressId,
      this.parse(updateGeoPointSchema, body),
      this.context(actorId, organizationId),
    );
  }

  @Post("geo/addresses/:addressId/verification")
  @RequirePermissions("geo.verify")
  verifyAddress(
    @Param("addressId") addressId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.geo.verifyAddress(
      addressId,
      this.parse(verifyGeoPointSchema, body),
      this.context(actorId, organizationId),
    );
  }

  @Patch("geo/warehouses/:warehouseId")
  @RequirePermissions("geo.manage")
  updateWarehouse(
    @Param("warehouseId") warehouseId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.geo.updateWarehouse(
      warehouseId,
      this.parse(updateGeoPointSchema, body),
      this.context(actorId, organizationId),
    );
  }

  @Post("geo/warehouses/:warehouseId/verification")
  @RequirePermissions("geo.verify")
  verifyWarehouse(
    @Param("warehouseId") warehouseId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.geo.verifyWarehouse(
      warehouseId,
      this.parse(verifyGeoPointSchema, body),
      this.context(actorId, organizationId),
    );
  }

  @Patch("geo/delivery-zones/:zoneId")
  @RequirePermissions("geo.manage")
  updateZone(
    @Param("zoneId") zoneId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.geo.updateZone(
      zoneId,
      this.parse(updateDeliveryZoneGeoSchema, body),
      this.context(actorId, organizationId),
    );
  }
}
