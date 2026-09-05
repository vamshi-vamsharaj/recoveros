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
