export type RecoveryCaseStatus =
  | "DETECTED"
  | "RECOMMENDED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "RECOVERED"
  | "BLOCKED"
  | "REJECTED"
  | "FAILED";

export type RecoveryCaseSourceType =
  | "PAYMENT"
  | "CHECKOUT_SESSION"
  | "SUBSCRIPTION"
  | "INVOICE"
  | "MANDATE";

export type RecoveryStrategy =
  | "PAYMENT_LINK"
  | "RETRY_CARD"
  | "SEND_REMINDER"
  | "OFFER_DISCOUNT"
  | "ALTERNATE_METHOD";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface DashboardResponse {
  metrics: {
    revenueAtRisk: number;
    revenueRecovered: number;
    activeCases: number;
    successRate: number | null;
  };
  statusOverview: { status: RecoveryCaseStatus; count: number }[];
  workflowBreakdown: {
    sourceType: RecoveryCaseSourceType;
    cases: number;
    amount: number;
    recoveredAmount: number;
  }[];
  trend: { date: string; casesCreated: number; casesRecovered: number }[];
  recentActivity: {
    id: string;
    eventType: string;
    actor: string;
    createdAt: string;
    recoveryCaseId: string | null;
    customerName: string | null;
    sourceType: RecoveryCaseSourceType | null;
    amount: number | null;
    currency: string | null;
  }[];
}

export interface RecoveryCaseListItem {
  id: string;
  customerName: string;
  customerEmail: string;
  sourceType: RecoveryCaseSourceType;
  status: RecoveryCaseStatus;
  amount: number;
  currency: string;
  recoveredAmount: number | null;
  strategy: RecoveryStrategy | null;
  confidence: ConfidenceLevel | null;
  createdAt: string;
}

export interface RecoveryCasesResponse {
  cases: RecoveryCaseListItem[];
}

export interface RecoveryCaseDetailResponse {
  case: {
    id: string;
    status: RecoveryCaseStatus;
    sourceType: RecoveryCaseSourceType;
    amount: number;
    currency: string;
    recoveredAmount: number | null;
    failureReason: string | null;
    createdAt: string;
    updatedAt: string;
    customer: { name: string; email: string };
  };
  decisions: {
    id: string;
    strategy: RecoveryStrategy;
    reason: string;
    confidence: ConfidenceLevel;
    providerName: string;
    createdAt: string;
    policyEvaluation: {
      result: "APPROVED" | "BLOCKED";
      reason: string;
      createdAt: string;
    } | null;
  }[];
  attempts: {
    id: string;
    status: "EXECUTING" | "RECOVERED" | "FAILED";
    adapterName: string;
    recoveredAmount: number | null;
    providerReference: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  timeline: {
    id: string;
    eventType: string;
    actor: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }[];
}

export interface ApiErrorBody {
  success: false;
  error: string;
}

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

export type ScenarioExecutionStatus =
  | "RECOVERED"
  | "BLOCKED"
  | "PENDING_APPROVAL"
  | "FAILED"
  | "ERROR";

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

export interface BatchScenarioResultItem {
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

export interface BatchEvaluationRunResponse {
  success: true;
  id: string;
  createdAt: string;
  metrics: BatchMetrics;
  scenarioResults: BatchScenarioResultItem[];
}

export interface BatchEvaluationDetailResponse {
  id: string;
  createdAt: string;
  metrics: BatchMetrics;
  scenarioResults: BatchScenarioResultItem[];
}

export interface BatchEvaluationListItem {
  id: string;
  createdAt: string;
  totalScenarios: number;
  totalRevenueAtRisk: number;
  recoveredRevenue: number;
  recoveryRate: number | null;
  baselineRecoveryRate: number | null;
  improvementOverBaseline: number | null;
}

export interface BatchEvaluationListResponse {
  runs: BatchEvaluationListItem[];
}
