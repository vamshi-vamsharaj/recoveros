"use client";

import { useRouter } from "next/navigation";
import type { RecoveryCaseListItem } from "@/types";
import { SOURCE_TYPE_LABEL, formatAmount, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/States";

function ConfidencePill({ confidence }: { confidence: RecoveryCaseListItem["confidence"] }) {
  if (!confidence) return <span className="text-muted">--</span>;
  const dotClass =
    confidence === "HIGH" ? "bg-success" : confidence === "MEDIUM" ? "bg-warning" : "bg-danger";
  return (
    <span className="inline-flex items-center gap-1.5 text-ink">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
      {confidence.charAt(0) + confidence.slice(1).toLowerCase()}
    </span>
  );
}

export function CasesTable({ cases }: { cases: RecoveryCaseListItem[] }) {
  const router = useRouter();

  if (cases.length === 0) {
    return (
      <EmptyState
        title="No cases match these filters"
        description="Try clearing a filter or adjusting your search."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-muted">
            <th className="px-4 py-3 font-medium">Case</th>
            <th className="px-4 py-3 font-medium">Customer</th>
            <th className="px-4 py-3 font-medium">Workflow</th>
            <th className="px-4 py-3 text-right font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">AI confidence</th>
            <th className="px-4 py-3 font-medium">Strategy</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {cases.map((c) => (
            <tr
              key={c.id}
              onClick={() => router.push(`/cases/${c.id}`)}
              className="cursor-pointer hover:bg-neutral-soft"
            >
              <td className="px-4 py-3 font-mono text-xs text-muted">{c.id.slice(0, 8)}</td>
              <td className="px-4 py-3">
                <div className="text-ink">{c.customerName}</div>
                <div className="text-xs text-muted">{c.customerEmail}</div>
              </td>
              <td className="px-4 py-3 text-ink">{SOURCE_TYPE_LABEL[c.sourceType]}</td>
              <td className="px-4 py-3 text-right font-mono text-ink">
                {formatAmount(c.amount, c.currency)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={c.status} />
              </td>
              <td className="px-4 py-3">
                <ConfidencePill confidence={c.confidence} />
              </td>
              <td className="px-4 py-3 text-ink">{c.strategy ? c.strategy.replaceAll("_", " ") : "--"}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{formatDate(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CasesTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="divide-y divide-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-3 w-16 animate-pulse rounded bg-neutral-soft" />
            <div className="h-3 w-28 animate-pulse rounded bg-neutral-soft" />
            <div className="h-3 w-24 animate-pulse rounded bg-neutral-soft" />
            <div className="ml-auto h-3 w-20 animate-pulse rounded bg-neutral-soft" />
          </div>
        ))}
      </div>
    </div>
  );
}
