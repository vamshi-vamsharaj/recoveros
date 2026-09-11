import { createHash } from "node:crypto";
import type { BaselineScenarioResult, BatchScenario, BatchWorkflowKey } from "./types.js";

/**
 * Recovery-rate assumption for a simple, non-intelligent recovery
 * process per workflow: a merchant manually retrying or reminding,
 * with no adaptive strategy selection and no automatic retries.
 * Expressed as an integer percentile threshold in [0, 100).
 */
const BASELINE_RECOVERY_THRESHOLD: Record<BatchWorkflowKey, number> = {
  "payment-degradation": 35,
  "checkout-dropoff": 20,
  "subscription-failure": 30,
  "invoice-overdue": 25,
  "mandate-failure": 15,
  "promise-to-pay": 40,
};

/**
 * Deterministic pseudo-random percentile in [0, 100), derived from a
 * sha256 hash of the scenario id. Independent of any value the
 * Recovery Engine computes for the same scenario, and independent of
 * `deterministicUnit` in scenarios.ts (different seed prefix), so the
 * baseline outcome cannot accidentally correlate with the amount
 * jitter used to generate the scenario itself.
 */
function deterministicPercentile(scenarioId: string): number {
  const digest = createHash("sha256").update(`baseline:${scenarioId}`).digest("hex");
  const intVal = parseInt(digest.slice(0, 8), 16);
  return intVal % 100;
}

/**
 * Evaluates the deterministic baseline recovery outcome for a single
 * scenario. Deliberately calls nothing from ../engine, ../workflows,
 * ../adapters, or ../ai -- this must stay a pure, self-contained
 * model of "recovery without RecoverOS", never a shortcut through the
 * real pipeline.
 */
export function evaluateBaseline(scenario: BatchScenario): BaselineScenarioResult {
  const threshold = BASELINE_RECOVERY_THRESHOLD[scenario.workflow];
  const percentile = deterministicPercentile(scenario.id);
  const recovered = percentile < threshold;

  return {
    scenarioId: scenario.id,
    recovered,
    recoveredAmount: recovered ? scenario.amount : 0,
  };
}
