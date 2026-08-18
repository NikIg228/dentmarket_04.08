ALTER TYPE "OutboxStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

ALTER TABLE "OutboxEvent"
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedBy" TEXT;

ALTER TABLE "OutboxEvent"
  ADD CONSTRAINT "OutboxEvent_attempts_nonnegative_check" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "OutboxEvent_max_attempts_positive_check" CHECK ("maxAttempts" > 0);

UPDATE "OutboxEvent"
SET
  "status" = 'FAILED',
  "availableAt" = CURRENT_TIMESTAMP,
  "lastError" = COALESCE("lastError", 'Recovered during outbox delivery semantics migration')
WHERE "status" = 'PROCESSING';
