import type { Prisma, PrismaClient, RecoveryAttempt } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { AdapterExecutionResult } from "./types.js";

const ACTOR = "verification.service";

/**
 * Verifies the outcome of a RecoveryAttempt and applies it to both
 * the RecoveryAttempt and its parent RecoveryCase. For the
 * SimulatedAdapter, SUCCESS always maps to RECOVERED and stores the
 * original payment amount as recoveredAmount.
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
      },
    });

    return updatedAttempt;
  });

  return updated;
}
