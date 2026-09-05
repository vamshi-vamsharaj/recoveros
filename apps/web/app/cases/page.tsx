"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { RecoveryCaseListItem, RecoveryCaseSourceType, RecoveryCaseStatus } from "@/types";
import { CaseFiltersBar } from "@/components/cases/CaseFiltersBar";
import { CasesTable, CasesTableSkeleton } from "@/components/cases/CasesTable";
import { ErrorState } from "@/components/ui/States";

export default function CasesPage() {
  const [cases, setCases] = useState<RecoveryCaseListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<RecoveryCaseStatus | "ALL">("ALL");
  const [sourceType, setSourceType] = useState<RecoveryCaseSourceType | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getCases({
        status: status === "ALL" ? undefined : status,
        sourceType: sourceType === "ALL" ? undefined : sourceType,
        q: search.trim() || undefined,
      });
      setCases(result.cases);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong loading cases.");
    } finally {
      setLoading(false);
    }
  }, [status, sourceType, search]);

  useEffect(() => {
    const timeout = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [load, search]);

  const pendingCount = useMemo(
    () => cases?.filter((c) => c.status === "PENDING_APPROVAL").length ?? 0,
    [cases]
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Recovery Cases</h1>
        <p className="text-sm text-muted">
          {pendingCount > 0
            ? `${pendingCount} case${pendingCount === 1 ? "" : "s"} waiting on your review.`
            : "Every recovery case detected across your workflows."}
        </p>
      </div>

      <CaseFiltersBar
        status={status}
        sourceType={sourceType}
        search={search}
        onStatusChange={setStatus}
        onSourceTypeChange={setSourceType}
        onSearchChange={setSearch}
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <CasesTableSkeleton />
      ) : (
        <CasesTable cases={cases ?? []} />
      )}
    </div>
  );
}
