import type { RecoveryAdapter } from "./recovery.adapter.js";
import type { AdapterExecutionResult, DecisionResult } from "../engine/types.js";
import { createPaymentLink } from "../providers/razorpay/razorpay.provider.js";

/**
 * Real, bounded Razorpay Test Mode recovery action, implementing the
 * same RecoveryAdapter interface as SimulatedAdapter -- the
 * orchestrator needed no changes to use this instead.
 *
 * Implements exactly one strategy: creating a NEW Razorpay Payment
 * Link (modeled in this schema as RecoveryStrategy.PAYMENT_LINK; the
 * task brief calls this "RETRY_PAYMENT_LINK", but the schema's actual
 * enum -- the implementation source of truth -- only has
 * PAYMENT_LINK, so that existing value is reused rather than renamed
 * or duplicated). This is NOT a retry of the original failed payment:
 * the original Payment row is never touched. The link is a new,
 * bounded action recorded against the RecoveryAttempt via
 * providerReference.
 *
 * Any other strategy has no real execution path yet and fails the
 * attempt rather than silently doing nothing or guessing at a
 * Razorpay call that doesn't correspond to that strategy.
 *
 * Creating the link successfully means the action was *initiated*,
 * not that the customer paid -- see engine/types.ts for why this
 * returns "EXECUTING" rather than "RECOVERED" on success. Final
 * confirmation happens later via the `payment_link.paid` webhook
 * (workers/webhook.worker.ts).
 */
export class RazorpayAdapter implements RecoveryAdapter {
  readonly name = "RazorpayAdapter";

  async execute(input: {
    recoveryCaseId: string;
    amount: number;
    currency: string;
    decision: DecisionResult;
  }): Promise<AdapterExecutionResult> {
    if (input.decision.strategy !== "PAYMENT_LINK") {
      console.error(
        `[RazorpayAdapter] Strategy "${input.decision.strategy}" has no real Razorpay execution path yet (only PAYMENT_LINK is implemented) -- failing RecoveryCase ${input.recoveryCaseId}'s attempt rather than guessing at an action.`
      );
      return { status: "FAILED", recoveredAmount: null, adapterName: this.name };
    }

    try {
      const link = await createPaymentLink({
        amount: input.amount,
        currency: input.currency,
        referenceId: input.recoveryCaseId,
        description: `RecoverOS recovery for case ${input.recoveryCaseId}`,
      });

      console.log(
        `[RazorpayAdapter] Created Razorpay Test Mode Payment Link ${link.id} (${link.shortUrl}) for RecoveryCase ${input.recoveryCaseId}. Awaiting payment_link.paid webhook to confirm recovery.`
      );

      return {
        status: "EXECUTING",
        recoveredAmount: null,
        adapterName: this.name,
        providerReference: link.id,
        providerMetadata: { shortUrl: link.shortUrl, status: link.status },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Razorpay error";
      console.error(
        `[RazorpayAdapter] Failed to create Payment Link for RecoveryCase ${input.recoveryCaseId}: ${message}`
      );
      return { status: "FAILED", recoveredAmount: null, adapterName: this.name };
    }
  }
}
