import { BadRequestException, Body, Controller, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { generateOrderDocumentPackSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { ApiCoreBody, ApiCoreErrors, ApiCoreProtected, ApiCoreResponse, ApiUuidParam } from "../../platform/openapi/core-openapi";
import { DocumentsService } from "./documents.service";

@ApiTags("order-documents")
@ApiCoreProtected()
@ApiCoreErrors()
@UseGuards(PermissionsGuard)
@Controller("supplier-orders")
export class OrderDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post(":orderId/documents/prepare")
  @ApiUuidParam("orderId", "Supplier order identifier")
  @ApiCoreResponse("PreparedOrderDocumentsResponse", 201)
  @RequirePermissions("document.issue")
  prepare(
    @Param("orderId") orderId: string,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    return this.documents.prepareOrderDocuments(orderId, { actorId, organizationId });
  }

  @Post(":orderId/document-pack")
  @ApiUuidParam("orderId", "Supplier order identifier")
  @ApiCoreBody("GenerateOrderDocumentPackRequest")
  @ApiCoreResponse("OrderDocumentPackResponse", 201)
  @RequirePermissions("document.issue")
  generatePack(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers("x-user-id") actorId: string,
    @Headers("x-organization-id") organizationId: string,
  ) {
    const parsed = generateOrderDocumentPackSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.documents.generateOrderDocumentPack(orderId, parsed.data, {
      actorId,
      organizationId,
    });
  }
}
