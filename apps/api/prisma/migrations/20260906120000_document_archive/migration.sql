ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'CONTRACT_ADDENDUM';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'PAYMENT_CONFIRMATION';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'REFUND_CONFIRMATION';
ALTER TYPE "DocumentKind" ADD VALUE IF NOT EXISTS 'ACCEPTANCE_ACT';

CREATE TYPE "DocumentCategory" AS ENUM (
  'CONTRACT',
  'ORDER',
  'PAYMENT',
  'SHIPMENT',
  'CLOSING',
  'COMPLIANCE',
  'OTHER'
);

CREATE TYPE "DocumentAccountingStatus" AS ENUM (
  'NOT_APPLICABLE',
  'PENDING_REVIEW',
  'REVIEWED',
  'RECONCILED',
  'DISPUTED'
);

CREATE TYPE "DocumentPartyRole" AS ENUM (
  'OWNER',
  'ISSUER',
  'RECIPIENT',
  'SIGNER',
  'PLATFORM'
);

ALTER TABLE "Document"
  ADD COLUMN "paymentIntentId" UUID,
  ADD COLUMN "paymentTransactionId" UUID,
  ADD COLUMN "refundId" UUID,
  ADD COLUMN "baseAgreementDocumentId" UUID,
  ADD COLUMN "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "accountingStatus" "DocumentAccountingStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "documentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "amountMinor" DECIMAL(20, 0),
  ADD COLUMN "currency" CHAR(3);

UPDATE "Document"
SET
  "category" = CASE
    WHEN "kind" IN ('MARKETPLACE_SUPPLIER_AGREEMENT', 'MARKETPLACE_BUYER_TERMS', 'FRAMEWORK_SUPPLY_AGREEMENT') THEN 'CONTRACT'::"DocumentCategory"
    WHEN "kind" IN ('ORDER_SPECIFICATION', 'ORDER_CONFIRMATION') THEN 'ORDER'::"DocumentCategory"
    WHEN "kind" = 'INVOICE' THEN 'PAYMENT'::"DocumentCategory"
    WHEN "kind" IN ('WAYBILL', 'ACCOMPANYING_DOCUMENT') THEN 'SHIPMENT'::"DocumentCategory"
    WHEN "kind" IN ('TAX_CLOSING_DOCUMENT', 'INSTALLATION_ACT', 'TRAINING_ACT', 'COMMISSIONING_ACT') THEN 'CLOSING'::"DocumentCategory"
    WHEN "kind" IN ('WARRANTY', 'REGISTRATION_CERTIFICATE', 'LICENSE', 'CERTIFICATE') THEN 'COMPLIANCE'::"DocumentCategory"
    ELSE 'OTHER'::"DocumentCategory"
  END,
  "accountingStatus" = CASE
    WHEN "kind" IN ('INVOICE', 'TAX_CLOSING_DOCUMENT') THEN 'PENDING_REVIEW'::"DocumentAccountingStatus"
    ELSE 'NOT_APPLICABLE'::"DocumentAccountingStatus"
  END,
  "documentDate" = COALESCE("generatedAt", "createdAt");

CREATE TABLE "DocumentParticipant" (
  "documentId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "role" "DocumentPartyRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentParticipant_pkey" PRIMARY KEY ("documentId", "organizationId", "role")
);

INSERT INTO "DocumentParticipant" ("documentId", "organizationId", "role")
SELECT "id", "ownerOrganizationId", 'OWNER'::"DocumentPartyRole"
FROM "Document"
ON CONFLICT DO NOTHING;

INSERT INTO "DocumentParticipant" ("documentId", "organizationId", "role")
SELECT d."id", so."supplierOrganizationId", 'ISSUER'::"DocumentPartyRole"
FROM "Document" d
JOIN "SupplierOrder" so ON so."id" = d."supplierOrderId"
ON CONFLICT DO NOTHING;

INSERT INTO "DocumentParticipant" ("documentId", "organizationId", "role")
SELECT d."id", so."buyerOrganizationId", 'RECIPIENT'::"DocumentPartyRole"
FROM "Document" d
JOIN "SupplierOrder" so ON so."id" = d."supplierOrderId"
ON CONFLICT DO NOTHING;

INSERT INTO "DocumentParticipant" ("documentId", "organizationId", "role")
SELECT d."id", a."supplierOrganizationId", 'ISSUER'::"DocumentPartyRole"
FROM "Document" d
JOIN "BuyerSupplierAgreement" a ON a."documentId" = d."id"
ON CONFLICT DO NOTHING;

INSERT INTO "DocumentParticipant" ("documentId", "organizationId", "role")
SELECT d."id", a."buyerOrganizationId", 'RECIPIENT'::"DocumentPartyRole"
FROM "Document" d
JOIN "BuyerSupplierAgreement" a ON a."documentId" = d."id"
ON CONFLICT DO NOTHING;

INSERT INTO "DocumentParticipant" ("documentId", "organizationId", "role")
SELECT d."id", a."operatorOrganizationId", 'PLATFORM'::"DocumentPartyRole"
FROM "Document" d
JOIN "MarketplaceAgreement" a ON a."documentId" = d."id"
ON CONFLICT DO NOTHING;

CREATE INDEX "DocumentParticipant_organizationId_documentId_idx"
  ON "DocumentParticipant"("organizationId", "documentId");
CREATE INDEX "DocumentParticipant_documentId_role_idx"
  ON "DocumentParticipant"("documentId", "role");
CREATE INDEX "Document_paymentIntentId_status_idx" ON "Document"("paymentIntentId", "status");
CREATE INDEX "Document_paymentTransactionId_idx" ON "Document"("paymentTransactionId");
CREATE INDEX "Document_refundId_idx" ON "Document"("refundId");
CREATE INDEX "Document_baseAgreementDocumentId_kind_idx" ON "Document"("baseAgreementDocumentId", "kind");
CREATE INDEX "Document_category_documentDate_idx" ON "Document"("category", "documentDate");
CREATE INDEX "Document_accountingStatus_documentDate_idx" ON "Document"("accountingStatus", "documentDate");

ALTER TABLE "DocumentParticipant"
  ADD CONSTRAINT "DocumentParticipant_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentParticipant"
  ADD CONSTRAINT "DocumentParticipant_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document"
  ADD CONSTRAINT "Document_paymentIntentId_fkey"
  FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document"
  ADD CONSTRAINT "Document_paymentTransactionId_fkey"
  FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document"
  ADD CONSTRAINT "Document_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document"
  ADD CONSTRAINT "Document_baseAgreementDocumentId_fkey"
  FOREIGN KEY ("baseAgreementDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
