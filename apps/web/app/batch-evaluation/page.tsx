"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { BatchEvaluationDetail } from "@/types/batch-evaluation";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { HeroSummary, HeroSummarySkeleton } from "@/components/batch-evaluation/HeroSummary";
import { ComparisonChart, ComparisonChartSkeleton } from "@/components/batch-evaluation/ComparisonChart";
import { InsightsPanel } from "@/components/batch-evaluation/InsightsPanel";
import { WorkflowTable, WorkflowTableSkeleton } from "@/components/batch-evaluation/WorkflowTable";
import { ScenarioTable } from "@/components/batch-evaluation/ScenarioTable";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";

export default function BatchEvaluationPage() {
  const [latest, setLatest] = useState<BatchEvaluationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.getBatchEvaluations();
      const mostRecent = list.batchEvaluations[0];
      if (!mostRecent) {
        setLatest(null);
        return;
      }
      const detail = await api.getBatchEvaluation(mostRecent.id);
      setLatest(detail.batchEvaluation);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong loading batch evaluations."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setJustCompleted(false);
    try {
      const result = await api.runBatchEvaluation();
      setLatest(result.batchEvaluation);
      setJustCompleted(true);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : "The batch evaluation run failed.");
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Batch Evaluation</h1>
          <p className="max-w-xl text-sm text-muted">
            Runs deterministic synthetic scenarios across all six recovery workflows through the
            real RecoverOS engine, and compares the outcome against a deterministic baseline
            recovery process.
          </p>
          {latest && !loading && (
            <p className="mt-1.5 text-xs text-muted">
              Latest run: {formatDate(latest.createdAt)} ({formatRelativeTime(latest.createdAt)}) ·{" "}
              {latest.scenarioCount} scenarios
            </p>
          )}
        </div>
        <Button onClick={handleRun} loading={running} disabled={running} className="shrink-0">
          {running ? "Running batch evaluation..." : "Run Batch Evaluation"}
        </Button>
      </div>

      {runError && <ErrorState message={runError} onRetry={handleRun} />}

      {justCompleted && !runError && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Batch evaluation completed successfully.
        </div>
      )}

      {error && <ErrorState message={error} onRetry={loadLatest} />}

      {!error && loading && (
        <div className="flex flex-col gap-6">
          <HeroSummarySkeleton />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="RecoverOS vs Baseline">
                <ComparisonChartSkeleton />
              </Panel>
            </div>
            <Panel title="Performance insights">
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </Panel>
          </div>
          <Panel title="Workflow performance">
            <WorkflowTableSkeleton />
          </Panel>
        </div>
      )}

      {!error && !loading && !latest && (
        <EmptyState
          title="No batch evaluation has been run yet"
          description="Run a batch evaluation to see how RecoverOS performs across all six workflows compared to a deterministic baseline."
          action={
            <Button onClick={handleRun} loading={running} disabled={running}>
              Run Batch Evaluation
            </Button>
          }
        />
      )}

      {!error && !loading && latest && latest.metrics && (
        <div className="flex flex-col gap-6">
          <HeroSummary metrics={latest.metrics} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel title="RecoverOS vs Baseline">
                <ComparisonChart metrics={latest.metrics} />
              </Panel>
            </div>
            <Panel title="Performance insights">
              <InsightsPanel metrics={latest.metrics} />
            </Panel>
          </div>

          <Panel title="Workflow performance">
            <WorkflowTable breakdown={latest.metrics.workflowBreakdown} />
          </Panel>

          <Panel title="Scenario results">
            <ScenarioTable scenarios={latest.scenarios} />
          </Panel>
        </div>
      )}

      {!error && !loading && latest && latest.status === "FAILED" && (
        <ErrorState
          message={latest.errorMessage ?? "The most recent batch evaluation failed."}
          onRetry={handleRun}
        />
      )}
    </div>
  );
}
