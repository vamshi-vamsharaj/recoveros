import type { Prisma, PrismaClient, RecoveryCase, RecoveryDecision } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { DecisionProvider } from "./decision-provider.js";
import type { RecoveryAdapter } from "../adapters/recovery.adapter.js";
import { evaluatePolicy } from "./policy.engine.js";
import { passThroughApprovalGate } from "./approval-gate.js";
import { verifyOutcome } from "./verification.service.js";
import type { DecisionResult } from "./types.js";

const ACTOR = "recovery.orchestrator";

export interface OrchestratorResult {
  recoveryCaseId: string;
  status: string;
  blocked: boolean;
  blockedReason?: string;
}

/**
 * Coordinates the full recovery pipeline for an already-detected
 * RecoveryCase:
 *
 *   1. Ask the DecisionProvider for a recommendation, persist it as
 *      a RecoveryDecision.
 *   2. Run it through the Policy Engine (always creates a
 *      PolicyEvaluation).
 *   3. Pass the evaluation through the Approval Gate.
 *   4. If BLOCKED: stop. No RecoveryAttempt is created.
 *   5. If PENDING_APPROVAL (Milestone 6): stop. No RecoveryAttempt is
 *      created yet -- a human operator resumes this case later via
 *      approveRecoveryCase() / rejectRecoveryCase() in
 *      approval-service.ts, which re-uses the RecoveryDecision and
 *      PolicyEvaluation already persisted here rather than
 *      re-running the DecisionProvider or Policy Engine.
 *   6. If AUTO_APPROVED: invoke the RecoveryAdapter, create a
 *      RecoveryAttempt, verify the outcome, and update the
 *      RecoveryCase (executeApprovedRecovery, below).
 *
 * This is the ONLY module allowed to call adapter.execute() (via
 * executeApprovedRecovery). Workflow handlers must call this
 * orchestrator rather than adapters directly, and DecisionProviders
 * must never execute actions themselves.
 */
export async function runRecoveryOrchestrator(
  prisma: PrismaClient,
  recoveryCase: RecoveryCase,
  decisionProvider: DecisionProvider,
  adapter: RecoveryAdapter
): Promise<OrchestratorResult> {
  // 1. Decision
  const decisionResult = await decisionProvider.decide({
    recoveryCaseId: recoveryCase.id,
    paymentId: recoveryCase.paymentId,
    amount: recoveryCase.amount,
    currency: recoveryCase.currency,
    failureReason: null,
  });

  const decision = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.recoveryDecision.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        strategy: decisionResult.strategy,
        reason: decisionResult.reason,
        confidence: decisionResult.confidence,
        providerName: decisionResult.providerName,
        rawOutput: decisionResult.rawOutput,
      },
    });

    await tx.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "RECOMMENDED" },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: recoveryCase.id,
      eventType: "DECISION_CREATED",
      actor: ACTOR,
      metadata: {
        recoveryDecisionId: created.id,
        providerName: decisionResult.providerName,
        strategy: decisionResult.strategy,
        confidence: decisionResult.confidence,
      },
    });

    return created;
  });

  // 2. Policy Engine (always creates a PolicyEvaluation)
  const policyOutcome = await evaluatePolicy(prisma, recoveryCase, decision);

  // 3. Approval Gate
  const gateOutcome = await passThroughApprovalGate(
    prisma,
    recoveryCase.id,
    policyOutcome.id,
    policyOutcome,
    recoveryCase.amount
  );

  // 4. BLOCKED -> stop. No RecoveryAttempt is created.
  if (gateOutcome === "BLOCKED") {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "BLOCKED" },
    });

    return {
      recoveryCaseId: recoveryCase.id,
      status: "BLOCKED",
      blocked: true,
      blockedReason: policyOutcome.reason,
    };
  }

  // 5. PENDING_APPROVAL -> stop. Awaiting a human operator.
  if (gateOutcome === "PENDING_APPROVAL") {
    await prisma.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "PENDING_APPROVAL" },
    });

    return {
      recoveryCaseId: recoveryCase.id,
      status: "PENDING_APPROVAL",
      blocked: false,
    };
  }

  // 6. AUTO_APPROVED -> execute via the orchestrator only.
  return executeApprovedRecovery(prisma, recoveryCase, decision, policyOutcome.id, adapter);
}

/**
 * Runs execution + verification for a RecoveryDecision that has
 * already cleared the Approval Gate (either automatically, in
 * runRecoveryOrchestrator above, or via a human operator approving a
 * PENDING_APPROVAL case in approval-service.ts). Extracted from
 * runRecoveryOrchestrator in Milestone 6 so both callers share
 * exactly one execution path -- this function is still the only place
 * that calls adapter.execute().
 */
export async function executeApprovedRecovery(
  prisma: PrismaClient,
  recoveryCase: RecoveryCase,
  decision: RecoveryDecision,
  policyEvaluationId: string,
  adapter: RecoveryAdapter
): Promise<OrchestratorResult> {
  await prisma.recoveryCase.update({
    where: { id: recoveryCase.id },
    data: { status: "APPROVED" },
  });

  const attempt = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.recoveryCase.update({
      where: { id: recoveryCase.id },
      data: { status: "EXECUTING" },
    });

    const created = await tx.recoveryAttempt.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        recoveryDecisionId: decision.id,
        policyEvaluationId,
        adapterName: adapter.name,
        status: "EXECUTING",
      },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: recoveryCase.id,
      eventType: "EXECUTION_STARTED",
      actor: ACTOR,
      metadata: {
        recoveryAttemptId: created.id,
        adapterName: adapter.name,
        strategy: decision.strategy,
      },
    });

    return created;
  });

  const decisionResult: DecisionResult = {
    strategy: decision.strategy,
    reason: decision.reason,
    confidence: decision.confidence,
    providerName: decision.providerName,
    rawOutput: decision.rawOutput as Record<string, unknown>,
  };

  const executionResult = await adapter.execute({
    recoveryCaseId: recoveryCase.id,
    amount: recoveryCase.amount,
    currency: recoveryCase.currency,
    decision: decisionResult,
  });

  await writeAuditLog(prisma, {
    recoveryCaseId: recoveryCase.id,
    eventType: "EXECUTION_COMPLETED",
    actor: ACTOR,
    metadata: {
      recoveryAttemptId: attempt.id,
      adapterName: executionResult.adapterName,
      status: executionResult.status,
    },
  });

  // Verify outcome and finalize state.
  const finalAttempt = await verifyOutcome(prisma, attempt, executionResult);

  return {
    recoveryCaseId: recoveryCase.id,
    status: finalAttempt.status,
    blocked: false,
  };
}
