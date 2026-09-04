import type { Prisma, PrismaClient, RecoveryAttempt } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { AdapterExecutionResult } from "./types.js";

const ACTOR = "verification.service";

/**
 * Verifies the outcome of a RecoveryAttempt and applies it to both
 * the RecoveryAttempt and its parent RecoveryCase.
 *
 * For the SimulatedAdapter, SUCCESS always maps to RECOVERED and
 * stores the original payment amount as recoveredAmount -- unchanged
 * from Milestone 2.
 *
 * Milestone 4 addition: this function is now also called a second
 * time, later, by workers/webhook.worker.ts when a Razorpay
 * `payment_link.paid` (or `payment_link.expired`/`cancelled`) webhook
 * arrives -- the first call (from recovery.orchestrator.ts, status
 * "EXECUTING") records that a Payment Link was created; the second
 * call (from the webhook worker, status "RECOVERED" or "FAILED")
 * finalizes the outcome once Razorpay confirms it. Both calls go
 * through this same function and the same RECOVERY_VERIFIED audit
 * event, so no new verification path was introduced for the async
 * case -- it reuses this one twice.
 *
 * `providerReference` / `providerMetadata`, when present on the
 * execution result, are persisted onto the RecoveryAttempt so it can
 * be looked back up by an external identifier (e.g. a Razorpay
 * Payment Link id) later. They are intentionally omitted from the
 * update when absent (rather than written as null) so a second call
 * that doesn't repeat them does not clobber what the first call set.
 */
export async function verifyOutcome(
  prisma: PrismaClient,
  attempt: RecoveryAttempt,
  executionResult: AdapterExecutionResult
): Promise<RecoveryAttempt> {
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updatedAttempt = await tx.recoveryAttempt.update({
      where: { id: attempt.id },
      data: {
        status: executionResult.status,
        recoveredAmount: executionResult.recoveredAmount,
        ...(executionResult.providerReference !== undefined
          ? { providerReference: executionResult.providerReference }
          : {}),
        ...(executionResult.providerMetadata !== undefined
          ? { providerMetadata: executionResult.providerMetadata as Prisma.InputJsonValue }
          : {}),
      },
    });

    await tx.recoveryCase.update({
      where: { id: attempt.recoveryCaseId },
      data: {
        status: executionResult.status,
        recoveredAmount: executionResult.recoveredAmount,
      },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: attempt.recoveryCaseId,
      eventType: "RECOVERY_VERIFIED",
      actor: ACTOR,
      metadata: {
        recoveryAttemptId: attempt.id,
        adapterName: executionResult.adapterName,
        status: executionResult.status,
        recoveredAmount: executionResult.recoveredAmount,
        providerReference: executionResult.providerReference ?? null,
      },
    });

    return updatedAttempt;
  });

  return updated;
}
