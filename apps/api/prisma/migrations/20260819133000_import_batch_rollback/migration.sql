ALTER TYPE "ImportBatchStatus" ADD VALUE 'ROLLING_BACK';
ALTER TYPE "ImportBatchStatus" ADD VALUE 'ROLLED_BACK';
ALTER TYPE "ImportRowStatus" ADD VALUE 'ROLLED_BACK';
ALTER TYPE "ProductCandidateStatus" ADD VALUE 'ROLLED_BACK';

ALTER TABLE "ImportBatch"
ADD COLUMN "rollbackReason" TEXT,
ADD COLUMN "rollbackEvidence" JSONB,
ADD COLUMN "rolledBackAt" TIMESTAMP(3),
ADD COLUMN "rolledBackById" UUID;
