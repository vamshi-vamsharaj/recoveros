import { describe, it, expect } from "vitest";
import { calculateBatchMetrics, safeDivide } from "../src/batch-evaluation/metrics.js";
import type { ScenarioEvaluationResult } from "../src/batch-evaluation/types.js";

function scenario(
  overrides: Partial<ScenarioEvaluationResult> & Pick<ScenarioEvaluationResult, "scenarioId" | "workflow">
): ScenarioEvaluationResult {
  return {
    amount: 10_000,
    currency: "INR",
    condition: "Test condition",
    riskTier: "MEDIUM",
    recoveryCaseId: `case-${overrides.scenarioId}`,
    recoverOsStatus: "RECOVERED",
    recoverOsRecoveredAmount: 10_000,
    approvalRequired: false,
    baselineRecovered: false,
    baselineRecoveredAmount: 0,
    ...overrides,
  };
}

const FIXTURE: ScenarioEvaluationResult[] = [
  scenario({
    scenarioId: "payment-degradation-01",
    workflow: "payment-degradation",
    amount: 10_000,
    recoverOsStatus: "RECOVERED",
    recoverOsRecoveredAmount: 10_000,
    baselineRecovered: true,
    baselineRecoveredAmount: 10_000,
  }),
  scenario({
    scenarioId: "payment-degradation-02",
    workflow: "payment-degradation",
    amount: 20_000,
    recoverOsStatus: "BLOCKED",
    recoverOsRecoveredAmount: 0,
    baselineRecovered: false,
    baselineRecoveredAmount: 0,
  }),
  scenario({
    scenarioId: "payment-degradation-03",
    workflow: "payment-degradation",
    amount: 250_000,
    recoverOsStatus: "RECOVERED",
    recoverOsRecoveredAmount: 250_000,
    approvalRequired: true,
    baselineRecovered: false,
    baselineRecoveredAmount: 0,
  }),
  scenario({
    scenarioId: "checkout-dropoff-01",
    workflow: "checkout-dropoff",
    amount: 5_000,
    recoverOsStatus: "FAILED",
    recoverOsRecoveredAmount: 0,
    baselineRecovered: false,
    baselineRecoveredAmount: 0,
  }),
  scenario({
    scenarioId: "checkout-dropoff-02",
    workflow: "checkout-dropoff",
    amount: 15_000,
    recoverOsStatus: "RECOVERED",
    recoverOsRecoveredAmount: 15_000,
    baselineRecovered: true,
    baselineRecoveredAmount: 15_000,
  }),
];

describe("safeDivide", () => {
  it("divides two positive numbers", () => {
    expect(safeDivide(1, 4)).toBe(0.25);
  });

  it("returns null for a zero denominator instead of NaN or Infinity", () => {
    expect(safeDivide(5, 0)).toBeNull();
  });

  it("returns 0 when the numerator is zero and denominator is not", () => {
    expect(safeDivide(0, 10)).toBe(0);
  });
});

describe("calculateBatchMetrics — overall metrics", () => {
  const metrics = calculateBatchMetrics(FIXTURE);

  it("counts total scenarios", () => {
    expect(metrics.overall.totalScenarios).toBe(5);
  });

  it("sums total revenue at risk across every scenario regardless of outcome", () => {
    expect(metrics.overall.totalRevenueAtRisk).toBe(10_000 + 20_000 + 250_000 + 5_000 + 15_000);
  });

  it("sums recovered revenue only from RECOVERED scenarios", () => {
    expect(metrics.overall.totalRecoveredRevenue).toBe(10_000 + 250_000 + 15_000);
  });

  it("counts recovered cases", () => {
    expect(metrics.overall.recoveredCases).toBe(3);
  });

  it("computes recovery rate as recovered / total", () => {
    expect(metrics.overall.recoveryRate).toBeCloseTo(3 / 5);
  });

  it("counts blocked cases", () => {
    expect(metrics.overall.blockedCases).toBe(1);
  });

  it("counts failed cases", () => {
    expect(metrics.overall.failedCases).toBe(1);
  });

  it("counts approval-required cases regardless of final outcome", () => {
    expect(metrics.overall.approvalRequiredCases).toBe(1);
  });

  it("computes average recovered value across recovered cases only", () => {
    expect(metrics.overall.averageRecoveredValue).toBeCloseTo((10_000 + 250_000 + 15_000) / 3);
  });
});

describe("calculateBatchMetrics — baseline metrics", () => {
  const metrics = calculateBatchMetrics(FIXTURE);

  it("sums baseline recovered revenue only from baseline-recovered scenarios", () => {
    expect(metrics.baseline.baselineRecoveredRevenue).toBe(10_000 + 15_000);
  });

  it("counts baseline recovered cases", () => {
    expect(metrics.baseline.baselineRecoveredCases).toBe(2);
  });

  it("computes baseline recovery rate as baseline-recovered / total", () => {
    expect(metrics.baseline.baselineRecoveryRate).toBeCloseTo(2 / 5);
  });
});

describe("calculateBatchMetrics — comparison metrics", () => {
  const metrics = calculateBatchMetrics(FIXTURE);

  it("computes additional revenue recovered as RecoverOS minus baseline", () => {
    const expected = 10_000 + 250_000 + 15_000 - (10_000 + 15_000);
    expect(metrics.comparison.additionalRevenueRecovered).toBe(expected);
  });

  it("computes recovery rate improvement in percentage points", () => {
    const expected = (3 / 5 - 2 / 5) * 100;
    expect(metrics.comparison.recoveryRateImprovement).toBeCloseTo(expected);
  });

  it("computes percentage improvement over baseline revenue", () => {
    const baselineRevenue = 10_000 + 15_000;
    const currentRevenue = 10_000 + 250_000 + 15_000;
    const expected = ((currentRevenue - baselineRevenue) / baselineRevenue) * 100;
    expect(metrics.comparison.percentageImprovementOverBaseline).toBeCloseTo(expected);
  });
});

describe("calculateBatchMetrics — workflow breakdown", () => {
  const metrics = calculateBatchMetrics(FIXTURE);

  it("includes all six workflows even when a workflow has zero scenarios", () => {
    const workflows = metrics.workflowBreakdown.map((w) => w.workflow);
    expect(workflows).toEqual([
      "payment-degradation",
      "checkout-dropoff",
      "subscription-failure",
      "invoice-overdue",
      "mandate-failure",
      "promise-to-pay",
    ]);
  });

  it("computes correct scenario count per workflow", () => {
    const paymentDegradation = metrics.workflowBreakdown.find(
      (w) => w.workflow === "payment-degradation"
    );
    expect(paymentDegradation?.scenarioCount).toBe(3);
  });

  it("computes correct recovered revenue per workflow", () => {
    const checkoutDropoff = metrics.workflowBreakdown.find((w) => w.workflow === "checkout-dropoff");
    expect(checkoutDropoff?.recoveredRevenue).toBe(15_000);
  });

  it("handles a workflow with zero scenarios via safe division (null rate, not NaN)", () => {
    const subscriptionFailure = metrics.workflowBreakdown.find(
      (w) => w.workflow === "subscription-failure"
    );
    expect(subscriptionFailure?.scenarioCount).toBe(0);
    expect(subscriptionFailure?.recoveryRate).toBeNull();
    expect(subscriptionFailure?.baselineRecoveryRate).toBeNull();
    expect(subscriptionFailure?.improvementPercentage).toBeNull();
  });
});

describe("calculateBatchMetrics — zero-denominator handling", () => {
  it("returns null rates and averages for an empty scenario list instead of throwing", () => {
    const metrics = calculateBatchMetrics([]);

    expect(metrics.overall.totalScenarios).toBe(0);
    expect(metrics.overall.recoveryRate).toBeNull();
    expect(metrics.overall.averageRecoveredValue).toBeNull();
    expect(metrics.baseline.baselineRecoveryRate).toBeNull();
    expect(metrics.comparison.recoveryRateImprovement).toBeNull();
    expect(metrics.comparison.percentageImprovementOverBaseline).toBeNull();
    expect(metrics.comparison.additionalRevenueRecovered).toBe(0);
  });
});
