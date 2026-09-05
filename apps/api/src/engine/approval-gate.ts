import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { PolicyEvaluationOutcome } from "./types.js";

const ACTOR = "approval-gate";

/**
 * Milestone 6: recovery actions above this amount (in the smallest
 * currency unit, e.g. paise) stop for a human operator to approve or
 * reject before the orchestrator is allowed to execute them, instead
 * of continuing automatically. Every RecoveryCase amount used by
 * existing tests and workflow fixtures is well under this threshold,
 * so the pre-existing fully-automatic path (Milestone 2-5 behavior)
 * is unchanged for them -- this only introduces a new branch, it does
 * not alter the old one.
 *
 * A fixed constant (rather than a new Policy column) was a deliberate
 * choice: Milestone 6 is scoped to avoid schema changes beyond the
 * two additive enum values this feature needed regardless. Making
 * this configurable per-merchant is a natural extension of this same
 * boundary module, not a redesign of it.
 */
export const HUMAN_APPROVAL_AMOUNT_THRESHOLD = 200_000;

export type ApprovalGateOutcome = "BLOCKED" | "PENDING_APPROVAL" | "AUTO_APPROVED";

/**
 * Boundary between a Policy Engine decision and execution.
 *
 * - Policy BLOCKED    -> outcome "BLOCKED". Unchanged from Milestone 2.
 * - Policy APPROVED, amount below the threshold -> outcome
 *   "AUTO_APPROVED". This is exactly the old passThroughApprovalGate
 *   behavior (writes ACTION_APPROVED and returns immediately).
 * - Policy APPROVED, amount at/above the threshold -> outcome
 *   "PENDING_APPROVAL". New in Milestone 6: the orchestrator stops
 *   here instead of executing, and a human operator later calls
 *   approveRecoveryCase / rejectRecoveryCase (see approval-service.ts)
 *   to resume or end the case.
 */
export async function passThroughApprovalGate(
  prisma: PrismaClient,
  recoveryCaseId: string,
  policyEvaluationId: string,
  outcome: PolicyEvaluationOutcome,
  amount: number
): Promise<ApprovalGateOutcome> {
  if (outcome.result !== "APPROVED") {
    await writeAuditLog(prisma, {
      recoveryCaseId,
      eventType: "ACTION_BLOCKED",
      actor: ACTOR,
      metadata: {
        policyEvaluationId,
        reason: outcome.reason,
      },
    });

    return "BLOCKED";
  }

  if (amount >= HUMAN_APPROVAL_AMOUNT_THRESHOLD) {
    await writeAuditLog(prisma, {
      recoveryCaseId,
      eventType: "APPROVAL_REQUESTED",
      actor: ACTOR,
      metadata: {
        policyEvaluationId,
        reason: `Amount ${amount} meets or exceeds the human-approval threshold (${HUMAN_APPROVAL_AMOUNT_THRESHOLD})`,
      },
    });

    return "PENDING_APPROVAL";
  }

  await writeAuditLog(prisma, {
    recoveryCaseId,
    eventType: "ACTION_APPROVED",
    actor: ACTOR,
    metadata: {
      policyEvaluationId,
      reason: outcome.reason,
    },
  });

  return "AUTO_APPROVED";
}
