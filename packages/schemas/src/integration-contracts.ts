import { z } from "zod";

const cursorSchema = z.record(z.string(), z.unknown());
const rawRecordSchema = z.record(z.string(), z.unknown());
const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "Expected a non-negative decimal string");
const nonNegativeIntegerStringSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)$/, "Expected a non-negative integer string");
const gtinSchema = z.string().trim().regex(/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/);

export const connectorCatalogItemSchema = z.object({
  externalId: z.string().trim().min(1).max(500),
  name: z.string().trim().min(1).max(500),
  supplierSku: z.string().trim().max(240).nullable().optional(),
  manufacturerSku: z.string().trim().max(240).nullable().optional(),
  gtin: gtinSchema.nullable().optional(),
  brand: z.string().trim().max(240).nullable().optional(),
  manufacturer: z.string().trim().max(240).nullable().optional(),
  unit: z.string().trim().max(80).nullable().optional(),
  packageQuantity: decimalStringSchema.nullable().optional(),
  raw: rawRecordSchema.default({}),
});

export const connectorCatalogResultSchema = z.object({
  items: z.array(connectorCatalogItemSchema).max(1_000),
  nextCursor: cursorSchema.nullable().optional(),
});

export const connectorPriceItemSchema = z.object({
  externalId: z.string().trim().min(1).max(500),
  priceTypeId: z.string().trim().max(240).nullable().optional(),
  priceTypeName: z.string().trim().max(240).nullable().optional(),
  valueMinor: nonNegativeIntegerStringSchema,
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  raw: rawRecordSchema.default({}),
});

export const connectorPriceResultSchema = z.object({
  items: z.array(connectorPriceItemSchema).max(2_000),
  nextCursor: cursorSchema.nullable().optional(),
});

export const connectorInventoryItemSchema = z.object({
  externalId: z.string().trim().min(1).max(500),
  externalWarehouseId: z.string().trim().max(500).nullable().optional(),
  stock: decimalStringSchema,
  reserved: decimalStringSchema,
  available: decimalStringSchema,
  raw: rawRecordSchema.default({}),
});

export const connectorInventoryResultSchema = z.object({
  items: z.array(connectorInventoryItemSchema).max(2_000),
  nextCursor: cursorSchema.nullable().optional(),
});

export const connectorOrderResultSchema = z.object({
  accepted: z.boolean().optional(),
  externalOrderId: z.string().trim().max(500).nullable().optional(),
  externalDocumentId: z.string().trim().max(500).nullable().optional(),
  data: rawRecordSchema.default({}),
});

export const connectorReservationResultSchema = z.object({
  externalId: z.string().trim().max(500).nullable().optional(),
  externalReservationId: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["ACTIVE", "RELEASED", "FAILED"]).optional(),
  data: rawRecordSchema.default({}),
});

export const connectorDiagnosticResultSchema = z.object({
  ok: z.boolean().optional(),
  message: z.string().trim().max(2_000).optional(),
  data: rawRecordSchema.default({}),
});

export type ConnectorAgentJobType =
  | "TEST_CONNECTION"
  | "DISCOVER"
  | "FULL_SYNC"
  | "INCREMENTAL_SYNC"
  | "CATALOG_SYNC"
  | "PRICE_SYNC"
  | "INVENTORY_SYNC"
  | "ORDER_EXPORT"
  | "RESERVATION_CREATE"
  | "RESERVATION_RELEASE"
  | "WEBHOOK_PROCESS"
  | "RECONCILIATION";

export function connectorAgentJobResultSchema(jobType: ConnectorAgentJobType) {
  switch (jobType) {
    case "CATALOG_SYNC":
      return connectorCatalogResultSchema;
    case "PRICE_SYNC":
      return connectorPriceResultSchema;
    case "INVENTORY_SYNC":
      return connectorInventoryResultSchema;
    case "ORDER_EXPORT":
      return connectorOrderResultSchema;
    case "RESERVATION_CREATE":
    case "RESERVATION_RELEASE":
      return connectorReservationResultSchema;
    case "FULL_SYNC":
    case "INCREMENTAL_SYNC":
      return z.union([
        connectorCatalogResultSchema,
        connectorPriceResultSchema,
        connectorInventoryResultSchema,
      ]);
    case "TEST_CONNECTION":
    case "DISCOVER":
    case "WEBHOOK_PROCESS":
    case "RECONCILIATION":
      return connectorDiagnosticResultSchema;
  }
}

export function parseConnectorAgentJobResult(
  jobType: ConnectorAgentJobType,
  result: unknown,
) {
  return connectorAgentJobResultSchema(jobType).safeParse(result);
}

export type ConnectorCatalogResult = z.infer<typeof connectorCatalogResultSchema>;
export type ConnectorPriceResult = z.infer<typeof connectorPriceResultSchema>;
export type ConnectorInventoryResult = z.infer<typeof connectorInventoryResultSchema>;
export type ConnectorOrderResult = z.infer<typeof connectorOrderResultSchema>;
export type ConnectorReservationResult = z.infer<typeof connectorReservationResultSchema>;
