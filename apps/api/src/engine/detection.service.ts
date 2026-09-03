import type { Prisma, PrismaClient, RecoveryCase } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";

const ACTOR = "detection.service";

// Statuses that mean "this RecoveryCase is already being worked" --
// used to avoid creating a duplicate case for the same payment.
const ACTIVE_CASE_STATUSES = [
  "DETECTED",
  "RECOMMENDED",
  "APPROVED",
  "EXECUTING",
  "RECOVERED",
] as const;

/**
 * Detects revenue at risk for a given payment. For Milestone 2,
 * detection is simply Payment.status === FAILED.
 *
 * Finds (or creates) a RecoveryCase for the payment:
 *   1. Look up the payment.
 *   2. Confirm it is FAILED.
 *   3. Check for an existing active RecoveryCase for this payment.
 *   4. If none exists, create one and write an AuditLog entry.
 */
export async function detectFailedPayment(
  prisma: PrismaClient,
  paymentId: string
): Promise<RecoveryCase> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) {
    throw new Error(`Payment not found: ${paymentId}`);
  }

  if (payment.status !== "FAILED") {
    throw new Error(
      `Payment ${paymentId} is not FAILED (status=${payment.status}); nothing to recover`
    );
  }

  const existingCase = await prisma.recoveryCase.findFirst({
    where: {
      paymentId: payment.id,
      status: { in: [...ACTIVE_CASE_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingCase) {
    return existingCase;
  }

  const recoveryCase = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.recoveryCase.create({
      data: {
        merchantId: payment.merchantId,
        customerId: payment.customerId,
        sourceType: "PAYMENT",
        paymentId: payment.id,
        status: "DETECTED",
        amount: payment.amount,
        currency: payment.currency,
      },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: created.id,
      eventType: "RECOVERY_CASE_CREATED",
      actor: ACTOR,
      metadata: {
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        failureReason: payment.failureReason,
      },
    });

    return created;
  });

  return recoveryCase;
}
