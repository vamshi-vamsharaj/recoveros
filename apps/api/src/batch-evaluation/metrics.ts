import { BATCH_WORKFLOW_KEYS } from "./types.js";
import type {
  BatchMetrics,
  ScenarioEvaluationResult,
  WorkflowMetrics,
} from "./types.js";

const RECOVERED_STATUS = "RECOVERED";
const BLOCKED_STATUS = "BLOCKED";
const FAILED_STATUS = "FAILED";

export function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function safePercentImprovement(baseline: number, current: number): number | null {
  if (baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function computeWorkflowMetrics(
  workflow: (typeof BATCH_WORKFLOW_KEYS)[number],
  results: ScenarioEvaluationResult[]
): WorkflowMetrics {
  const scenarioCount = results.length;
  const revenueAtRisk = results.reduce((sum, r) => sum + r.amount, 0);
  const recoveredResults = results.filter((r) => r.recoverOsStatus === RECOVERED_STATUS);
  const recoveredRevenue = recoveredResults.reduce(
    (sum, r) => sum + r.recoverOsRecoveredAmount,
    0
  );
  const recoveredCases = recoveredResults.length;
  const recoveryRate = safeDivide(recoveredCases, scenarioCount);

  const baselineRecoveredResults = results.filter((r) => r.baselineRecovered);
  const baselineRecoveredRevenue = baselineRecoveredResults.reduce(
    (sum, r) => sum + r.baselineRecoveredAmount,
    0
  );
  const baselineRecoveredCases = baselineRecoveredResults.length;
  const baselineRecoveryRate = safeDivide(baselineRecoveredCases, scenarioCount);

  const improvementPercentage = safePercentImprovement(
    baselineRecoveredRevenue,
    recoveredRevenue
  );

  return {
    workflow,
    scenarioCount,
    revenueAtRisk,
    recoveredRevenue,
    recoveredCases,
    recoveryRate,
    baselineRecoveredRevenue,
    baselineRecoveredCases,
    baselineRecoveryRate,
    improvementPercentage,
  };
}

/**
 * Pure metrics calculation for a batch of scenario evaluation
 * results. Takes no database handle and performs no I/O, so it can be
 * (and is, see tests/batch-evaluation.metrics.test.ts) unit tested
 * with a fixed in-memory fixture and no Postgres/Redis/network
 * dependency.
 */
export function calculateBatchMetrics(results: ScenarioEvaluationResult[]): BatchMetrics {
  const totalScenarios = results.length;
  const totalRevenueAtRisk = results.reduce((sum, r) => sum + r.amount, 0);

  const recoveredResults = results.filter((r) => r.recoverOsStatus === RECOVERED_STATUS);
  const totalRecoveredRevenue = recoveredResults.reduce(
    (sum, r) => sum + r.recoverOsRecoveredAmount,
    0
  );
  const recoveredCases = recoveredResults.length;
  const blockedCases = results.filter((r) => r.recoverOsStatus === BLOCKED_STATUS).length;
  const failedCases = results.filter((r) => r.recoverOsStatus === FAILED_STATUS).length;
  const approvalRequiredCases = results.filter((r) => r.approvalRequired).length;

  const recoveryRate = safeDivide(recoveredCases, totalScenarios);
  const averageRecoveredValue = safeDivide(totalRecoveredRevenue, recoveredCases);

  const baselineRecoveredResults = results.filter((r) => r.baselineRecovered);
  const baselineRecoveredRevenue = baselineRecoveredResults.reduce(
    (sum, r) => sum + r.baselineRecoveredAmount,
    0
  );
  const baselineRecoveredCases = baselineRecoveredResults.length;
  const baselineRecoveryRate = safeDivide(baselineRecoveredCases, totalScenarios);

  const additionalRevenueRecovered = totalRecoveredRevenue - baselineRecoveredRevenue;
  const recoveryRateImprovement =
    recoveryRate === null || baselineRecoveryRate === null
      ? null
      : (recoveryRate - baselineRecoveryRate) * 100;
  const percentageImprovementOverBaseline = safePercentImprovement(
    baselineRecoveredRevenue,
    totalRecoveredRevenue
  );

  const workflowBreakdown = BATCH_WORKFLOW_KEYS.map((workflow) =>
    computeWorkflowMetrics(
      workflow,
      results.filter((r) => r.workflow === workflow)
    )
  );

  return {
    overall: {
      totalScenarios,
      totalRevenueAtRisk,
      totalRecoveredRevenue,
      recoveryRate,
      recoveredCases,
      blockedCases,
      failedCases,
      approvalRequiredCases,
      averageRecoveredValue,
    },
    baseline: {
      baselineRecoveredRevenue,
      baselineRecoveredCases,
      baselineRecoveryRate,
    },
    comparison: {
      additionalRevenueRecovered,
      recoveryRateImprovement,
      percentageImprovementOverBaseline,
    },
    workflowBreakdown,
  };
}
