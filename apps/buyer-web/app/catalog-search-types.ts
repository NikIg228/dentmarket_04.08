export type SearchOffer = {
  id: string;
  variantId?: string;
  supplier: { id: string; name: string };
  priceMinor: string | null;
  currency: string | null;
  normalizedPriceMinor: string | null;
  packaging: {
    name: string | null;
    quantityInBaseUnit: string;
    unit: string | null;
  };
  available: boolean;
  confirmationMode: string;
  deliveryMethods: string[];
  supplierSku?: string | null;
  verifiedDocuments?: boolean;
  officialDistributor?: boolean;
  supplierWarranty?: boolean;
  promotion?: {
    label: string;
    percentage: number | null;
    endsAt: string | null;
  } | null;
};

export type ProductVariantOption = {
  id: string;
  sku: string | null;
  gtin: string | null;
  label: string;
  attributes?: Record<string, unknown>;
};

export type SearchMedia = {
  id: string;
  sourceUrl: string | null;
  securePath?: string | null;
  normalizedStorageKey: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  metadata?: {
    exactProductPhoto?: boolean;
    rightsStatus?: string;
    sourceImageUrl?: string | null;
  } | null;
};

export type SearchProduct = {
  id: string;
  name: string;
  description?: string | null;
  descriptionSources?: unknown;
  brand: string | null;
  manufacturer: string | null;
  media?: SearchMedia[];
  categories: Array<{ id: string; name: string }>;
  minNormalizedPriceMinor: string | null;
  isAvailable: boolean;
  reviewSummary?: { count: number; averageRating: number | null };
  variants?: ProductVariantOption[];
  offers: SearchOffer[];
  sourceUrl?: string | null;
  sourceUpdatedAt?: string | null;
  attributes?: Array<string[]>;
  photoStatus?: string;
};

export type SearchResult = {
  total: number;
  offset?: number;
  limit?: number;
  interpretedQuery?: string[];
  items: SearchProduct[];
  facets: {
    categories: Array<{ id: string; name: string; count: number }>;
    suppliers: Array<{ id: string; name: string; count: number }>;
  };
};

export type CatalogFallbackFilters = {
  unit?: string;
  packaging?: string;
  delivery?: string;
  stock?: string;
};
