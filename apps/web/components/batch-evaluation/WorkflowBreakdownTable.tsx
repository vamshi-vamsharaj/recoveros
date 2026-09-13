import { formatAmount, formatPercent, WORKFLOW_LABEL } from "@/lib/format";
import type { WorkflowMetrics } from "@/types";
import { EmptyState } from "@/components/ui/States";

interface WorkflowBreakdownTableProps {
  breakdown: WorkflowMetrics[];
}

export function WorkflowBreakdownTable({ breakdown }: WorkflowBreakdownTableProps) {
  if (breakdown.length === 0) {
    return <EmptyState title="No workflow results yet" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-muted">
            <th className="pb-2 pr-4 font-semibold">Workflow</th>
            <th className="pb-2 pr-4 font-semibold">Scenarios</th>
            <th className="pb-2 pr-4 font-semibold">Revenue at risk</th>
            <th className="pb-2 pr-4 font-semibold">Recovered</th>
            <th className="pb-2 font-semibold">Recovery rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {breakdown.map((row) => (
            <tr key={row.workflow}>
              <td className="py-2.5 pr-4 font-medium text-ink">
                {WORKFLOW_LABEL[row.workflow] ?? row.workflow}
              </td>
              <td className="py-2.5 pr-4 font-mono text-muted">{row.scenarios}</td>
              <td className="py-2.5 pr-4 font-mono text-ink">
                {formatAmount(row.revenueAtRisk, "INR")}
              </td>
              <td className="py-2.5 pr-4 font-mono text-ink">
                {formatAmount(row.recoveredRevenue, "INR")}
              </td>
              <td className="py-2.5 font-mono text-ink">{formatPercent(row.recoveryRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
