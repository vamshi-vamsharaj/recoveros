import { formatAmount, formatPercent } from "@/lib/format";
import type { BatchMetrics } from "@/types";
import { Skeleton } from "@/components/ui/States";

interface BatchMetricsPanelProps {
  metrics: BatchMetrics;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 px-5 py-5 first:pl-0 last:pr-0 md:px-6">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="font-mono text-[26px] font-medium leading-none tracking-tight text-ink md:text-[30px]">
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function BatchMetricsPanel({ metrics }: BatchMetricsPanelProps) {
  const improvement = metrics.improvementOverBaseline;
  const improvementLabel =
    improvement === null
      ? "--"
      : `${improvement >= 0 ? "+" : ""}${(improvement * 100).toFixed(1)} pts`;

  return (
    <div
      className="grid grid-cols-2 divide-y divide-line rounded-xl border border-line bg-surface md:grid-cols-3 md:divide-x md:divide-y-0 lg:grid-cols-6"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <Metric label="Revenue at risk" value={formatAmount(metrics.totalRevenueAtRisk, "INR")} />
      <Metric label="Revenue recovered" value={formatAmount(metrics.recoveredRevenue, "INR")} />
      <Metric label="Recovery rate" value={formatPercent(metrics.recoveryRate)} />
      <Metric label="Cases recovered" value={String(metrics.recoveredCases)} hint={`of ${metrics.totalScenarios}`} />
      <Metric label="Baseline recovery rate" value={formatPercent(metrics.baselineRecoveryRate)} />
      <Metric
        label="RecoverOS improvement"
        value={improvementLabel}
        hint="vs. baseline recovery rate"
      />
    </div>
  );
}

export function BatchMetricsPanelSkeleton() {
  return (
    <div className="grid grid-cols-2 divide-y divide-line rounded-xl border border-line bg-surface md:grid-cols-3 md:divide-x md:divide-y-0 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-1 flex-col gap-2 px-5 py-5 md:px-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}
