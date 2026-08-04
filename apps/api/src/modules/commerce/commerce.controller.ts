import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  addCartItemSchema,
  checkoutCartSchema,
  confirmSupplierOrderSchema,
  createCartSchema,
} from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { CommerceService } from "./commerce.service";
import {
  ApiCoreBody,
  ApiCoreErrors,
  ApiCoreProtected,
  ApiCoreQuery,
  ApiCoreResponse,
  ApiUuidParam,
} from "../../platform/openapi/core-openapi";

@ApiTags("commerce")
@ApiCoreProtected()
@ApiCoreErrors()
@UseGuards(PermissionsGuard)
@Controller()
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}
  private context(actorId: string, organizationId: string) {
    return { actorId, organizationId };
  }

  @Get("buyers/:buyerOrganizationId/marketplace-offers")
  @RequirePermissions("order.create")
  marketplaceOffers(
    @Param("buyerOrganizationId") buyerOrganizationId: string,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.commerce.marketplaceOffers(
      buyerOrganizationId,
      this.context(actorId, organizationId),
    );
  }

  @Get("buyers/:buyerOrganizationId/carts")
  @ApiUuidParam("buyerOrganizationId", "Buyer organization identifier")
  @ApiCoreResponse("CartListResponse")
  @RequirePermissions("order.create")
  carts(
    @Param("buyerOrganizationId") buyerOrganizationId: string,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.commerce.carts(
      buyerOrganizationId,
      this.context(actorId, organizationId),
    );
  }

  @Post("buyers/:buyerOrganizationId/carts")
  @ApiUuidParam("buyerOrganizationId", "Buyer organization identifier")
  @ApiCoreBody("CreateCartRequest")
  @ApiCoreResponse("CartResponse", 201)
  @RequirePermissions("order.create")
  createCart(
    @Param("buyerOrganizationId") buyerOrganizationId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    const parsed = createCartSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.commerce.createCart(
      buyerOrganizationId,
      parsed.data,
      this.context(actorId, organizationId),
    );
  }

  @Post("carts/:cartId/items")
  @ApiUuidParam("cartId", "Cart identifier")
  @ApiCoreBody("AddCartItemRequest")
  @ApiCoreResponse("CartItemResponse", 201)
  @RequirePermissions("order.create")
  addItem(
    @Param("cartId") cartId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    const parsed = addCartItemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.commerce.addItem(
      cartId,
      parsed.data,
      this.context(actorId, organizationId),
    );
  }

  @Post("carts/:cartId/reprice")
  @ApiUuidParam("cartId", "Cart identifier")
  @ApiCoreResponse("CartResponse", 201)
  @RequirePermissions("order.create")
  reprice(
    @Param("cartId") cartId: string,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.commerce.reprice(cartId, this.context(actorId, organizationId));
  }

  @Post("carts/:cartId/validate")
  @HttpCode(200)
  @ApiUuidParam("cartId", "Cart identifier")
  @ApiCoreResponse("CartValidationResponse")
  @RequirePermissions("order.create")
  validateCart(
    @Param("cartId") cartId: string,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.commerce.validateCart(
      cartId,
      this.context(actorId, organizationId),
    );
  }

  @Post("carts/:cartId/checkout")
  @ApiUuidParam("cartId", "Cart identifier")
  @ApiCoreBody("CheckoutCartRequest")
  @ApiCoreResponse("CheckoutResponse", 201)
  @RequirePermissions("order.create")
  checkout(
    @Param("cartId") cartId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    const parsed = checkoutCartSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.commerce.checkout(
      cartId,
      parsed.data,
      this.context(actorId, organizationId),
    );
  }

  @Get("checkouts/:checkoutId")
  @ApiUuidParam("checkoutId", "Checkout identifier")
  @ApiCoreResponse("CheckoutResponse")
  @RequirePermissions("order.create")
  getCheckout(
    @Param("checkoutId") checkoutId: string,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.commerce.getCheckout(
      checkoutId,
      this.context(actorId, organizationId),
    );
  }

  @Get("supplier-orders")
  @ApiCoreQuery("SupplierOrdersQuery")
  @ApiCoreResponse("SupplierOrderListResponse")
  @RequirePermissions("order.confirm")
  supplierOrders(
    @Query("checkoutId") checkoutId: string | undefined,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.commerce.supplierOrders(
      this.context(actorId, organizationId),
      checkoutId,
    );
  }

  @Get("buyers/:buyerOrganizationId/orders")
  @ApiUuidParam("buyerOrganizationId", "Buyer organization identifier")
  @ApiCoreResponse("SupplierOrderListResponse")
  @RequirePermissions("order.create")
  buyerOrders(
    @Param("buyerOrganizationId") buyerOrganizationId: string,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.commerce.buyerOrders(
      buyerOrganizationId,
      this.context(actorId, organizationId),
    );
  }

  @Post("supplier-orders/:orderId/confirm")
  @ApiUuidParam("orderId", "Supplier order identifier")
  @ApiCoreBody("ConfirmSupplierOrderRequest")
  @ApiCoreResponse("SupplierOrderResponse", 201)
  @RequirePermissions("order.confirm")
  confirmSupplierOrder(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    const parsed = confirmSupplierOrderSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.commerce.confirmSupplierOrder(
      orderId,
      parsed.data,
      this.context(actorId, organizationId),
    );
  }
}
