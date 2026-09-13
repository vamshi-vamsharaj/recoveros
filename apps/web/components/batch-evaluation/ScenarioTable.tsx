"use client";

import { useMemo, useState } from "react";
import type { RecoveryCaseStatus } from "@/types";
import type { ScenarioEvaluationResult } from "@/types/batch-evaluation";
import { BATCH_WORKFLOW_LABEL, formatAmount } from "@/lib/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";

const PAGE_SIZE = 10;

function BaselineCell({ scenario }: { scenario: ScenarioEvaluationResult }) {
  if (scenario.baselineRecovered) {
    return (
      <span className="inline-flex items-center gap-1.5 text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
        Recovered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-neutral" aria-hidden />
      Not recovered
    </span>
  );
}

export function ScenarioTable({ scenarios }: { scenarios: ScenarioEvaluationResult[] }) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(scenarios.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => scenarios.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [scenarios, page]
  );

  if (scenarios.length === 0) {
    return <EmptyState title="No scenario results yet" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium text-muted">
              <th className="px-4 py-3 font-medium">Scenario</th>
              <th className="px-4 py-3 font-medium">Workflow</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">RecoverOS result</th>
              <th className="px-4 py-3 font-medium">Baseline result</th>
              <th className="px-4 py-3 text-right font-medium">Recovered amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageItems.map((scenario) => (
              <tr key={scenario.scenarioId} className="hover:bg-neutral-soft">
                <td className="px-4 py-3 font-mono text-xs text-muted">{scenario.scenarioId}</td>
                <td className="px-4 py-3 text-ink">{BATCH_WORKFLOW_LABEL[scenario.workflow]}</td>
                <td className="px-4 py-3 text-right font-mono text-ink">
                  {formatAmount(scenario.amount, scenario.currency)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={scenario.recoverOsStatus as RecoveryCaseStatus} />
                </td>
                <td className="px-4 py-3">
                  <BaselineCell scenario={scenario} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-ink">
                  {formatAmount(scenario.recoverOsRecoveredAmount, scenario.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Page {page + 1} of {totalPages} · {scenarios.length} scenarios
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
