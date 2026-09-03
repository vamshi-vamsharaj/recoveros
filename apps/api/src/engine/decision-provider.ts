import { z } from "zod";
import type { DecisionInput, DecisionResult } from "./types.js";

/**
 * A DecisionProvider turns a RecoveryCase into a recovery
 * recommendation. It must NEVER execute actions -- only the
 * Recovery Orchestrator may trigger an adapter.
 *
 * Milestone 2 implements StubDecisionProvider. A future
 * ClaudeDecisionProvider can implement this same interface without
 * changing the orchestrator.
 */
export interface DecisionProvider {
  readonly name: string;
  decide(input: DecisionInput): Promise<DecisionResult>;
}

// Validates whatever a DecisionProvider returns before it is persisted.
// Keeps a malformed provider (stub today, an LLM-backed one tomorrow)
// from writing bad data into RecoveryDecision.
export const DecisionResultSchema = z.object({
  strategy: z.enum([
    "PAYMENT_LINK",
    "RETRY_CARD",
    "SEND_REMINDER",
    "OFFER_DISCOUNT",
    "ALTERNATE_METHOD",
  ]),
  reason: z.string().min(1),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  providerName: z.string().min(1),
  rawOutput: z.record(z.unknown()),
});

export function validateDecisionResult(candidate: unknown): DecisionResult {
  return DecisionResultSchema.parse(candidate);
}
