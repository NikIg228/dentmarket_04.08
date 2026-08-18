import { z } from "zod";

const decimalStringSchema = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const dateTimeSchema = z.iso.datetime();
const nullableDateTimeSchema = dateTimeSchema.nullable();
const currencySchema = z.string().regex(/^[A-Z]{3}$/);

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
export type SupplierOrderResponse = z.infer<typeof supplierOrderResponseSchema>;
