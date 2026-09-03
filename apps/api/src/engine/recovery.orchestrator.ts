import type { Prisma, PrismaClient, RecoveryCase } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import type { DecisionProvider } from "./decision-provider.js";
import type { RecoveryAdapter } from "../adapters/recovery.adapter.js";
import { evaluatePolicy } from "./policy.engine.js";
import { passThroughApprovalGate } from "./approval-gate.js";
import { verifyOutcome } from "./verification.service.js";

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
 *   5. If APPROVED: invoke the RecoveryAdapter, create a
 *      RecoveryAttempt, verify the outcome, and update the
 *      RecoveryCase.
 *
 * This is the ONLY module allowed to call adapter.execute(). Workflow
 * handlers must call this orchestrator rather than adapters directly,
 * and DecisionProviders must never execute actions themselves.
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
  const approved = await passThroughApprovalGate(
    prisma,
    recoveryCase.id,
    policyOutcome.id,
    policyOutcome
  );

  // 4. BLOCKED -> stop. No RecoveryAttempt is created.
  if (!approved) {
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

  // 5. APPROVED -> execute via the orchestrator only.
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
        policyEvaluationId: policyOutcome.id,
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

  // 6. Verify outcome and finalize state.
  const finalAttempt = await verifyOutcome(prisma, attempt, executionResult);

  return {
    recoveryCaseId: recoveryCase.id,
    status: finalAttempt.status,
    blocked: false,
  };
}
