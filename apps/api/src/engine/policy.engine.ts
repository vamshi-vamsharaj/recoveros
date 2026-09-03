import type { Prisma, PrismaClient, RecoveryCase, RecoveryDecision } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { PolicyEvaluationOutcome } from "./types.js";

const ACTOR = "policy.engine";

/**
 * Deterministic policy rules, evaluated in order:
 *   1. RecoveryCase already RECOVERED           -> BLOCK
 *   2. Policy disabled                          -> BLOCK
 *   3. Recovery attempts >= policy.maxAttempts   -> BLOCK
 *   4. Otherwise                                -> APPROVE
 *
 * Every call creates exactly one PolicyEvaluation row and writes a
 * POLICY_EVALUATED audit entry. This is the only module allowed to
 * write PolicyEvaluation records -- workflow handlers must not bypass it.
 */
export async function evaluatePolicy(
  prisma: PrismaClient,
  recoveryCase: RecoveryCase,
  decision: RecoveryDecision
): Promise<PolicyEvaluationOutcome & { id: string }> {
  const policy = await prisma.policy.findFirst({
    where: { merchantId: recoveryCase.merchantId },
    orderBy: { createdAt: "asc" },
  });

  if (!policy) {
    throw new Error(
      `No policy configured for merchant ${recoveryCase.merchantId}`
    );
  }

  const attemptCount = await prisma.recoveryAttempt.count({
    where: { recoveryCaseId: recoveryCase.id },
  });

  let outcome: PolicyEvaluationOutcome;

  if (recoveryCase.status === "RECOVERED") {
    outcome = {
      result: "BLOCKED",
      reason: "RecoveryCase is already RECOVERED",
      policyId: policy.id,
    };
  } else if (!policy.isEnabled) {
    outcome = {
      result: "BLOCKED",
      reason: `Policy "${policy.name}" is disabled`,
      policyId: policy.id,
    };
  } else if (attemptCount >= policy.maxAttempts) {
    outcome = {
      result: "BLOCKED",
      reason: `Maximum recovery attempts reached (${attemptCount}/${policy.maxAttempts})`,
      policyId: policy.id,
    };
  } else {
    outcome = {
      result: "APPROVED",
      reason: `Within retry limit (${attemptCount}/${policy.maxAttempts}) and policy "${policy.name}" is enabled`,
      policyId: policy.id,
    };
  }

  const evaluation = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.policyEvaluation.create({
      data: {
        recoveryDecisionId: decision.id,
        policyId: outcome.policyId,
        result: outcome.result,
        reason: outcome.reason,
      },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: recoveryCase.id,
      eventType: "POLICY_EVALUATED",
      actor: ACTOR,
      metadata: {
        recoveryDecisionId: decision.id,
        policyId: outcome.policyId,
        result: outcome.result,
        reason: outcome.reason,
      },
    });

    return created;
  });

  return { ...outcome, id: evaluation.id };
}
