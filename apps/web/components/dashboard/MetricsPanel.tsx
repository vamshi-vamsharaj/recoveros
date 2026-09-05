import { formatAmount } from "@/lib/format";
import type { DashboardResponse } from "@/types";
import { Skeleton } from "@/components/ui/States";

interface MetricsPanelProps {
  metrics: DashboardResponse["metrics"];
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

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  const successRate =
    metrics.successRate === null ? "--" : `${Math.round(metrics.successRate * 100)}%`;

  return (
    <div
      className="grid grid-cols-2 divide-y divide-line rounded-xl border border-line bg-surface md:grid-cols-4 md:divide-x md:divide-y-0"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <Metric label="Revenue at risk" value={formatAmount(metrics.revenueAtRisk, "INR")} />
      <Metric label="Revenue recovered" value={formatAmount(metrics.revenueRecovered, "INR")} />
      <Metric label="Active cases" value={String(metrics.activeCases)} />
      <Metric
        label="Recovery success rate"
        value={successRate}
        hint="Of resolved cases"
      />
    </div>
  );
}

export function MetricsPanelSkeleton() {
  return (
    <div className="grid grid-cols-2 divide-y divide-line rounded-xl border border-line bg-surface md:grid-cols-4 md:divide-x md:divide-y-0">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-1 flex-col gap-2 px-5 py-5 md:px-6">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}
