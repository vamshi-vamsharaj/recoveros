import type { BatchWorkflowName, ScenarioDefinition } from "./types.js";

const WORKFLOWS: BatchWorkflowName[] = [
  "payment-degradation",
  "checkout-dropoff",
  "subscription-failure",
  "invoice-overdue",
  "mandate-failure",
  "promise-to-pay",
];

const BASE_AMOUNTS: Record<BatchWorkflowName, number> = {
  "payment-degradation": 8000,
  "checkout-dropoff": 6500,
  "subscription-failure": 14900,
  "invoice-overdue": 42000,
  "mandate-failure": 9800,
  "promise-to-pay": 11200,
};

const HIGH_VALUE_AMOUNTS: Record<BatchWorkflowName, number> = {
  "payment-degradation": 250000,
  "checkout-dropoff": 220000,
  "subscription-failure": 310000,
  "invoice-overdue": 480000,
  "mandate-failure": 265000,
  "promise-to-pay": 205000,
};

function buildScenariosForWorkflow(workflow: BatchWorkflowName): ScenarioDefinition[] {
  const base = BASE_AMOUNTS[workflow];
  const highValue = HIGH_VALUE_AMOUNTS[workflow];

  return [
    {
      scenarioId: `${workflow}__normal-recovery`,
      workflow,
      riskCondition: "normal-recovery",
      amount: base,
      currency: "INR",
      policy: { isEnabled: true, maxAttempts: 3 },
    },
    {
      scenarioId: `${workflow}__high-value-approval`,
      workflow,
      riskCondition: "high-value-approval",
      amount: highValue,
      currency: "INR",
      policy: { isEnabled: true, maxAttempts: 3 },
    },
    {
      scenarioId: `${workflow}__policy-disabled`,
      workflow,
      riskCondition: "policy-disabled",
      amount: Math.round(base * 1.5),
      currency: "INR",
      policy: { isEnabled: false, maxAttempts: 3 },
    },
    {
      scenarioId: `${workflow}__retry-exhausted`,
      workflow,
      riskCondition: "retry-exhausted",
      amount: Math.round(base * 1.2),
      currency: "INR",
      policy: { isEnabled: true, maxAttempts: 0 },
    },
  ];
}

export const BATCH_SCENARIOS: ScenarioDefinition[] = WORKFLOWS.flatMap(
  buildScenariosForWorkflow
);
