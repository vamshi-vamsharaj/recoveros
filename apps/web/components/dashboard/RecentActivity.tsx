import Link from "next/link";
import type { DashboardResponse } from "@/types";
import { formatEventType, formatRelativeTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/States";

export function RecentActivity({
  activity,
}: {
  activity: DashboardResponse["recentActivity"];
}) {
  if (activity.length === 0) {
    return <EmptyState title="No activity yet" description="Recovery actions will appear here as they happen." />;
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {activity.map((entry) => {
        const content = (
          <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-ink">{formatEventType(entry.eventType)}</span>
              <span className="text-xs text-muted">
                {entry.customerName ?? "System"}
                {entry.actor ? ` · ${entry.actor}` : ""}
              </span>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted">
              {formatRelativeTime(entry.createdAt)}
            </span>
          </div>
        );

        return (
          <li key={entry.id}>
            {entry.recoveryCaseId ? (
              <Link href={`/cases/${entry.recoveryCaseId}`} className="block hover:opacity-70">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
