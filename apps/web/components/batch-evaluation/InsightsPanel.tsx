import type { BatchMetrics } from "@/types/batch-evaluation";
import { BATCH_WORKFLOW_LABEL, formatAmount, formatSignedPercent } from "@/lib/format";

function InsightRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-strong">
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="text-sm text-muted">{label}</span>
        <span className="text-sm font-medium text-ink">{value}</span>
      </div>
    </li>
  );
}

const ICONS = {
  revenue: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" />
    </svg>
  ),
  trophy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 5H4a2 2 0 0 0 2 5M17 5h3a2 2 0 0 1-2 5" strokeLinecap="round" />
    </svg>
  ),
  trend: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 17l6-6 4 4 8-8M15 7h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  approval: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function InsightsPanel({ metrics }: { metrics: BatchMetrics }) {
  const { comparison, overall, workflowBreakdown } = metrics;

  const withImprovement = workflowBreakdown.filter((w) => w.improvementPercentage !== null);
  const strongest = [...withImprovement].sort(
    (a, b) => (b.recoveryRate ?? 0) - (a.recoveryRate ?? 0)
  )[0];
  const largestImprovement = [...withImprovement].sort(
    (a, b) => (b.improvementPercentage ?? 0) - (a.improvementPercentage ?? 0)
  )[0];

  return (
    <ul className="flex flex-col divide-y divide-line">
      <InsightRow
        icon={ICONS.revenue}
        label="Additional revenue recovered vs baseline"
        value={formatAmount(comparison.additionalRevenueRecovered, "INR")}
      />
      {strongest && (
        <InsightRow
          icon={ICONS.trophy}
          label="Strongest performing workflow"
          value={`${BATCH_WORKFLOW_LABEL[strongest.workflow]} · ${
            strongest.recoveryRate === null ? "--" : `${Math.round(strongest.recoveryRate * 100)}%`
          } recovery rate`}
        />
      )}
      {largestImprovement && (
        <InsightRow
          icon={ICONS.trend}
          label="Largest improvement over baseline"
          value={`${BATCH_WORKFLOW_LABEL[largestImprovement.workflow]} · ${formatSignedPercent(
            largestImprovement.improvementPercentage
          )}`}
        />
      )}
      <InsightRow
        icon={ICONS.approval}
        label="Cases requiring human approval"
        value={`${overall.approvalRequiredCases} of ${overall.totalScenarios} scenarios`}
      />
    </ul>
  );
}
