export type BatchWorkflowKey =
  | "payment-degradation"
  | "checkout-dropoff"
  | "subscription-failure"
  | "invoice-overdue"
  | "mandate-failure"
  | "promise-to-pay";

export const BATCH_WORKFLOW_KEYS: BatchWorkflowKey[] = [
  "payment-degradation",
  "checkout-dropoff",
  "subscription-failure",
  "invoice-overdue",
  "mandate-failure",
  "promise-to-pay",
];

export interface BatchScenario {
  id: string;
  workflow: BatchWorkflowKey;
  amount: number;
  currency: string;
  condition: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  useDisabledPolicy: boolean;
}

export interface BaselineScenarioResult {
  scenarioId: string;
  recovered: boolean;
  recoveredAmount: number;
}

export interface ScenarioEvaluationResult {
  scenarioId: string;
  workflow: BatchWorkflowKey;
  amount: number;
  currency: string;
  condition: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  recoveryCaseId: string;
  recoverOsStatus: string;
  recoverOsRecoveredAmount: number;
  approvalRequired: boolean;
  baselineRecovered: boolean;
  baselineRecoveredAmount: number;
}

export interface WorkflowMetrics {
  workflow: BatchWorkflowKey;
  scenarioCount: number;
  revenueAtRisk: number;
  recoveredRevenue: number;
  recoveredCases: number;
  recoveryRate: number | null;
  baselineRecoveredRevenue: number;
  baselineRecoveredCases: number;
  baselineRecoveryRate: number | null;
  improvementPercentage: number | null;
}

export interface OverallMetrics {
  totalScenarios: number;
  totalRevenueAtRisk: number;
  totalRecoveredRevenue: number;
  recoveryRate: number | null;
  recoveredCases: number;
  blockedCases: number;
  failedCases: number;
  approvalRequiredCases: number;
  averageRecoveredValue: number | null;
}

export interface BaselineMetrics {
  baselineRecoveredRevenue: number;
  baselineRecoveredCases: number;
  baselineRecoveryRate: number | null;
}

export interface ComparisonMetrics {
  additionalRevenueRecovered: number;
  recoveryRateImprovement: number | null;
  percentageImprovementOverBaseline: number | null;
}

export interface BatchMetrics {
  overall: OverallMetrics;
  baseline: BaselineMetrics;
  comparison: ComparisonMetrics;
  workflowBreakdown: WorkflowMetrics[];
}

export interface BatchEvaluationSummary {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  scenarioCount: number;
  createdAt: Date;
  completedAt: Date | null;
  metrics: BatchMetrics | null;
}

export interface BatchEvaluationDetail extends BatchEvaluationSummary {
  errorMessage: string | null;
  scenarios: ScenarioEvaluationResult[];
}
