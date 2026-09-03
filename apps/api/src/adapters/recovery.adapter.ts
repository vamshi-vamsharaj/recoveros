import type { AdapterExecutionResult, DecisionResult } from "../engine/types.js";

/**
 * Boundary for executing a recovery action against a real payment
 * provider. Only the Recovery Orchestrator may call execute() --
 * never a workflow handler and never a DecisionProvider.
 *
 * Milestone 2 implements SimulatedAdapter. A future RazorpayAdapter
 * can implement this same interface without changing the orchestrator.
 */
export interface RecoveryAdapter {
  readonly name: string;
  execute(input: {
    recoveryCaseId: string;
    amount: number;
    currency: string;
    decision: DecisionResult;
  }): Promise<AdapterExecutionResult>;
}
