import { formatAmount, formatSignedPercent } from "@/lib/format";
import type { BatchMetrics } from "@/types/batch-evaluation";

function StatRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[17px] font-medium text-ink">{value}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
    </div>
  );
}

export function HeroSummary({ metrics }: { metrics: BatchMetrics }) {
  const { overall, comparison } = metrics;
  const improvement = comparison.percentageImprovementOverBaseline;
  const isPositive = improvement === null ? true : improvement >= 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div
        className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-line bg-gradient-to-br from-accent-soft to-surface p-6 lg:col-span-2"
        style={{ boxShadow: "var(--shadow-md)" }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent opacity-10"
          aria-hidden
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent-strong">
          Improvement vs Baseline
        </span>
        <div className="mt-3 flex items-end gap-2">
          <span className="font-mono text-[44px] font-semibold leading-none tracking-tight text-ink md:text-[52px]">
            {formatSignedPercent(improvement)}
          </span>
        </div>
        <p className="mt-3 max-w-xs text-sm text-muted">
          {isPositive
            ? "Additional revenue RecoverOS recovered on top of the deterministic baseline process."
            : "RecoverOS underperformed the deterministic baseline on this batch."}
        </p>
        <div className="mt-5 border-t border-line/60 pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted">Additional revenue recovered</span>
            <span className="font-mono text-sm font-medium text-accent-strong">
              {formatAmount(comparison.additionalRevenueRecovered, "INR")}
            </span>
          </div>
        </div>
      </div>

      <div
        className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface px-5 py-1 lg:col-span-3"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <StatRow label="Revenue at risk" value={formatAmount(overall.totalRevenueAtRisk, "INR")} />
        <StatRow
          label="RecoverOS recovered"
          value={formatAmount(overall.totalRecoveredRevenue, "INR")}
          hint={`${overall.recoveredCases} of ${overall.totalScenarios} scenarios`}
        />
        <StatRow
          label="Recovery rate"
          value={overall.recoveryRate === null ? "--" : `${Math.round(overall.recoveryRate * 100)}%`}
        />
        <StatRow
          label="Requires human approval"
          value={String(overall.approvalRequiredCases)}
          hint="high-value cases"
        />
      </div>
    </div>
  );
}

export function HeroSummarySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="h-52 animate-pulse rounded-xl border border-line bg-neutral-soft lg:col-span-2" />
      <div className="h-52 animate-pulse rounded-xl border border-line bg-neutral-soft lg:col-span-3" />
    </div>
  );
}
