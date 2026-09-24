-- Additive only: existing organizations and addresses are preserved. No inferred
-- completion, synthetic contacts, or legal acceptance is backfilled.
CREATE TABLE "OrganizationProfile" (
  "organizationId" UUID NOT NULL,
  "contactName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "legalAddressId" UUID NOT NULL,
  "deliveryAddressId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "OrganizationProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationProfile_legalAddressId_fkey" FOREIGN KEY ("legalAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrganizationProfile_deliveryAddressId_fkey" FOREIGN KEY ("deliveryAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OrganizationProfile_legalAddressId_idx" ON "OrganizationProfile"("legalAddressId");
CREATE INDEX "OrganizationProfile_deliveryAddressId_idx" ON "OrganizationProfile"("deliveryAddressId");
