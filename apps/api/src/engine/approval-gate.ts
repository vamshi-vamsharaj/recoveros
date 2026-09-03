import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { PolicyEvaluationOutcome } from "./types.js";

const ACTOR = "approval-gate";

/**
 * Simple boundary between a Policy Engine decision and execution.
 *
 * Milestone 2: APPROVED evaluations continue automatically; BLOCKED
 * evaluations stop the workflow. Kept as its own module (rather than
 * inlined in the orchestrator) so a manual-approval step can be
 * inserted here later without touching the orchestrator's control flow.
 */
export async function passThroughApprovalGate(
  prisma: PrismaClient,
  recoveryCaseId: string,
  policyEvaluationId: string,
  outcome: PolicyEvaluationOutcome
): Promise<boolean> {
  const approved = outcome.result === "APPROVED";

  await writeAuditLog(prisma, {
    recoveryCaseId,
    eventType: approved ? "ACTION_APPROVED" : "ACTION_BLOCKED",
    actor: ACTOR,
    metadata: {
      policyEvaluationId,
      reason: outcome.reason,
    },
  });

  return approved;
}
