export type BatchWorkflowName =
  | "payment-degradation"
  | "checkout-dropoff"
  | "subscription-failure"
  | "invoice-overdue"
  | "mandate-failure"
  | "promise-to-pay";

export type BatchRiskCondition =
  | "normal-recovery"
  | "high-value-approval"
  | "policy-disabled"
  | "retry-exhausted";

export interface ScenarioDefinition {
  scenarioId: string;
  workflow: BatchWorkflowName;
  riskCondition: BatchRiskCondition;
  amount: number;
  currency: string;
  policy: {
    isEnabled: boolean;
    maxAttempts: number;
  };
}

export type ScenarioExecutionStatus =
  | "RECOVERED"
  | "BLOCKED"
  | "PENDING_APPROVAL"
  | "FAILED"
  | "ERROR";

export interface ScenarioResult {
  scenarioId: string;
  workflow: BatchWorkflowName;
  riskCondition: BatchRiskCondition;
  amount: number;
  currency: string;
  recoveryCaseId: string | null;
  status: ScenarioExecutionStatus;
  recoveredAmount: number | null;
  blockedReason: string | null;
  approvalRequired: boolean;
  baselineRecovered: boolean;
  baselineRecoveredAmount: number;
  errorMessage: string | null;
}

export interface WorkflowMetrics {
  workflow: BatchWorkflowName;
  scenarios: number;
  revenueAtRisk: number;
  recoveredRevenue: number;
  recoveryRate: number | null;
}

export interface BatchMetrics {
  totalScenarios: number;
  totalRevenueAtRisk: number;
  recoveredRevenue: number;
  recoveryRate: number | null;
  recoveredCases: number;
  blockedCases: number;
  failedCases: number;
  approvalRequiredCases: number;
  averageRecoveryValue: number | null;
  workflowBreakdown: WorkflowMetrics[];
  baselineRecoveredRevenue: number;
  baselineRecoveryRate: number | null;
  improvementOverBaseline: number | null;
}
