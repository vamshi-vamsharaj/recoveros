"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import type { RecoveryCaseDetailResponse } from "@/types";
import {
  AiRecommendation,
  CaseOverview,
  PolicyEvaluationPanel,
  RecoveryAttempts,
  RecoveryTimeline,
} from "@/components/cases/CaseDetailPanels";
import { ApprovalActions } from "@/components/cases/ApprovalActions";
import { ErrorState, Skeleton } from "@/components/ui/States";

export default function CaseDetailPage({ params }: PageProps<"/cases/[id]">) {
  const { id } = use(params);

  const [data, setData] = useState<RecoveryCaseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getCase(id);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong loading this case.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Case not found."} onRetry={load} />;
  }

  const latestDecision = data.decisions[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Link href="/cases" className="hover:text-ink">
          Recovery Cases
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono text-xs text-ink">{id.slice(0, 8)}</span>
      </div>

      {data.case.status === "PENDING_APPROVAL" && (
        <ApprovalActions caseId={id} onResolved={load} />
      )}

      <CaseOverview data={data.case} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <AiRecommendation decision={latestDecision} />
          <PolicyEvaluationPanel decision={latestDecision} />
          <RecoveryTimeline timeline={data.timeline} />
        </div>
        <RecoveryAttempts attempts={data.attempts} />
      </div>
    </div>
  );
}
