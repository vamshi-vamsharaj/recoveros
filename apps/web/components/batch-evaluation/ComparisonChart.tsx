"use client";

import type { BatchMetrics } from "@/types/batch-evaluation";
import { formatAmount } from "@/lib/format";

const WIDTH = 560;
const BAR_HEIGHT = 28;
const LABEL_WIDTH = 108;

interface BarDatum {
  label: string;
  baseline: number;
  current: number;
  formatValue: (n: number) => string;
}

function BarGroup({ datum, maxValue, y }: { datum: BarDatum; maxValue: number; y: number }) {
  const trackWidth = WIDTH - LABEL_WIDTH - 16;
  const baselineWidth = maxValue > 0 ? (datum.baseline / maxValue) * trackWidth : 0;
  const currentWidth = maxValue > 0 ? (datum.current / maxValue) * trackWidth : 0;

  return (
    <g transform={`translate(0, ${y})`}>
      <text
        x={0}
        y={BAR_HEIGHT / 2 - 8}
        className="fill-muted"
        style={{ font: "500 11px var(--font-sans)" }}
      >
        {datum.label}
      </text>

      <g transform={`translate(${LABEL_WIDTH}, -12)`}>
        <rect x={0} y={0} width={trackWidth} height={10} rx={5} fill="var(--neutral-soft)" />
        <rect x={0} y={0} width={baselineWidth} height={10} rx={5} fill="var(--line-strong)" />
        <text x={trackWidth + 8} y={9} className="fill-muted" style={{ font: "500 11px var(--font-mono)" }}>
          {datum.formatValue(datum.baseline)}
        </text>
      </g>

      <g transform={`translate(${LABEL_WIDTH}, 6)`}>
        <rect x={0} y={0} width={trackWidth} height={10} rx={5} fill="var(--neutral-soft)" />
        <rect x={0} y={0} width={currentWidth} height={10} rx={5} fill="var(--accent)" />
        <text x={trackWidth + 8} y={9} className="fill-ink" style={{ font: "600 11px var(--font-mono)" }}>
          {datum.formatValue(datum.current)}
        </text>
      </g>
    </g>
  );
}

export function ComparisonChart({ metrics }: { metrics: BatchMetrics }) {
  const { overall, baseline } = metrics;

  const data: BarDatum[] = [
    {
      label: "Recovered revenue",
      baseline: baseline.baselineRecoveredRevenue,
      current: overall.totalRecoveredRevenue,
      formatValue: (n) => formatAmount(n, "INR"),
    },
    {
      label: "Recovery rate",
      baseline: baseline.baselineRecoveryRate ? baseline.baselineRecoveryRate * 100 : 0,
      current: overall.recoveryRate ? overall.recoveryRate * 100 : 0,
      formatValue: (n) => `${Math.round(n)}%`,
    },
  ];

  const maxRevenue = Math.max(baseline.baselineRecoveredRevenue, overall.totalRecoveredRevenue, 1);
  const maxRate = 100;
  const groupSpacing = BAR_HEIGHT + 22;

  return (
    <div className="flex flex-col gap-4">
      <svg
        viewBox={`0 0 ${WIDTH} ${data.length * groupSpacing + 12}`}
        className="w-full"
        role="img"
        aria-label="RecoverOS versus baseline recovered revenue and recovery rate"
      >
        {data.map((datum, i) => (
          <BarGroup
            key={datum.label}
            datum={datum}
            maxValue={datum.label === "Recovery rate" ? maxRate : maxRevenue}
            y={i * groupSpacing + 24}
          />
        ))}
      </svg>

      <div className="flex items-center gap-5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--line-strong)" }} aria-hidden />
          Baseline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
          RecoverOS
        </span>
      </div>
    </div>
  );
}

export function ComparisonChartSkeleton() {
  return <div className="h-40 w-full animate-pulse rounded-lg bg-neutral-soft" />;
}
