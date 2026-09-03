import type { DecisionProvider } from "./decision-provider.js";
import { validateDecisionResult } from "./decision-provider.js";
import type { DecisionInput, DecisionResult } from "./types.js";

/**
 * Deterministic recovery recommendation. Stands in for a future
 * Claude-backed DecisionProvider -- it calls no AI API and always
 * returns the same recommendation shape for a given input, so demos
 * and tests are reproducible.
 */
export class StubDecisionProvider implements DecisionProvider {
  readonly name = "StubDecisionProvider";

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const candidate = {
      strategy: "PAYMENT_LINK" as const,
      reason:
        "Payment failed and customer has not recovered; a fresh payment link is the lowest-friction retry.",
      confidence: "HIGH" as const,
      providerName: this.name,
      rawOutput: {
        recoveryCaseId: input.recoveryCaseId,
        paymentId: input.paymentId,
        amount: input.amount,
        currency: input.currency,
        failureReason: input.failureReason,
        strategy: "PAYMENT_LINK",
        confidence: "HIGH",
      },
    };

    // Validated with Zod even though this provider is deterministic --
    // the same validation path a future AI-backed provider will go through.
    return validateDecisionResult(candidate);
  }
}
