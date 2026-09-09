import type { BatchWorkflowName, ScenarioDefinition } from "./types.js";

const BASELINE_RECOVERY_PROBABILITY: Record<BatchWorkflowName, number> = {
  "payment-degradation": 0.32,
  "checkout-dropoff": 0.18,
  "subscription-failure": 0.25,
  "invoice-overdue": 0.2,
  "mandate-failure": 0.15,
  "promise-to-pay": 0.4,
};

function deterministicUnitInterval(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const unsigned = hash >>> 0;
  return unsigned / 0xffffffff;
}

export interface BaselineOutcome {
  recovered: boolean;
  recoveredAmount: number;
}

export function computeBaselineOutcome(scenario: ScenarioDefinition): BaselineOutcome {
  const probability = BASELINE_RECOVERY_PROBABILITY[scenario.workflow];
  const roll = deterministicUnitInterval(scenario.scenarioId);
  const recovered = roll < probability;

  return {
    recovered,
    recoveredAmount: recovered ? scenario.amount : 0,
  };
}
