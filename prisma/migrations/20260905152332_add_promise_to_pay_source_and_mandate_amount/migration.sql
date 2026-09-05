/*
  Warnings:

  - A unique constraint covering the columns `[externalId]` on the table `WebhookEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'WEBHOOK_RECEIVED';
ALTER TYPE "AuditEventType" ADD VALUE 'WEBHOOK_DUPLICATE_IGNORED';
ALTER TYPE "AuditEventType" ADD VALUE 'WEBHOOK_SIGNATURE_INVALID';
ALTER TYPE "AuditEventType" ADD VALUE 'WEBHOOK_PROCESSED';

-- AlterEnum
ALTER TYPE "RecoveryCaseSourceType" ADD VALUE 'PROMISE_TO_PAY';

-- AlterTable
ALTER TABLE "Mandate" ADD COLUMN     "amount" INTEGER,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR';

-- AlterTable
ALTER TABLE "RecoveryAttempt" ADD COLUMN     "providerMetadata" JSONB,
ADD COLUMN     "providerReference" TEXT;

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE INDEX "RecoveryAttempt_providerReference_idx" ON "RecoveryAttempt"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_externalId_key" ON "WebhookEvent"("externalId");
