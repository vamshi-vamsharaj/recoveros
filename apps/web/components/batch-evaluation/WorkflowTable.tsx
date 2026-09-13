import type { WorkflowMetrics } from "@/types/batch-evaluation";
import { BATCH_WORKFLOW_LABEL, formatAmount, formatSignedPercent } from "@/lib/format";

function ImprovementCell({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-muted">--</span>;
  }
  const tone = value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted";
  return <span className={`font-mono font-medium ${tone}`}>{formatSignedPercent(value)}</span>;
}

export function WorkflowTable({ breakdown }: { breakdown: WorkflowMetrics[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-muted">
            <th className="px-4 py-3 font-medium">Workflow</th>
            <th className="px-4 py-3 text-right font-medium">Scenarios</th>
            <th className="px-4 py-3 text-right font-medium">Revenue at risk</th>
            <th className="px-4 py-3 text-right font-medium">Recovered</th>
            <th className="px-4 py-3 text-right font-medium">RecoverOS rate</th>
            <th className="px-4 py-3 text-right font-medium">Baseline rate</th>
            <th className="px-4 py-3 text-right font-medium">Improvement</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {breakdown.map((row) => (
            <tr key={row.workflow} className="hover:bg-neutral-soft">
              <td className="px-4 py-3 font-medium text-ink">{BATCH_WORKFLOW_LABEL[row.workflow]}</td>
              <td className="px-4 py-3 text-right font-mono text-muted">{row.scenarioCount}</td>
              <td className="px-4 py-3 text-right font-mono text-ink">
                {formatAmount(row.revenueAtRisk, "INR")}
              </td>
              <td className="px-4 py-3 text-right font-mono text-ink">
                {formatAmount(row.recoveredRevenue, "INR")}
              </td>
              <td className="px-4 py-3 text-right font-mono text-ink">
                {row.recoveryRate === null ? "--" : `${Math.round(row.recoveryRate * 100)}%`}
              </td>
              <td className="px-4 py-3 text-right font-mono text-muted">
                {row.baselineRecoveryRate === null
                  ? "--"
                  : `${Math.round(row.baselineRecoveryRate * 100)}%`}
              </td>
              <td className="px-4 py-3 text-right">
                <ImprovementCell value={row.improvementPercentage} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WorkflowTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="divide-y divide-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-3 w-32 animate-pulse rounded bg-neutral-soft" />
            <div className="ml-auto h-3 w-16 animate-pulse rounded bg-neutral-soft" />
            <div className="h-3 w-20 animate-pulse rounded bg-neutral-soft" />
          </div>
        ))}
      </div>
    </div>
  );
}
