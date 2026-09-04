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

/**
 * Structured result every RecoveryAdapter.execute() must return.
 *
 * Milestone 4 change: "EXECUTING" was added alongside the original
 * "RECOVERED" | "FAILED". SimulatedAdapter can confirm success
 * synchronously, so it is unaffected and still only ever returns
 * "RECOVERED". RazorpayAdapter cannot -- creating a Payment Link only
 * means the recovery action was *initiated*; actual recovery is
 * confirmed later, asynchronously, by a `payment_link.paid` webhook.
 * Returning "EXECUTING" (a pre-existing, legitimate
 * RecoveryAttemptStatus value -- no new enum value needed) lets that
 * in-progress state pass through verifyOutcome() honestly instead of
 * forcing a synchronous adapter to lie about the outcome.
 *
 * `providerReference` / `providerMetadata` are optional and additive:
 * they let an adapter hand back an external identifier (e.g. a
 * Razorpay Payment Link id) for verification.service.ts to persist
 * onto the RecoveryAttempt, so a later webhook can look the attempt
 * back up. SimulatedAdapter simply omits them.
 */
export interface AdapterExecutionResult {
  status: Extract<RecoveryAttemptStatus, "EXECUTING" | "RECOVERED" | "FAILED">;
  recoveredAmount: number | null;
  adapterName: string;
  providerReference?: string | null;
  providerMetadata?: Record<string, unknown> | null;
}
