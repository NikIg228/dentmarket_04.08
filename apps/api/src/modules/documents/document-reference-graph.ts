import { Prisma } from "@prisma/client";
import { ConflictException } from "@nestjs/common";

const orderSelect = { id: true, supplierOrganizationId: true, buyerOrganizationId: true, checkoutId: true, paymentStatus: true } as const;
const intentSelect = { id: true, status: true, buyerOrganizationId: true, checkoutId: true, allocations: { select: { id: true, status: true, recipientOrganizationId: true, supplierOrderId: true } } } as const;
const versionSelect = { ownerOrganizationId: true, checkoutId: true, supplierOrderId: true, shipmentId: true, paymentIntentId: true, paymentTransactionId: true, refundId: true, baseAgreementDocumentId: true } as const;

// Validation facts only. Callers must not expose these additional relations.
export const documentReferenceInclude = Prisma.validator<Prisma.DocumentInclude>()({
  checkout: { select: { id: true, buyerOrganizationId: true } },
  supplierOrder: { select: orderSelect },
  shipment: { select: { id: true, supplierOrderId: true, supplierOrder: { select: orderSelect } } },
  paymentIntent: { select: intentSelect },
  paymentTransaction: { select: { id: true, status: true, type: true, requestPayload: true, paymentIntentId: true, paymentIntent: { select: intentSelect }, paymentAllocation: { select: { recipientOrganizationId: true, supplierOrderId: true } } } },
  refund: { select: { id: true, paymentIntentId: true, supplierOrderId: true, paymentIntent: { select: { buyerOrganizationId: true, checkoutId: true } }, paymentAllocation: { select: { recipientOrganizationId: true } } } },
  baseAgreementDocument: { select: { ownerOrganizationId: true, category: true, participants: { select: { organizationId: true } }, buyerSupplierAgreement: { select: { supplierOrganizationId: true, buyerOrganizationId: true } }, marketplaceAgreement: { select: { supplierOrganizationId: true, operatorOrganizationId: true } } } },
  previousVersion: { select: versionSelect },
  nextVersions: { select: versionSelect },
});

export type ReferenceIds = {
  ownerOrganizationId: string;
  checkoutId?: string | null;
  supplierOrderId?: string | null;
  shipmentId?: string | null;
  paymentIntentId?: string | null;
  paymentTransactionId?: string | null;
  refundId?: string | null;
  baseAgreementDocumentId?: string | null;
};
type Order = { id?: string; supplierOrganizationId: string; buyerOrganizationId: string; checkoutId: string | null; paymentStatus?: string };
type Intent = { id?: string; status?: string; buyerOrganizationId: string; checkoutId: string; allocations: Array<{ id?: string; status?: string; recipientOrganizationId: string; supplierOrderId: string }> };
export type ReferenceFacts = {
  checkout?: { id?: string; buyerOrganizationId: string } | null;
  supplierOrder?: Order | null;
  shipment?: { id?: string; supplierOrderId: string; supplierOrder: Order } | null;
  paymentIntent?: Intent | null;
  paymentTransaction?: { status?: string; type?: string; requestPayload?: unknown; paymentIntentId: string; paymentIntent: Intent; paymentAllocation: { recipientOrganizationId: string; supplierOrderId: string } | null } | null;
  refund?: { paymentIntentId: string; supplierOrderId: string; paymentIntent: { buyerOrganizationId: string; checkoutId: string }; paymentAllocation: { recipientOrganizationId: string } } | null;
};
type Agreement = {
  ownerOrganizationId: string;
  category: string;
  participants: Array<{ organizationId: string }>;
  buyerSupplierAgreement?: { buyerOrganizationId: string; supplierOrganizationId: string } | null;
  marketplaceAgreement?: { operatorOrganizationId: string; supplierOrganizationId: string } | null;
};
export type DocumentGraph = ReferenceIds & ReferenceFacts & {
  kind?: string;
  previousVersionId?: string | null;
  baseAgreementDocument?: Agreement | null;
  previousVersion?: ReferenceIds | null;
  nextVersions?: ReferenceIds[];
};

// Shared read/write invariant: a union of otherwise unrelated parties must not
// authorize a mixed graph. Do not infer access to every supplier in a checkout.
export function operationalReferenceError(input: ReferenceIds, facts: ReferenceFacts): string | null {
  const { checkout, supplierOrder: order, shipment, paymentTransaction: transaction, refund } = facts;
  const intent = facts.paymentIntent ?? (transaction ? { ...transaction.paymentIntent, id: transaction.paymentIntentId } : null);
  const relatedOrder = order ?? shipment?.supplierOrder;
  const orderId = input.supplierOrderId ?? shipment?.supplierOrderId ?? refund?.supplierOrderId ?? transaction?.paymentAllocation?.supplierOrderId;
  if (input.supplierOrderId && shipment && shipment.supplierOrderId !== input.supplierOrderId) return "Shipment belongs to another supplier order";
  if (orderId && refund && refund.supplierOrderId !== orderId) return "Refund belongs to another supplier order";
  if (orderId && transaction?.paymentAllocation && transaction.paymentAllocation.supplierOrderId !== orderId) return "Payment transaction belongs to another supplier order";
  if (input.paymentIntentId && transaction && transaction.paymentIntentId !== input.paymentIntentId) return "Payment references belong to different payment intents";
  if (intent && refund && refund.paymentIntentId !== intent.id) return "Refund belongs to another payment intent";
  if (intent && orderId && !intent.allocations.some((allocation) => allocation.supplierOrderId === orderId)) return "Payment intent does not include this supplier order";
  const checkouts = [input.checkoutId, relatedOrder?.checkoutId, intent?.checkoutId, refund?.paymentIntent.checkoutId].filter((id): id is string => Boolean(id));
  if (new Set(checkouts).size > 1) return "Document references belong to different checkouts";
  if (relatedOrder && checkouts.length && relatedOrder.checkoutId !== checkouts[0]) return "Supplier order belongs to another checkout";
  if (relatedOrder && ![relatedOrder.buyerOrganizationId, relatedOrder.supplierOrganizationId].includes(input.ownerOrganizationId)) return "Document owner is not a party to the referenced supplier order";
  // When an order establishes the supplier side, its checkout may be buyer-owned.
  const parties = [
    relatedOrder?.supplierOrganizationId, relatedOrder?.buyerOrganizationId,
    checkout?.buyerOrganizationId, intent?.buyerOrganizationId,
    transaction?.paymentAllocation?.recipientOrganizationId,
    refund?.paymentIntent.buyerOrganizationId, refund?.paymentAllocation.recipientOrganizationId,
  ].filter(Boolean);
  if (parties.length && !parties.includes(input.ownerOrganizationId)) return "Document owner is not a party to the referenced business records";
  return null;
}

const referenceKeys = ["checkoutId", "supplierOrderId", "shipmentId", "paymentIntentId", "paymentTransactionId", "refundId", "baseAgreementDocumentId"] as const;
export function sameDocumentReferences(a: ReferenceIds, b: ReferenceIds): boolean {
  return a.ownerOrganizationId === b.ownerOrganizationId && referenceKeys.every((key) => (a[key] ?? null) === (b[key] ?? null));
}

export function hasConfirmedDocumentPayment(input: ReferenceIds, facts: ReferenceFacts): boolean {
  const order = facts.supplierOrder ?? facts.shipment?.supplierOrder;
  const transaction = facts.paymentTransaction;
  const intent = facts.paymentIntent ?? transaction?.paymentIntent;
  const orderId = input.supplierOrderId ?? facts.shipment?.supplierOrderId ?? facts.refund?.supplierOrderId ?? transaction?.paymentAllocation?.supplierOrderId;
  const captured = (status?: string) => !!status && ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(status);
  if (orderId) {
    const allocation = intent?.allocations.find((item) => item.supplierOrderId === orderId);
    if (order?.paymentStatus !== "PAID" && !captured(allocation?.status)) return false;
    if (transaction) {
      if (transaction.status !== "SUCCEEDED" || transaction.type !== "CAPTURE") return false;
      if (transaction.paymentAllocation) return transaction.paymentAllocation.supplierOrderId === orderId;
      const payload = transaction.requestPayload;
      const ids = payload && typeof payload === "object" && !Array.isArray(payload) && "allocationIds" in payload ? payload.allocationIds : undefined;
      // Settlement records the captured allocation IDs. An aggregate capture for
      // another order must not certify this order, even if it was paid later.
      if (Array.isArray(ids)) return !!allocation?.id && ids.includes(allocation.id);
      return intent?.allocations.length === 1 && captured(allocation?.status);
    }
    return true;
  }
  return !!(transaction?.status === "SUCCEEDED" && transaction.type === "CAPTURE"
    || intent && (captured(intent.status) || intent.status === "PARTIALLY_CAPTURED"));
}

export function hasConsistentDocumentReferences(document: DocumentGraph): boolean {
  for (const [id, relation] of [
    [document.checkoutId, document.checkout], [document.supplierOrderId, document.supplierOrder],
    [document.shipmentId, document.shipment], [document.paymentIntentId, document.paymentIntent],
    [document.paymentTransactionId, document.paymentTransaction], [document.refundId, document.refund],
    [document.baseAgreementDocumentId, document.baseAgreementDocument], [document.previousVersionId, document.previousVersion],
  ]) if (id && !relation) return false;
  if (operationalReferenceError(document, document)) return false;
  if (document.kind === "PAYMENT_CONFIRMATION" && !hasConfirmedDocumentPayment(document, document)) return false;
  const agreement = document.baseAgreementDocument;
  if (agreement) {
    const parties = [agreement.ownerOrganizationId, ...agreement.participants.map((party) => party.organizationId),
      agreement.buyerSupplierAgreement?.buyerOrganizationId, agreement.buyerSupplierAgreement?.supplierOrganizationId,
      agreement.marketplaceAgreement?.operatorOrganizationId, agreement.marketplaceAgreement?.supplierOrganizationId];
    if (agreement.category !== "CONTRACT" || !parties.includes(document.ownerOrganizationId)) return false;
  }
  if (document.kind === "CONTRACT_ADDENDUM" && !agreement) return false;
  return [document.previousVersion, ...(document.nextVersions ?? [])]
    .every((version) => !version || sameDocumentReferences(document, version));
}

export function withoutReferenceRelations<T extends object>(document: T) {
  const { checkout: _checkout, supplierOrder: _order, shipment: _shipment,
    paymentIntent: _intent, paymentTransaction: _transaction, refund: _refund,
    baseAgreementDocument: _base, previousVersion: _previous, nextVersions: _next, ...rest
  } = document as T & Partial<Record<keyof typeof documentReferenceInclude, unknown>>;
  return rest;
}

// Fill the requested visible page across invalid legacy rows. Never filter an
// already-limited result without refilling it or returning a valid continuation.
export async function collectConsistentDocuments<T extends DocumentGraph & { id: string }>(
  fetch: (take: number, cursor?: string) => Promise<T[]>, limit: number, startCursor?: string,
): Promise<T[]> {
  const results: T[] = [];
  let cursor = startCursor;
  let scanned = 0;
  const scanLimit = Math.max(1000, limit);
  while (results.length < limit) {
    if (scanned >= scanLimit) throw new ConflictException("Document integrity scan limit reached; review inconsistent legacy documents");
    const take = Math.min(scanned === 0 ? limit : Math.max(100, limit - results.length), scanLimit - scanned);
    const rows = await fetch(take, cursor);
    scanned += rows.length;
    results.push(...rows.filter(hasConsistentDocumentReferences).slice(0, limit - results.length));
    if (rows.length < take) break;
    const next = rows.at(-1)?.id;
    if (!next || next === cursor) throw new Error("Document pagination did not advance");
    cursor = next;
  }
  return results;
}
