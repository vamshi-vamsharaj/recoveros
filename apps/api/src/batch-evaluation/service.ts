import type { Prisma, PrismaClient } from "@prisma/client";
import { generateScenarios } from "./scenarios.js";
import type { BatchScenario } from "./types.js";
import { evaluateAllScenarios } from "./runner.js";
import { calculateBatchMetrics } from "./metrics.js";
import type {
  BatchEvaluationDetail,
  BatchEvaluationSummary,
  BatchMetrics,
  ScenarioEvaluationResult,
} from "./types.js";

function toSummary(row: {
  id: string;
  status: string;
  scenarioCount: number;
  createdAt: Date;
  completedAt: Date | null;
  metrics: unknown;
}): BatchEvaluationSummary {
  return {
    id: row.id,
    status: row.status as BatchEvaluationSummary["status"],
    scenarioCount: row.scenarioCount,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    metrics: (row.metrics as unknown as BatchMetrics | null) ?? null,
  };
}

/**
 * Runs a full batch evaluation: generates the deterministic scenario
 * set, routes every scenario through the real Recovery Engine (see
 * runner.ts), computes metrics with the pure metrics engine, and
 * persists the batch plus every scenario result. Returns the same
 * frontend-ready shape GET /api/batch-evaluation/:id returns.
 */
export async function runBatchEvaluation(prisma: PrismaClient): Promise<BatchEvaluationDetail> {
  const scenarios = generateScenarios();

  const batchEvaluation = await prisma.batchEvaluation.create({
    data: {
      status: "RUNNING",
      scenarioCount: scenarios.length,
    },
  });

  let results: ScenarioEvaluationResult[];
  try {
    results = await evaluateAllScenarios(prisma, scenarios);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.batchEvaluation.update({
      where: { id: batchEvaluation.id },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    throw err;
  }

  const metrics = calculateBatchMetrics(results);

  await prisma.$transaction([
    prisma.batchScenarioResult.createMany({
      data: results.map((r) => ({
        batchEvaluationId: batchEvaluation.id,
        scenarioId: r.scenarioId,
        workflow: r.workflow,
        amount: r.amount,
        currency: r.currency,
        recoveryCaseId: r.recoveryCaseId,
        recoverOsStatus: r.recoverOsStatus,
        recoverOsRecoveredAmount: r.recoverOsRecoveredAmount,
        approvalRequired: r.approvalRequired,
        baselineRecovered: r.baselineRecovered,
        baselineRecoveredAmount: r.baselineRecoveredAmount,
      })),
    }),
    prisma.batchEvaluation.update({
      where: { id: batchEvaluation.id },
      data: {
        status: "COMPLETED",
        metrics: metrics as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    }),
  ]);

  return {
    id: batchEvaluation.id,
    status: "COMPLETED",
    scenarioCount: scenarios.length,
    createdAt: batchEvaluation.createdAt,
    completedAt: new Date(),
    errorMessage: null,
    metrics,
    scenarios: results,
  };
}

export async function listBatchEvaluations(
  prisma: PrismaClient,
  take = 20
): Promise<BatchEvaluationSummary[]> {
  const rows = await prisma.batchEvaluation.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      scenarioCount: true,
      createdAt: true,
      completedAt: true,
      metrics: true,
    },
  });

  return rows.map(toSummary);
}

export async function getBatchEvaluationById(
  prisma: PrismaClient,
  id: string
): Promise<BatchEvaluationDetail | null> {
  const row = await prisma.batchEvaluation.findUnique({
    where: { id },
    include: {
      scenarioResults: { orderBy: { scenarioId: "asc" } },
    },
  });

  if (!row) return null;

  // Scenario definitions are a pure function of the scenario id (see
  // scenarios.ts) -- `condition` and `riskTier` are re-derived here
  // rather than duplicated as extra columns on BatchScenarioResult,
  // keeping the Milestone 8 schema change additive-minimal.
  const scenarioDefinitionsById = new Map<string, BatchScenario>(
    generateScenarios().map((s) => [s.id, s])
  );

  return {
    ...toSummary(row),
    errorMessage: row.errorMessage,
    scenarios: row.scenarioResults.map((r) => {
      const definition = scenarioDefinitionsById.get(r.scenarioId);
      return {
        scenarioId: r.scenarioId,
        workflow: r.workflow as ScenarioEvaluationResult["workflow"],
        amount: r.amount,
        currency: r.currency,
        condition: definition?.condition ?? "",
        riskTier: definition?.riskTier ?? "LOW",
        recoveryCaseId: r.recoveryCaseId ?? "",
        recoverOsStatus: r.recoverOsStatus,
        recoverOsRecoveredAmount: r.recoverOsRecoveredAmount,
        approvalRequired: r.approvalRequired,
        baselineRecovered: r.baselineRecovered,
        baselineRecoveredAmount: r.baselineRecoveredAmount,
      };
    }),
  };
}
