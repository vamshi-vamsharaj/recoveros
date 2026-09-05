import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { RecoveryAdapter } from "../adapters/recovery.adapter.js";
import { SimulatedAdapter } from "../adapters/simulated.adapter.js";
import { RazorpayAdapter } from "../adapters/razorpay.adapter.js";
import { executeApprovedRecovery, type OrchestratorResult } from "./recovery.orchestrator.js";

const ACTOR = "approval-service";

/**
 * Same env-gated adapter selection every workflow handler already
 * uses (see workflows/payment-degradation.handler.ts and siblings).
 * Duplicated here rather than imported from a handler because none of
 * the handlers export it, and this module has no workflow-specific
 * logic to pick between -- a human operator approving a case doesn't
 * need to know which workflow originally created it, only which
 * RecoveryDecision and PolicyEvaluation are already on file for it.
 */
function selectAdapter(): RecoveryAdapter {
  return process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new RazorpayAdapter()
    : new SimulatedAdapter();
}

async function loadPendingCase(prisma: PrismaClient, recoveryCaseId: string) {
  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id: recoveryCaseId },
  });

  if (!recoveryCase) {
    throw new Error(`RecoveryCase not found: ${recoveryCaseId}`);
  }

  if (recoveryCase.status !== "PENDING_APPROVAL") {
    throw new Error(
      `RecoveryCase ${recoveryCaseId} is not awaiting approval (status=${recoveryCase.status})`
    );
  }

  // The most recent RecoveryDecision is the one the Approval Gate
  // paused on -- runRecoveryOrchestrator creates exactly one decision
  // per invocation, so "most recent" and "the one awaiting approval"
  // are the same thing for a case currently PENDING_APPROVAL.
  const decision = await prisma.recoveryDecision.findFirst({
    where: { recoveryCaseId },
    orderBy: { createdAt: "desc" },
    include: { policyEvaluation: true },
  });

  if (!decision || !decision.policyEvaluation) {
    throw new Error(
      `RecoveryCase ${recoveryCaseId} is PENDING_APPROVAL but has no RecoveryDecision with a PolicyEvaluation on file`
    );
  }

  return { recoveryCase, decision, policyEvaluation: decision.policyEvaluation };
}

/**
 * A human operator approves a PENDING_APPROVAL case. Resumes exactly
 * where runRecoveryOrchestrator left off -- re-uses the existing
 * RecoveryDecision and PolicyEvaluation, does not re-run the
 * DecisionProvider or Policy Engine, and executes through the same
 * executeApprovedRecovery() path the automatic flow uses.
 */
export async function approveRecoveryCase(
  prisma: PrismaClient,
  recoveryCaseId: string
): Promise<OrchestratorResult> {
  const { recoveryCase, decision, policyEvaluation } = await loadPendingCase(
    prisma,
    recoveryCaseId
  );

  await writeAuditLog(prisma, {
    recoveryCaseId,
    eventType: "APPROVAL_GRANTED",
    actor: ACTOR,
    metadata: {
      recoveryDecisionId: decision.id,
      policyEvaluationId: policyEvaluation.id,
    },
  });

  return executeApprovedRecovery(
    prisma,
    recoveryCase,
    decision,
    policyEvaluation.id,
    selectAdapter()
  );
}

/**
 * A human operator rejects a PENDING_APPROVAL case. No adapter is
 * invoked and no RecoveryAttempt is created -- the case ends at
 * REJECTED, distinct from BLOCKED (an automatic Policy Engine
 * decision) so the audit trail is honest about who made the call.
 */
export async function rejectRecoveryCase(
  prisma: PrismaClient,
  recoveryCaseId: string,
  reason?: string
): Promise<{ recoveryCaseId: string; status: "REJECTED" }> {
  const { decision, policyEvaluation } = await loadPendingCase(prisma, recoveryCaseId);

  await prisma.recoveryCase.update({
    where: { id: recoveryCaseId },
    data: { status: "REJECTED" },
  });

  await writeAuditLog(prisma, {
    recoveryCaseId,
    eventType: "APPROVAL_REJECTED",
    actor: ACTOR,
    metadata: {
      recoveryDecisionId: decision.id,
      policyEvaluationId: policyEvaluation.id,
      reason: reason ?? "Rejected by operator",
    },
  });

  return { recoveryCaseId, status: "REJECTED" };
}
