import type { RecoveryAdapter } from "./recovery.adapter.js";
import type { AdapterExecutionResult, DecisionResult } from "../engine/types.js";

/**
 * Deterministically simulates a successful recovery action. This is
 * NOT a Razorpay integration -- it represents a recovery action being
 * executed without pretending to call a real payment provider. Every
 * call is logged and named as simulated, and never uses randomness,
 * so demos are reliable.
 */
export class SimulatedAdapter implements RecoveryAdapter {
  readonly name = "SimulatedAdapter";

  async execute(input: {
    recoveryCaseId: string;
    amount: number;
    currency: string;
    decision: DecisionResult;
  }): Promise<AdapterExecutionResult> {
    console.log(
      `[SimulatedAdapter] Simulating "${input.decision.strategy}" execution for RecoveryCase ${input.recoveryCaseId} (${input.amount} ${input.currency}) -- this is a simulated action, no real payment provider was contacted.`
    );

    return {
      status: "RECOVERED",
      recoveredAmount: input.amount,
      adapterName: this.name,
    };
  }
}
