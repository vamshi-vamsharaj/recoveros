import type { DecisionProvider } from "./decision-provider.js";
import { validateDecisionResult } from "./decision-provider.js";
import type { DecisionInput, DecisionResult } from "./types.js";

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

    return validateDecisionResult(candidate);
  }
}
