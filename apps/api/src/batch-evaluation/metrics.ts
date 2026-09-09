import type { BatchMetrics, BatchWorkflowName, ScenarioResult, WorkflowMetrics } from "./types.js";

const WORKFLOW_ORDER: BatchWorkflowName[] = [
  "payment-degradation",
  "checkout-dropoff",
  "subscription-failure",
  "invoice-overdue",
  "mandate-failure",
  "promise-to-pay",
];

function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function calculateBatchMetrics(results: ScenarioResult[]): BatchMetrics {
  const totalScenarios = results.length;

  const totalRevenueAtRisk = results.reduce((sum, r) => sum + r.amount, 0);
  const recoveredResults = results.filter((r) => r.status === "RECOVERED");
  const recoveredRevenue = recoveredResults.reduce(
    (sum, r) => sum + (r.recoveredAmount ?? 0),
    0
  );

  const recoveredCases = recoveredResults.length;
  const blockedCases = results.filter((r) => r.status === "BLOCKED").length;
  const failedCases = results.filter(
    (r) => r.status === "FAILED" || r.status === "ERROR"
  ).length;
  const approvalRequiredCases = results.filter((r) => r.approvalRequired).length;

  const recoveryRate = safeDivide(recoveredCases, totalScenarios);
  const averageRecoveryValue = safeDivide(recoveredRevenue, recoveredCases);

  const baselineRecoveredRevenue = results.reduce(
    (sum, r) => sum + r.baselineRecoveredAmount,
    0
  );
  const baselineRecoveredCases = results.filter((r) => r.baselineRecovered).length;
  const baselineRecoveryRate = safeDivide(baselineRecoveredCases, totalScenarios);

  const improvementOverBaseline =
    baselineRecoveryRate !== null && recoveryRate !== null
      ? recoveryRate - baselineRecoveryRate
      : null;

  const workflowBreakdown: WorkflowMetrics[] = WORKFLOW_ORDER.map((workflow) => {
    const workflowResults = results.filter((r) => r.workflow === workflow);
    const workflowRevenueAtRisk = workflowResults.reduce((sum, r) => sum + r.amount, 0);
    const workflowRecoveredRevenue = workflowResults
      .filter((r) => r.status === "RECOVERED")
      .reduce((sum, r) => sum + (r.recoveredAmount ?? 0), 0);
    const workflowRecoveredCases = workflowResults.filter(
      (r) => r.status === "RECOVERED"
    ).length;

    return {
      workflow,
      scenarios: workflowResults.length,
      revenueAtRisk: workflowRevenueAtRisk,
      recoveredRevenue: workflowRecoveredRevenue,
      recoveryRate: safeDivide(workflowRecoveredCases, workflowResults.length),
    };
  }).filter((row) => row.scenarios > 0);

  return {
    totalScenarios,
    totalRevenueAtRisk,
    recoveredRevenue,
    recoveryRate,
    recoveredCases,
    blockedCases,
    failedCases,
    approvalRequiredCases,
    averageRecoveryValue,
    workflowBreakdown,
    baselineRecoveredRevenue,
    baselineRecoveryRate,
    improvementOverBaseline,
  };
}
