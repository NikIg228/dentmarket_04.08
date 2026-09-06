import { z } from "zod";

const decimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const dateTimeSchema = z.iso.datetime();
const nullableDateTimeSchema = dateTimeSchema.nullable();
const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export const shipmentStatusSchema = z.enum([
  "DRAFT",
  "PLANNED",
  "PACKING",
  "READY",
  "DISPATCHED",
  "IN_TRANSIT",
  "PARTIALLY_DELIVERED",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "RETURNED",
]);

export const errorResponseSchema = z
  .object({
    statusCode: z.number().int(),
    code: z.string(),
    message: z.unknown(),
    error: z.string().optional(),
    details: z.unknown().optional(),
    path: z.string(),
    requestId: z.string().optional(),
    timestamp: dateTimeSchema,
  })
  .passthrough();

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  environment: z.enum(["development", "test", "production"]),
  release: z.string(),
  role: z.enum(["api", "worker", "all"]),
  capabilities: z.object({
    http: z.boolean(),
    schedules: z.boolean(),
    queueProducer: z.boolean(),
    queueConsumer: z.boolean(),
  }),
});

const dependencyHealthSchema = z
  .object({
    status: z.string(),
    error: z.string().optional(),
  })
  .passthrough();

export const readinessResponseSchema = z.object({
  status: z.literal("ready"),
  role: z.enum(["api", "worker", "all"]),
  capabilities: z.object({
    http: z.boolean(),
    schedules: z.boolean(),
    queueProducer: z.boolean(),
    queueConsumer: z.boolean(),
  }),
  requiredChecks: z.array(z.string()),
  checks: z.record(z.string(), dependencyHealthSchema),
});

export const publicCitySchema = z.object({
  id: z.uuid(),
  nameRu: z.string(),
  region: z.object({ nameRu: z.string() }),
});

export const publicCityListResponseSchema = z.array(publicCitySchema);

export const catalogVariantSchema = z.object({
  id: z.uuid(),
  sku: z.string().nullable(),
  gtin: z.string().nullable(),
  label: z.string(),
  attributes: z.record(z.string(), z.unknown()),
});

export const catalogMediaSchema = z.object({
  id: z.uuid(),
  sourceUrl: z.string().nullable(),
  securePath: z.string().nullable(),
  normalizedStorageKey: z.string().nullable(),
  altText: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  metadata: z.unknown().nullable(),
});

export const catalogSearchOfferSchema = z.object({
  id: z.uuid(),
  variantId: z.uuid(),
  supplier: z.object({ id: z.uuid(), name: z.string() }),
  priceMinor: decimalStringSchema.nullable(),
  currency: currencySchema.nullable(),
  normalizedPriceMinor: decimalStringSchema.nullable(),
  packaging: z.object({
    name: z.string().nullable(),
    quantityInBaseUnit: decimalStringSchema,
    unit: z.string().nullable(),
  }),
  available: z.boolean(),
  freshness: z.array(
    z.object({
      status: z.string(),
      updatedAt: nullableDateTimeSchema,
      cityId: z.uuid(),
    }),
  ),
  confirmationMode: z.string(),
  deliveryMethods: z.array(z.string()),
  promotion: z
    .object({
      label: z.string(),
      percentage: z.number(),
      endsAt: dateTimeSchema,
    })
    .nullable(),
});

const reviewSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  averageRating: z.number().nullable(),
});

export const catalogSearchProductSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  descriptionSources: z.unknown().nullable(),
  brand: z.string().nullable(),
  manufacturer: z.string().nullable(),
  productType: z.string(),
  regulatoryClass: z.string().nullable(),
  media: z.array(catalogMediaSchema),
  categories: z.array(z.object({ id: z.uuid(), name: z.string() })),
  minNormalizedPriceMinor: decimalStringSchema.nullable(),
  maxNormalizedPriceMinor: decimalStringSchema.nullable(),
  isAvailable: z.boolean(),
  reviewSummary: reviewSummarySchema,
  rank: z.number(),
  variants: z.array(catalogVariantSchema),
  offers: z.array(catalogSearchOfferSchema),
});

const catalogFacetSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  count: z.number().int().nonnegative(),
});

export const catalogSearchResponseSchema = z.object({
  query: z.string(),
  interpretedQuery: z.array(z.string()).optional(),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  items: z.array(catalogSearchProductSchema),
  facets: z.object({
    categories: z.array(catalogFacetSchema),
    suppliers: z.array(catalogFacetSchema),
  }),
});

export const comparedOfferSchema = z.object({
  offerId: z.uuid(),
  variantId: z.uuid(),
  supplier: z.object({ organizationId: z.uuid(), name: z.string() }),
  supplierSku: z.string().nullable(),
  price: z.object({
    amountMinor: decimalStringSchema,
    currency: currencySchema,
    source: z.string(),
    normalizedPriceMinor: decimalStringSchema,
    baseUnits: decimalStringSchema,
    normalizedUnit: z.string(),
  }),
  packaging: z
    .object({
      id: z.uuid().optional(),
      name: z.string(),
      level: z.string().optional(),
      quantityInBaseUnit: decimalStringSchema,
      unit: z.string().nullable(),
    })
    .passthrough(),
  minimumOrderQuantity: decimalStringSchema,
  orderIncrement: decimalStringSchema,
  availability: z.array(
    z.object({
      warehouseId: z.uuid(),
      warehouse: z.string(),
      cityId: z.uuid(),
      quantityAvailable: decimalStringSchema,
      updatedAt: nullableDateTimeSchema,
      freshnessExpiresAt: nullableDateTimeSchema,
    }),
  ),
  delivery: z.array(
    z.object({
      method: z.string(),
      priceType: z.string(),
      fixedAmountMinor: decimalStringSchema.nullable(),
      minLeadTimeHours: z.number().int(),
      maxLeadTimeHours: z.number().int().nullable(),
      temperatureControlled: z.boolean(),
      installationRequired: z.boolean(),
    }),
  ),
  markers: z.object({
    verifiedDocuments: z.boolean(),
    complianceRisk: z.string().nullable(),
    officialDistributor: z.boolean(),
    supplierWarranty: z.boolean(),
    requiresConfirmation: z.boolean(),
  }),
});

export const offerComparisonResponseSchema = z.object({
  product: z.object({
    id: z.uuid(),
    name: z.string(),
    brand: z.string().nullable(),
    manufacturer: z.string().nullable(),
    baseUnit: z
      .object({
        id: z.uuid(),
        code: z.string(),
        nameRu: z.string(),
        nameKk: z.string(),
        symbol: z.string(),
      })
      .passthrough()
      .nullable(),
  }),
  reviewSummary: reviewSummarySchema,
  variants: z.array(catalogVariantSchema),
  selectedVariantId: z.uuid().nullable(),
  offers: z.array(comparedOfferSchema),
  comparisonAttributes: z.array(
    z
      .object({
        scope: z.enum(["PRODUCT", "VARIANT"]),
        variantId: z.uuid().optional(),
        code: z.string(),
        name: z.string(),
        value: z.unknown(),
      })
      .passthrough(),
  ),
});

const organizationSummarySchema = z
  .object({
    id: z.uuid(),
    displayName: z.string(),
    legalName: z.string(),
    bin: z.string(),
  })
  .passthrough();

const inventoryReservationResponseSchema = z
  .object({
    id: z.uuid(),
    quantity: decimalStringSchema,
    status: z.string(),
    expiresAt: dateTimeSchema,
  })
  .passthrough();

export const cartItemResponseSchema = z
  .object({
    id: z.uuid(),
    cartId: z.uuid(),
    offerId: z.uuid(),
    quantity: decimalStringSchema,
    unitPriceMinor: decimalStringSchema,
    totalPriceMinor: decimalStringSchema,
    currency: currencySchema,
    priceSource: z.string(),
    priceRuleId: z.string().nullable(),
    pricingSnapshot: z.unknown(),
    offer: z
      .object({
        id: z.uuid(),
        supplierOrganizationId: z.uuid(),
        productVariantId: z.uuid(),
        supplier: z
          .object({ organization: organizationSummarySchema })
          .passthrough()
          .optional(),
        productVariant: z
          .object({
            product: z
              .object({ id: z.uuid(), canonicalName: z.string() })
              .passthrough(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .passthrough();

export const cartResponseSchema = z
  .object({
    id: z.uuid(),
    buyerOrganizationId: z.uuid(),
    currency: currencySchema,
    status: z.string(),
    version: z.number().int().positive(),
    createdById: z.uuid().nullable(),
    items: z.array(cartItemResponseSchema),
    checkout: z.object({ id: z.uuid() }).passthrough().nullable(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .passthrough();

export const cartListResponseSchema = z.array(cartResponseSchema);

export const cartLineSnapshotSchema = z.object({
  resolvedAt: dateTimeSchema,
  offerVersion: z.number().int().nonnegative(),
  source: z.string(),
  ruleId: z.string().nullable(),
  unitPriceMinor: decimalStringSchema,
  quantity: decimalStringSchema,
  totalPriceMinor: decimalStringSchema,
  currency: currencySchema,
  minimumOrderQuantity: decimalStringSchema,
  orderIncrement: decimalStringSchema,
  availableQuantity: decimalStringSchema.nullable(),
  fulfillmentStatus: z.enum([
    "AVAILABLE",
    "INSUFFICIENT_STOCK",
    "OUT_OF_STOCK",
  ]),
});

export const cartValidationItemSchema = z.object({
  cartItemId: z.uuid(),
  offerId: z.uuid(),
  status: z.enum(["UNCHANGED", "CHANGED", "UNAVAILABLE"]),
  changes: z.array(z.enum(["PRICE", "STOCK", "AVAILABILITY", "OFFER_RULES"])),
  previous: cartLineSnapshotSchema,
  current: cartLineSnapshotSchema.nullable(),
  canCheckout: z.boolean(),
  requiresAcceptance: z.boolean(),
  message: z.string().nullable(),
});

export const cartValidationResponseSchema = z.object({
  cartId: z.uuid(),
  cartVersion: z.number().int().positive(),
  validatedAt: dateTimeSchema,
  hasChanges: z.boolean(),
  requiresAcceptance: z.boolean(),
  canCheckout: z.boolean(),
  items: z.array(cartValidationItemSchema),
});

const checkoutCartSnapshotResponseSchema = cartResponseSchema.omit({
  checkout: true,
});

export const supplierOrderItemResponseSchema = z
  .object({
    id: z.uuid(),
    supplierOrderId: z.uuid(),
    offerId: z.uuid(),
    productVariantId: z.uuid(),
    quantity: decimalStringSchema,
    acceptedQuantity: decimalStringSchema.nullable(),
    decisionReason: z.string().nullable(),
    unitPriceMinor: decimalStringSchema,
    totalPriceMinor: decimalStringSchema,
    currency: currencySchema,
    status: z.string(),
    warehouseId: z.uuid(),
    warehouse: z
      .object({ id: z.uuid(), name: z.string(), code: z.string() })
      .passthrough()
      .optional(),
    reservation: inventoryReservationResponseSchema.nullable().optional(),
    offer: z
      .object({
        id: z.uuid(),
        productVariant: z.object({
          id: z.uuid(),
          product: z
            .object({ id: z.uuid(), canonicalName: z.string() })
            .passthrough(),
        }),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const fulfillmentStepResponseSchema = z
  .object({
    id: z.uuid(),
    shipmentId: z.uuid(),
    type: z.string(),
    status: z.string(),
    sequence: z.number().int().positive(),
    scheduledAt: nullableDateTimeSchema,
    startedAt: nullableDateTimeSchema,
    completedAt: nullableDateTimeSchema,
    notes: z.string().nullable(),
  })
  .passthrough();

export const shipmentItemResponseSchema = z
  .object({
    id: z.uuid(),
    shipmentId: z.uuid(),
    supplierOrderItemId: z.uuid(),
    quantity: decimalStringSchema,
    deliveredQuantity: decimalStringSchema,
  })
  .passthrough();

export const shipmentResponseSchema = z
  .object({
    id: z.uuid(),
    supplierOrderId: z.uuid(),
    warehouseId: z.uuid(),
    shipmentNumber: z.string(),
    method: z.string(),
    status: shipmentStatusSchema,
    trackingNumber: z.string().nullable(),
    carrierName: z.string().nullable(),
    pickup: z.boolean(),
    deliveryWindowStart: nullableDateTimeSchema,
    deliveryWindowEnd: nullableDateTimeSchema,
    recipientName: z.string(),
    recipientPhone: z.string().nullable(),
    dispatchedAt: nullableDateTimeSchema,
    deliveredAt: nullableDateTimeSchema,
    failureReason: z.string().nullable(),
    version: z.number().int().positive(),
    warehouse: z
      .object({ id: z.uuid(), name: z.string(), code: z.string() })
      .passthrough()
      .optional(),
    items: z.array(shipmentItemResponseSchema),
    fulfillmentSteps: z.array(fulfillmentStepResponseSchema),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .passthrough();

export const shipmentListResponseSchema = z.array(shipmentResponseSchema);

export const orderDocumentKindSchema = z.enum([
  "ORDER_SPECIFICATION",
  "INVOICE",
  "WAYBILL",
]);

export const generateOrderDocumentPackSchema = z.object({
  shipmentId: z.uuid(),
});

export const orderDocumentResponseSchema = z
  .object({
    id: z.uuid(),
    supplierOrderId: z.uuid(),
    shipmentId: z.uuid(),
    kind: orderDocumentKindSchema,
    format: z.enum(["PDF", "DOCX"]),
    status: z.string(),
    title: z.string(),
    documentNumber: z.string(),
    version: z.number().int().positive(),
    fileName: z.string().nullable(),
    checksumSha256: z.string().nullable(),
    generatedAt: nullableDateTimeSchema,
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .passthrough();

export const orderDocumentPackResponseSchema = z.object({
  supplierOrderId: z.uuid(),
  shipmentId: z.uuid(),
  documents: z.array(orderDocumentResponseSchema).length(3),
});

export const preparedOrderDocumentsResponseSchema = z.object({
  supplierOrderId: z.uuid(),
  documents: z.array(orderDocumentResponseSchema).length(2),
});

export const documentArchiveCategorySchema = z.enum([
  "CONTRACT",
  "ORDER",
  "PAYMENT",
  "SHIPMENT",
  "CLOSING",
  "COMPLIANCE",
  "OTHER",
]);

export const documentArchiveKindSchema = z.enum([
  "MARKETPLACE_SUPPLIER_AGREEMENT",
  "MARKETPLACE_BUYER_TERMS",
  "FRAMEWORK_SUPPLY_AGREEMENT",
  "CONTRACT_ADDENDUM",
  "ORDER_SPECIFICATION",
  "ORDER_CONFIRMATION",
  "INVOICE",
  "PAYMENT_CONFIRMATION",
  "REFUND_CONFIRMATION",
  "WAYBILL",
  "ACCEPTANCE_ACT",
  "ACCOMPANYING_DOCUMENT",
  "TAX_CLOSING_DOCUMENT",
  "INSTALLATION_ACT",
  "TRAINING_ACT",
  "WARRANTY",
  "COMMISSIONING_ACT",
  "REGISTRATION_CERTIFICATE",
  "LICENSE",
  "CERTIFICATE",
  "OTHER",
]);

export const documentArchiveAccountingStatusSchema = z.enum([
  "NOT_APPLICABLE",
  "PENDING_REVIEW",
  "REVIEWED",
  "RECONCILED",
  "DISPUTED",
]);

export const documentArchiveQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: documentArchiveCategorySchema.optional(),
  kind: documentArchiveKindSchema.optional(),
  status: z.enum(["DRAFT", "GENERATING", "GENERATED", "AWAITING_SIGNATURE", "PARTIALLY_SIGNED", "SIGNED", "REJECTED", "EXPIRED", "SUPERSEDED", "ARCHIVED", "FAILED"]).optional(),
  accountingStatus: documentArchiveAccountingStatusSchema.optional(),
  counterpartyOrganizationId: z.uuid().optional(),
  supplierOrderId: z.uuid().optional(),
  dateFrom: dateTimeSchema.optional(),
  dateTo: dateTimeSchema.optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
  message: "dateFrom must not be after dateTo",
  path: ["dateTo"],
});

export const documentArchiveParticipantSchema = z.object({
  organizationId: z.uuid(),
  role: z.enum(["OWNER", "ISSUER", "RECIPIENT", "SIGNER", "PLATFORM"]),
  organization: z.object({
    id: z.uuid(),
    displayName: z.string(),
    legalName: z.string(),
    bin: z.string(),
  }),
});

export const documentArchiveSignatureSchema = z.object({
  id: z.uuid(),
  signerOrganizationId: z.uuid().nullable(),
  signerName: z.string().nullable(),
  method: z.enum(["EDS", "EGOV_QR", "SIMPLE", "EXTERNAL", "MOCK"]),
  status: z.enum(["PENDING", "SESSION_CREATED", "SIGNED", "REJECTED", "EXPIRED", "FAILED"]),
  signedAt: nullableDateTimeSchema,
});

export const documentArchiveVersionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  status: z.string(),
  documentDate: dateTimeSchema,
  createdAt: dateTimeSchema,
});

export const documentArchiveItemSchema = z.object({
  id: z.uuid(),
  ownerOrganizationId: z.uuid(),
  category: documentArchiveCategorySchema,
  kind: documentArchiveKindSchema,
  format: z.enum(["PDF", "DOCX"]),
  source: z.enum(["GENERATED", "UPLOADED", "INTEGRATION"]),
  status: z.enum(["DRAFT", "GENERATING", "GENERATED", "AWAITING_SIGNATURE", "PARTIALLY_SIGNED", "SIGNED", "REJECTED", "EXPIRED", "SUPERSEDED", "ARCHIVED", "FAILED"]),
  accountingStatus: documentArchiveAccountingStatusSchema,
  title: z.string(),
  documentNumber: z.string(),
  documentDate: dateTimeSchema,
  amountMinor: decimalStringSchema.nullable(),
  currency: currencySchema.nullable(),
  version: z.number().int().positive(),
  fileName: z.string().nullable(),
  checksumSha256: z.string().nullable(),
  immutableAt: nullableDateTimeSchema,
  generatedAt: nullableDateTimeSchema,
  expiresAt: nullableDateTimeSchema,
  baseAgreementDocumentId: z.uuid().nullable(),
  supplierOrder: z.object({
    id: z.uuid(),
    orderNumber: z.string(),
    paymentStatus: z.string(),
    buyerOrganizationId: z.uuid(),
    supplierOrganizationId: z.uuid(),
  }).nullable(),
  paymentIntent: z.object({ id: z.uuid(), status: z.string() }).nullable(),
  paymentTransaction: z.object({ id: z.uuid(), type: z.string(), status: z.string() }).nullable(),
  refund: z.object({ id: z.uuid(), status: z.string() }).nullable(),
  participants: z.array(documentArchiveParticipantSchema),
  signatures: z.array(documentArchiveSignatureSchema),
  versions: z.array(documentArchiveVersionSchema),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

export const documentArchivePageResponseSchema = z.object({
  items: z.array(documentArchiveItemSchema),
  nextCursor: z.uuid().nullable(),
});

export const documentArchiveSummaryResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  awaitingSignature: z.number().int().nonnegative(),
  attention: z.number().int().nonnegative(),
  thisMonth: z.number().int().nonnegative(),
  byCategory: z.record(documentArchiveCategorySchema, z.number().int().nonnegative()),
});

export const supplierOrderResponseSchema = z
  .object({
    id: z.uuid(),
    checkoutId: z.uuid(),
    supplierOrganizationId: z.uuid(),
    buyerOrganizationId: z.uuid(),
    orderNumber: z.string(),
    status: z.string(),
    paymentStatus: z.string(),
    subtotalAmountMinor: decimalStringSchema,
    currency: currencySchema,
    transactionMode: z.string(),
    version: z.number().int().positive(),
    supplier: organizationSummarySchema.optional(),
    buyer: organizationSummarySchema.optional(),
    items: z.array(supplierOrderItemResponseSchema),
    shipments: z.array(shipmentResponseSchema).optional(),
    documents: z.array(orderDocumentResponseSchema).optional(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .passthrough();

export const supplierOrderListResponseSchema = z.array(
  supplierOrderResponseSchema,
);

export const checkoutResponseSchema = z
  .object({
    id: z.uuid(),
    cartId: z.uuid(),
    buyerOrganizationId: z.uuid(),
    totalAmountMinor: decimalStringSchema,
    currency: currencySchema,
    status: z.string(),
    idempotencyKey: z.string(),
    failureReason: z.string().nullable(),
    cart: checkoutCartSnapshotResponseSchema,
    supplierOrders: z.array(supplierOrderResponseSchema),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .passthrough();

export const outboxDeadLetterQuerySchema = z.object({
  eventType: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const outboxEventIdSchema = z.uuid();

export const outboxDeadLetterItemSchema = z.object({
  id: z.uuid(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  eventType: z.string(),
  status: z.literal("DEAD_LETTER"),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  availableAt: dateTimeSchema,
  lockedAt: nullableDateTimeSchema,
  publishedAt: nullableDateTimeSchema,
  lastError: z.string().nullable(),
  createdAt: dateTimeSchema,
});

export const outboxDeadLetterListResponseSchema = z.object({
  items: z.array(outboxDeadLetterItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  generatedAt: dateTimeSchema,
});

export const outboxReplaySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  reason: z.string().trim().min(10).max(500),
});

export const outboxReplayResponseSchema = z.object({
  eventId: z.uuid(),
  status: z.literal("PENDING"),
  attempts: z.literal(0),
  replayedAt: dateTimeSchema,
});

export type CatalogSearchResponse = z.infer<typeof catalogSearchResponseSchema>;
export type OfferComparisonResponse = z.infer<
  typeof offerComparisonResponseSchema
>;
export type CartResponse = z.infer<typeof cartResponseSchema>;
export type CartItemResponse = z.infer<typeof cartItemResponseSchema>;
export type CartLineSnapshotResponse = z.infer<typeof cartLineSnapshotSchema>;
export type CartValidationResponse = z.infer<
  typeof cartValidationResponseSchema
>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
export type OutboxDeadLetterQuery = z.output<
  typeof outboxDeadLetterQuerySchema
>;
export type OutboxDeadLetterQueryInput = z.input<
  typeof outboxDeadLetterQuerySchema
>;
export type OutboxDeadLetterItem = z.infer<typeof outboxDeadLetterItemSchema>;
export type OutboxDeadLetterListResponse = z.infer<
  typeof outboxDeadLetterListResponseSchema
>;
export type OutboxReplayInput = z.infer<typeof outboxReplaySchema>;
export type OutboxReplayResponse = z.infer<typeof outboxReplayResponseSchema>;
export type SupplierOrderResponse = z.infer<typeof supplierOrderResponseSchema>;
export type ShipmentResponse = z.infer<typeof shipmentResponseSchema>;
export type GenerateOrderDocumentPackRequest = z.input<
  typeof generateOrderDocumentPackSchema
>;
export type OrderDocumentResponse = z.infer<typeof orderDocumentResponseSchema>;
export type OrderDocumentPackResponse = z.infer<
  typeof orderDocumentPackResponseSchema
>;
export type DocumentArchiveQuery = z.output<typeof documentArchiveQuerySchema>;
export type DocumentArchiveQueryInput = z.input<typeof documentArchiveQuerySchema>;
export type DocumentArchiveItem = z.infer<typeof documentArchiveItemSchema>;
export type DocumentArchivePageResponse = z.infer<typeof documentArchivePageResponseSchema>;
export type DocumentArchiveSummaryResponse = z.infer<typeof documentArchiveSummaryResponseSchema>;
export type PreparedOrderDocumentsResponse = z.infer<typeof preparedOrderDocumentsResponseSchema>;
