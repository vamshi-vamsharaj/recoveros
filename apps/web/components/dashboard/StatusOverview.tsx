import type { DashboardResponse } from "@/types";
import { STATUS_LABEL, STATUS_TONE, type StatusTone } from "@/lib/format";
import { EmptyState } from "@/components/ui/States";

const TONE_BG: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
  neutral: "bg-neutral",
};

export function StatusOverview({
  statusOverview,
}: {
  statusOverview: DashboardResponse["statusOverview"];
}) {
  const total = statusOverview.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return <EmptyState title="No recovery cases yet" />;
  }

  const sorted = [...statusOverview].sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-soft">
        {sorted.map((s) => (
          <div
            key={s.status}
            className={TONE_BG[STATUS_TONE[s.status]]}
            style={{ width: `${(s.count / total) * 100}%` }}
            title={`${STATUS_LABEL[s.status]}: ${s.count}`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {sorted.map((s) => (
          <li key={s.status} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-muted">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${TONE_BG[STATUS_TONE[s.status]]}`}
                aria-hidden
              />
              {STATUS_LABEL[s.status]}
            </span>
            <span className="font-mono text-ink">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
