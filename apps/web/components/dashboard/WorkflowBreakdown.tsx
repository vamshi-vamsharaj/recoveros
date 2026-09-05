import type { DashboardResponse } from "@/types";
import { SOURCE_TYPE_LABEL } from "@/lib/format";
import { EmptyState } from "@/components/ui/States";

export function WorkflowBreakdown({
  breakdown,
}: {
  breakdown: DashboardResponse["workflowBreakdown"];
}) {
  if (breakdown.length === 0) {
    return <EmptyState title="No recovery cases yet" />;
  }

  const maxCases = Math.max(1, ...breakdown.map((b) => b.cases));

  return (
    <ul className="flex flex-col divide-y divide-line">
      {breakdown.map((row) => (
        <li key={row.sourceType} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">{SOURCE_TYPE_LABEL[row.sourceType]}</span>
            <span className="font-mono text-muted">{row.cases}</span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-soft">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(row.cases / maxCases) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
