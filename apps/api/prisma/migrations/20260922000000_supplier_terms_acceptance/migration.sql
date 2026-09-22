CREATE TYPE "SupplierAdmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TABLE "SupplierTermsAcceptance" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "bundleHash" VARCHAR(64) NOT NULL,
  "documentsSnapshot" JSONB NOT NULL,
  "organizationSnapshot" JSONB NOT NULL,
  "organizationVersion" INTEGER NOT NULL,
  "representativeName" TEXT NOT NULL,
  "representativeAuthority" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidenceSnapshot" JSONB NOT NULL,
  "admissionStatus" "SupplierAdmissionStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" UUID,
  "reviewedAt" TIMESTAMP(3),
  "reviewReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "SupplierTermsAcceptance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierTermsAcceptance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierTermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupplierTermsAcceptance_org_bundle_version_key" ON "SupplierTermsAcceptance"("organizationId", "bundleHash", "organizationVersion");
CREATE INDEX "SupplierTermsAcceptance_admissionStatus_acceptedAt_idx" ON "SupplierTermsAcceptance"("admissionStatus", "acceptedAt");
