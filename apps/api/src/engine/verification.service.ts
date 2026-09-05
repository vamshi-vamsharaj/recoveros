import type { Prisma, PrismaClient, RecoveryAttempt } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { AdapterExecutionResult } from "./types.js";

const ACTOR = "verification.service";


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
