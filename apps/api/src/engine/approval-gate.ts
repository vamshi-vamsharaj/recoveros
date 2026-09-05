import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { PolicyEvaluationOutcome } from "./types.js";

const ACTOR = "approval-gate";


export const HUMAN_APPROVAL_AMOUNT_THRESHOLD = 200_000;

export type ApprovalGateOutcome = "BLOCKED" | "PENDING_APPROVAL" | "AUTO_APPROVED";


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
