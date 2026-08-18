import { applyDecorators } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiUnauthorizedResponse,
  type OpenAPIObject,
} from "@nestjs/swagger";
import type {
  ReferenceObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import {
  addCartItemSchema,
  cartItemResponseSchema,
  cartListResponseSchema,
  cartValidationResponseSchema,
  cartResponseSchema,
  catalogSearchResponseSchema,
  checkoutCartSchema,
  checkoutResponseSchema,
  compareOffersSchema,
  confirmSupplierOrderSchema,
  createShipmentSchema,
  createCartSchema,
  errorResponseSchema,
  generateOrderDocumentPackSchema,
  healthResponseSchema,
  offerComparisonResponseSchema,
  orderDocumentPackResponseSchema,
  publicCityListResponseSchema,
  readinessResponseSchema,
  searchCatalogSchema,
  supplierOrderListResponseSchema,
  supplierOrderResponseSchema,
  shipmentListResponseSchema,
  shipmentResponseSchema,
  transitionShipmentSchema,
} from "@marketplace/schemas";
import { z, type ZodType } from "zod";

const { buyerOrganizationId: _buyerOrganizationId, ...publicSearchShape } =
  searchCatalogSchema.shape;
const publicCatalogSearchQuerySchema = z.object(publicSearchShape);
const publicCompareOffersQuerySchema = compareOffersSchema.omit({
  buyerOrganizationId: true,
  productId: true,
});
const authenticatedCompareOffersQuerySchema = compareOffersSchema.omit({
  productId: true,
});
const supplierOrdersQuerySchema = z.object({ checkoutId: z.uuid().optional() });

const coreZodSchemas = {
  ErrorResponse: errorResponseSchema,
  HealthResponse: healthResponseSchema,
  ReadinessResponse: readinessResponseSchema,
  PublicCityListResponse: publicCityListResponseSchema,
  PublicCatalogSearchQuery: publicCatalogSearchQuerySchema,
  AuthenticatedCatalogSearchQuery: searchCatalogSchema,
  PublicCompareOffersQuery: publicCompareOffersQuerySchema,
  AuthenticatedCompareOffersQuery: authenticatedCompareOffersQuerySchema,
  SupplierOrdersQuery: supplierOrdersQuerySchema,
  CreateCartRequest: createCartSchema,
  AddCartItemRequest: addCartItemSchema,
  CheckoutCartRequest: checkoutCartSchema,
  ConfirmSupplierOrderRequest: confirmSupplierOrderSchema,
  CreateShipmentRequest: createShipmentSchema,
  TransitionShipmentRequest: transitionShipmentSchema,
  GenerateOrderDocumentPackRequest: generateOrderDocumentPackSchema,
  CatalogSearchResponse: catalogSearchResponseSchema,
  OfferComparisonResponse: offerComparisonResponseSchema,
  CartResponse: cartResponseSchema,
  CartListResponse: cartListResponseSchema,
  CartValidationResponse: cartValidationResponseSchema,
  CartItemResponse: cartItemResponseSchema,
  CheckoutResponse: checkoutResponseSchema,
  SupplierOrderResponse: supplierOrderResponseSchema,
  SupplierOrderListResponse: supplierOrderListResponseSchema,
  ShipmentResponse: shipmentResponseSchema,
  ShipmentListResponse: shipmentListResponseSchema,
  OrderDocumentPackResponse: orderDocumentPackResponseSchema,
} satisfies Record<string, ZodType>;

export type CoreOpenApiSchemaName = keyof typeof coreZodSchemas;

function jsonSchema(schema: ZodType, io: "input" | "output" = "output") {
  const converted = z.toJSONSchema(schema, { io }) as Record<string, unknown>;
  const { $schema: _, ...openApiSchema } = converted;
  return openApiSchema as SchemaObject;
}

export const coreOpenApiSchemas = Object.fromEntries(
  Object.entries(coreZodSchemas).map(([name, schema]) => [
    name,
    jsonSchema(
      schema,
      name.endsWith("Request") || name.endsWith("Query") ? "input" : "output",
    ),
  ]),
) as Record<CoreOpenApiSchemaName, SchemaObject>;

const schemaRef = (name: CoreOpenApiSchemaName): ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});

export function registerCoreOpenApiSchemas(document: OpenAPIObject) {
  document.openapi = "3.1.0";
  document.components = document.components ?? {};
  document.components.schemas = {
    ...(document.components.schemas ?? {}),
    ...coreOpenApiSchemas,
  };
  return document;
}

export function ApiCoreBody(name: CoreOpenApiSchemaName) {
  return ApiBody({ schema: schemaRef(name) });
}

export function ApiCoreResponse(
  name: CoreOpenApiSchemaName,
  status = 200,
  description?: string,
) {
  return ApiResponse({ status, description, schema: schemaRef(name) });
}

export function ApiCoreQuery(name: CoreOpenApiSchemaName) {
  const schema = coreOpenApiSchemas[name] as SchemaObject & {
    properties?: Record<string, SchemaObject>;
    required?: string[];
  };
  const required = new Set(schema.required ?? []);
  return applyDecorators(
    ...Object.entries(schema.properties ?? {}).map(
      ([propertyName, propertySchema]) =>
        ApiQuery({
          name: propertyName,
          required: required.has(propertyName),
          schema: propertySchema,
        }),
    ),
  );
}

export function ApiUuidParam(name: string, description?: string) {
  return ApiParam({
    name,
    description,
    schema: { type: "string", format: "uuid" },
  });
}

export function ApiCoreProtected() {
  return ApiBearerAuth("access-token");
}

export function ApiCoreErrors() {
  const response = { schema: schemaRef("ErrorResponse") };
  return applyDecorators(
    ApiBadRequestResponse(response),
    ApiUnauthorizedResponse(response),
    ApiForbiddenResponse(response),
    ApiNotFoundResponse(response),
    ApiConflictResponse(response),
  );
}

export function ApiCoreValidationErrors() {
  const response = { schema: schemaRef("ErrorResponse") };
  return applyDecorators(
    ApiBadRequestResponse(response),
    ApiNotFoundResponse(response),
  );
}
