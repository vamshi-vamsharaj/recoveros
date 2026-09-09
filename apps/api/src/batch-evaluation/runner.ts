import type { PrismaClient } from "@prisma/client";
import { workflowRegistry } from "../workflows/registry.js";
import { approveRecoveryCase } from "../engine/approval-service.js";
import { BATCH_SCENARIOS } from "./scenarios.js";
import { computeBaselineOutcome } from "./baseline.js";
import { calculateBatchMetrics } from "./metrics.js";
import { ensureScenarioTenant, createScenarioEntity } from "./fixtures.js";
import type { BatchMetrics, ScenarioDefinition, ScenarioExecutionStatus, ScenarioResult } from "./types.js";

export interface BatchEvaluationSummary {
  id: string;
  createdAt: Date;
  metrics: BatchMetrics;
  scenarioResults: ScenarioResult[];
}

function toScenarioExecutionStatus(status: string): ScenarioExecutionStatus {
  if (
    status === "RECOVERED" ||
    status === "BLOCKED" ||
    status === "PENDING_APPROVAL" ||
    status === "FAILED"
  ) {
    return status;
  }
  return "ERROR";
}

async function runScenario(
  prisma: PrismaClient,
  scenario: ScenarioDefinition
): Promise<ScenarioResult> {
  const baseline = computeBaselineOutcome(scenario);

  const base: Omit<
    ScenarioResult,
    "recoveryCaseId" | "status" | "recoveredAmount" | "blockedReason" | "approvalRequired" | "errorMessage"
  > = {
    scenarioId: scenario.scenarioId,
    workflow: scenario.workflow,
    riskCondition: scenario.riskCondition,
    amount: scenario.amount,
    currency: scenario.currency,
    baselineRecovered: baseline.recovered,
    baselineRecoveredAmount: baseline.recoveredAmount,
  };

  try {
    const { merchant, customer } = await ensureScenarioTenant(prisma, scenario);
    const entityId = await createScenarioEntity(prisma, scenario, merchant.id, customer.id);

    const handler = workflowRegistry[scenario.workflow];
    if (!handler) {
      throw new Error(`Workflow not registered: ${scenario.workflow}`);
    }

    let result = await handler(prisma, { entityId });
    const approvalRequired = result.status === "PENDING_APPROVAL";

    if (approvalRequired) {
      result = await approveRecoveryCase(prisma, result.recoveryCaseId);
    }

    const recoveryCase = await prisma.recoveryCase.findUnique({
      where: { id: result.recoveryCaseId },
      select: { recoveredAmount: true },
    });

    return {
      ...base,
      recoveryCaseId: result.recoveryCaseId,
      status: toScenarioExecutionStatus(result.status),
      recoveredAmount: recoveryCase?.recoveredAmount ?? null,
      blockedReason: result.blockedReason ?? null,
      approvalRequired,
      errorMessage: null,
    };
  } catch (err) {
    return {
      ...base,
      recoveryCaseId: null,
      status: "ERROR",
      recoveredAmount: null,
      blockedReason: null,
      approvalRequired: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function runBatchEvaluation(prisma: PrismaClient): Promise<BatchEvaluationSummary> {
  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of BATCH_SCENARIOS) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runScenario(prisma, scenario);
    scenarioResults.push(result);
  }

  const metrics = calculateBatchMetrics(scenarioResults);

  const created = await prisma.batchEvaluation.create({
    data: {
      totalScenarios: metrics.totalScenarios,
      totalRevenueAtRisk: metrics.totalRevenueAtRisk,
      recoveredRevenue: metrics.recoveredRevenue,
      recoveryRate: metrics.recoveryRate,
      recoveredCases: metrics.recoveredCases,
      blockedCases: metrics.blockedCases,
      failedCases: metrics.failedCases,
      approvalRequiredCases: metrics.approvalRequiredCases,
      averageRecoveryValue: metrics.averageRecoveryValue,
      baselineRecoveredRevenue: metrics.baselineRecoveredRevenue,
      baselineRecoveryRate: metrics.baselineRecoveryRate,
      improvementOverBaseline: metrics.improvementOverBaseline,
      metrics: metrics as unknown as object,
      scenarioResults: {
        create: scenarioResults.map((r) => ({
          scenarioId: r.scenarioId,
          workflow: r.workflow,
          riskCondition: r.riskCondition,
          amount: r.amount,
          currency: r.currency,
          recoveryCaseId: r.recoveryCaseId,
          status: r.status,
          recoveredAmount: r.recoveredAmount,
          blockedReason: r.blockedReason,
          approvalRequired: r.approvalRequired,
          baselineRecovered: r.baselineRecovered,
          baselineRecoveredAmount: r.baselineRecoveredAmount,
          errorMessage: r.errorMessage,
        })),
      },
    },
  });

  return {
    id: created.id,
    createdAt: created.createdAt,
    metrics,
    scenarioResults,
  };
}
