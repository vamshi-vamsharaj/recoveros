"use client";

import { useId, useState } from "react";
import type { DashboardResponse } from "@/types";
import { EmptyState } from "@/components/ui/States";

interface TrendChartProps {
  trend: DashboardResponse["trend"];
}

const WIDTH = 560;
const HEIGHT = 180;
const PAD_X = 8;
const PAD_Y = 16;

export function TrendChart({ trend }: TrendChartProps) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (trend.length === 0) {
    return (
      <EmptyState
        title="No case activity yet"
        description="Recovery cases created in the last 14 days will show up here."
      />
    );
  }

  const maxCreated = Math.max(1, ...trend.map((t) => t.casesCreated));
  const stepX = trend.length > 1 ? (WIDTH - PAD_X * 2) / (trend.length - 1) : 0;

  const points = trend.map((t, i) => {
    const x = PAD_X + i * stepX;
    const y = HEIGHT - PAD_Y - (t.casesCreated / maxCreated) * (HEIGHT - PAD_Y * 2);
    return { x, y, ...t };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]!.x},${HEIGHT - PAD_Y} L${points[0]!.x},${HEIGHT - PAD_Y} Z`;

  const active = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Recovery cases created over the last 14 days"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <line
          x1={PAD_X}
          y1={HEIGHT - PAD_Y}
          x2={WIDTH - PAD_X}
          y2={HEIGHT - PAD_Y}
          stroke="var(--line)"
        />

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" />

        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - stepX / 2}
            y={0}
            width={stepX || WIDTH}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}

        {active && (
          <>
            <line x1={active.x} y1={0} x2={active.x} y2={HEIGHT - PAD_Y} stroke="var(--line-strong)" />
            <circle cx={active.x} cy={active.y} r="3.5" fill="var(--accent)" />
          </>
        )}
      </svg>

      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{formatDay(trend[0]!.date)}</span>
        <span>{formatDay(trend[trend.length - 1]!.date)}</span>
      </div>

      {active && (
        <div className="pointer-events-none absolute left-2 top-0 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-xs shadow-sm">
          <div className="font-medium text-ink">{formatDay(active.date)}</div>
          <div className="text-muted">
            {active.casesCreated} created · {active.casesRecovered} recovered
          </div>
        </div>
      )}
    </div>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
