import type { ShipmentOrder } from "../../shipment-panel";

export type SupplierSummary = {
  id: string;
  name: string;
  city: string;
};

export type Offer = {
  id: string;
  supplierSku: string | null;
  status: string;
  sourceType: string;
  confirmationMode: string;
  productVariantId: string;
  productVariant: {
    product: {
      id: string;
      canonicalName: string;
      description: string | null;
      manufacturerSku: string | null;
      gtin: string | null;
      productType: string;
      regulatoryClass: string | null;
    };
  };
  packaging: {
    name: string;
    quantityInBaseUnit: string;
    unit: { symbol: string };
  } | null;
  publication: {
    status: string;
    marketplaceVisible: boolean;
    blockedReason: string | null;
  } | null;
  prices: Array<{
    id: string;
    amountMinor: string;
    currency: string;
    status: string;
    freshnessExpiresAt: string | null;
  }>;
  inventoryBalances: Array<{
    id: string;
    quantityAvailable: string;
    freshnessStatus: string;
    warehouse: { name: string };
  }>;
};

export type Balance = {
  id: string;
  warehouseId: string;
  productVariantId: string;
  offerId: string | null;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  safetyStock: string;
  availabilityStatus: string;
  freshnessStatus: string;
  freshnessExpiresAt: string | null;
  source: string;
  updatedAt: string;
  warehouse: { name: string; code: string };
  productVariant: { product: { canonicalName: string } };
  lots: Array<{
    id: string;
    lotNumber: string;
    expirationDate: string | null;
    quantityAvailable: string;
    status: string;
  }>;
};

export type Integration = {
  id: string;
  provider: string;
  mode: string;
  status: string;
  displayName: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  bindings: unknown[];
  _count: { jobs: number; reconciliationEntries: number };
};

export type Credential = {
  id: string;
  type: string;
  number: string;
  status: string;
  issuer: string | null;
  validTo: string | null;
  rejectionReason: string | null;
};

export type ComplianceCheck = {
  id: string;
  sellerOrganizationId: string;
  status: string;
  riskLevel: string;
  decision: string;
  evaluatedAt: string;
  reason: string | null;
  offer?: {
    productVariant?: { product?: { canonicalName?: string } };
  } | null;
};

export type DocumentRecord = {
  id: string;
  title: string;
  kind: string;
  format: string;
  status: string;
  documentNumber: string | null;
  createdAt: string;
};

export type MerchantAccount = {
  id: string;
  onboardingStatus: string;
  verificationStatus: string;
  payoutStatus: string;
  externalMerchantId: string | null;
  provider: { name: string; code: string };
};

export type FreshnessPolicy = {
  id: string;
  source: string;
  dataType: string;
  staleAfterMinutes: number;
  expirationBehavior: string;
  confirmationRequired: boolean;
  status: string;
};

export type DataOverride = {
  id: string;
  target: string;
  mode: string;
  status: string;
  reason: string;
  createdAt: string;
  validUntil: string | null;
};

export type SupplierDataSource = {
  id: string;
  name: string;
  type: string;
  status: string;
};

export type ImportBatch = {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  extractionMetadata?: {
    method?: string;
    warnings?: string[];
    textCharacters?: number;
  } | null;
  createdAt: string;
  source: { name: string };
  _count?: { rows: number };
};

export type ExternalCatalogItem = {
  id: string;
  name: string;
  supplierSku: string | null;
  matchedVariantId: string | null;
  matchedVariant?: { product: { canonicalName: string } } | null;
  productCandidate?: { id: string; status: string } | null;
  matchCandidates: Array<{
    score: string;
    reasons: string[];
    status: string;
    productVariant: {
      id: string;
      product: {
        canonicalName: string;
        brand?: { name: string } | null;
        manufacturer?: { name: string } | null;
      };
    };
  }>;
};

export type SupplierOrder = ShipmentOrder;
