import type {
  OrderDocumentResponse,
} from "@marketplace/api-client";
import type { BuyerShipment } from "../../order-shipments";

export type CartItem = {
  id: string;
  offerId: string;
  quantity: string;
  unitPriceMinor: string;
  totalPriceMinor: string;
  currency: string;
  offer?: {
    supplier?: { organization?: { displayName?: string } };
    productVariant?: { product?: { canonicalName?: string } };
  };
};

export type Cart = {
  id: string;
  status: string;
  currency: string;
  items: CartItem[];
  checkout?: { id: string } | null;
  createdAt: string;
};

export type CartLineSnapshot = {
  resolvedAt: string;
  offerVersion: number;
  source: string;
  ruleId: string | null;
  unitPriceMinor: string;
  quantity: string;
  totalPriceMinor: string;
  currency: string;
  minimumOrderQuantity: string;
  orderIncrement: string;
  availableQuantity: string | null;
  fulfillmentStatus: "AVAILABLE" | "INSUFFICIENT_STOCK" | "OUT_OF_STOCK";
};

export type CartValidationItem = {
  cartItemId: string;
  offerId: string;
  status: "UNCHANGED" | "CHANGED" | "UNAVAILABLE";
  changes: Array<"PRICE" | "STOCK" | "AVAILABILITY" | "OFFER_RULES">;
  previous: CartLineSnapshot;
  current: CartLineSnapshot | null;
  canCheckout: boolean;
  requiresAcceptance: boolean;
  message: string | null;
};

export type CartValidation = {
  cartId: string;
  cartVersion: number;
  validatedAt: string;
  hasChanges: boolean;
  requiresAcceptance: boolean;
  canCheckout: boolean;
  items: CartValidationItem[];
};

export type SupplierOrder = {
  id: string;
  buyerOrganizationId: string;
  orderNumber: string;
  status: string;
  subtotalAmountMinor: string;
  currency: string;
  createdAt: string;
  supplier: { displayName: string };
  shipments?: BuyerShipment[];
  documents?: OrderDocumentResponse[];
  items: Array<{
    id: string;
    quantity: string;
    acceptedQuantity: string | null;
    decisionReason: string | null;
    status: string;
    offer: { productVariant: { product: { canonicalName: string } } };
  }>;
};

export type ReviewDraft = {
  rating: number;
  comment: string;
};
