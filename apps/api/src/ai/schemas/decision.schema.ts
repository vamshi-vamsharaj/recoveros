import { z } from "zod";
import type { RecoveryStrategy } from "@prisma/client";

/**
 * Structural validation of Gemini's raw JSON output, BEFORE it is
 * mapped into a DecisionResult. This is intentionally a separate,
 * narrower schema from DecisionResultSchema in engine/decision-provider.ts
 * (which validates the fully-assembled DecisionResult, including
 * providerName/rawOutput that Gemini itself never produces).
 */
export const GeminiRawDecisionSchema = z.object({
  strategy: z.enum([
    "PAYMENT_LINK",
    "RETRY_CARD",
    "SEND_REMINDER",
    "OFFER_DISCOUNT",
    "ALTERNATE_METHOD",
  ]),
  reason: z.string().min(1),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

export type GeminiRawDecision = z.infer<typeof GeminiRawDecisionSchema>;

/**
 * Which RecoveryStrategy values are valid recommendations for a given
 * workflow. A structurally valid Gemini response is not sufficient if
 * the recommended strategy isn't one this workflow can actually act on.
 *
 * ALTERNATE_METHOD is deliberately excluded for "payment-degradation":
 * nothing in the current data model (see prisma/schema.prisma) stores
 * a customer's alternate payment methods -- no saved cards, no UPI
 * handles, nothing for an adapter to act on. Recommending it here
 * would be a recommendation the system has no way to execute, so it
 * is treated as invalid-for-workflow and triggers deterministic
 * fallback rather than being persisted as a real recommendation.
 */
export const VALID_STRATEGIES_BY_WORKFLOW: Record<string, RecoveryStrategy[]> = {
  "payment-degradation": ["PAYMENT_LINK", "RETRY_CARD", "SEND_REMINDER", "OFFER_DISCOUNT"],
};

export function isStrategyValidForWorkflow(
  strategy: RecoveryStrategy,
  workflowName: string
): boolean {
  const allowed = VALID_STRATEGIES_BY_WORKFLOW[workflowName];
  if (!allowed) return false;
  return allowed.includes(strategy);
}
