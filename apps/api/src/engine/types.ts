import type {
  RecoveryStrategy,
  ConfidenceLevel,
  PolicyEvaluationResult,
  RecoveryAttemptStatus,
} from "@prisma/client";

/**
 * Structured output every DecisionProvider must return.
 * Validated with Zod (see decision-provider.ts) before it is
 * persisted as a RecoveryDecision.
 */
export interface DecisionResult {
  strategy: RecoveryStrategy;
  reason: string;
  confidence: ConfidenceLevel;
  providerName: string;
  rawOutput: Record<string, unknown>;
}

/** Input a DecisionProvider needs to produce a DecisionResult. */
export interface DecisionInput {
  recoveryCaseId: string;
  paymentId: string | null;
  amount: number;
  currency: string;
  failureReason: string | null;
}

/** Structured result every Policy Engine evaluation must return. */
export interface PolicyEvaluationOutcome {
  result: PolicyEvaluationResult;
  reason: string;
  policyId: string;
}

/** Structured result every RecoveryAdapter.execute() must return. */
export interface AdapterExecutionResult {
  status: Extract<RecoveryAttemptStatus, "RECOVERED" | "FAILED">;
  recoveredAmount: number | null;
  adapterName: string;
}
