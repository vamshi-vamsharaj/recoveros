import { createHash } from "node:crypto";
import { BATCH_WORKFLOW_KEYS, type BatchScenario, type BatchWorkflowKey } from "./types.js";

export const SCENARIOS_PER_WORKFLOW = 10;

interface WorkflowScenarioConfig {
  baseAmount: number;
  amountStep: number;
  conditions: string[];
}

const WORKFLOW_CONFIG: Record<BatchWorkflowKey, WorkflowScenarioConfig> = {
  "payment-degradation": {
    baseAmount: 8_000,
    amountStep: 28_000,
    conditions: [
      "Card declined by issuing bank",
      "Insufficient funds on primary card",
      "Card expired mid-cycle",
      "Bank flagged transaction as suspicious",
      "Network timeout during authorization",
    ],
  },
  "checkout-dropoff": {
    baseAmount: 5_000,
    amountStep: 28_000,
    conditions: [
      "Abandoned at the payment step",
      "Abandoned after entering shipping details",
      "Session expired before payment",
      "Price shock at checkout",
      "Selected payment method unsupported",
    ],
  },
  "subscription-failure": {
    baseAmount: 6_000,
    amountStep: 28_000,
    conditions: [
      "Recurring charge declined",
      "Card on file expired",
      "Billing address mismatch",
      "Issuer blocked the recurring charge",
      "Insufficient balance on renewal date",
    ],
  },
  "invoice-overdue": {
    baseAmount: 15_000,
    amountStep: 28_000,
    conditions: [
      "Invoice unpaid past its due date",
      "Finance approval pending client-side",
      "Disputed line item under review",
      "Payment terms lapsed",
      "Customer cash-flow delay",
    ],
  },
  "mandate-failure": {
    baseAmount: 4_000,
    amountStep: 28_000,
    conditions: [
      "eNACH mandate revoked by bank",
      "Mandate expired without renewal",
      "Customer paused autopay",
      "Bank rejected mandate registration",
      "Mandate limit exceeded",
    ],
  },
  "promise-to-pay": {
    baseAmount: 7_000,
    amountStep: 28_000,
    conditions: [
      "Promise date passed without payment",
      "Partial payment promised, none received",
      "Requested extension never confirmed",
      "Broken payment-plan installment",
      "Verbal commitment unfulfilled",
    ],
  },
};

function riskTierForIndex(index: number): BatchScenario["riskTier"] {
  if (index < 4) return "LOW";
  if (index < 7) return "MEDIUM";
  return "HIGH";
}

/**
 * Deterministic amount jitter, in the unit interval [0, 1), derived
 * from a sha256 hash of the scenario id. No Math.random anywhere in
 * this module -- the same scenario id always produces the same
 * amount, on this machine or any other.
 */
function deterministicUnit(seed: string): number {
  const digest = createHash("sha256").update(seed).digest("hex");
  const intVal = parseInt(digest.slice(0, 8), 16);
  return intVal / 0xffffffff;
}

function buildScenarioId(workflow: BatchWorkflowKey, index: number): string {
  return `${workflow}-${String(index + 1).padStart(2, "0")}`;
}

/**
 * Generates the full deterministic synthetic scenario set: one
 * fixed-size batch per workflow, every field derived from the
 * workflow name and scenario index only. Re-running this function
 * always yields byte-identical scenarios.
 *
 * The last scenario in each workflow (`useDisabledPolicy`) is
 * reserved to demonstrate the Policy Engine's BLOCK path -- the
 * batch runner routes it through a merchant whose recovery policy is
 * disabled, which is a real, undoctored Policy Engine outcome, not a
 * fabricated one.
 */
export function generateScenarios(): BatchScenario[] {
  const scenarios: BatchScenario[] = [];

  for (const workflow of BATCH_WORKFLOW_KEYS) {
    const config = WORKFLOW_CONFIG[workflow];

    for (let index = 0; index < SCENARIOS_PER_WORKFLOW; index += 1) {
      const id = buildScenarioId(workflow, index);
      const jitter = deterministicUnit(`amount:${id}`);
      const amount = Math.round(
        config.baseAmount + config.amountStep * index + jitter * (config.amountStep / 2)
      );
      const condition = config.conditions[index % config.conditions.length]!;
      const useDisabledPolicy = index === SCENARIOS_PER_WORKFLOW - 1;

      scenarios.push({
        id,
        workflow,
        amount,
        currency: "INR",
        condition,
        riskTier: riskTierForIndex(index),
        useDisabledPolicy,
      });
    }
  }

  return scenarios;
}
