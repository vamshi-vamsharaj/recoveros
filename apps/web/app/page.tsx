"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { DashboardResponse } from "@/types";
import { MetricsPanel, MetricsPanelSkeleton } from "@/components/dashboard/MetricsPanel";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { WorkflowBreakdown } from "@/components/dashboard/WorkflowBreakdown";
import { StatusOverview } from "@/components/dashboard/StatusOverview";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/States";
import { ErrorState } from "@/components/ui/States";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDashboard();
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong loading the dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Overview</h1>
        <p className="text-sm text-muted">Revenue at risk and recovery performance across every workflow.</p>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && (loading ? <MetricsPanelSkeleton /> : data && <MetricsPanel metrics={data.metrics} />)}

      {!error && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Recovery trend (14 days)">
              {loading ? <Skeleton className="h-44 w-full" /> : data && <TrendChart trend={data.trend} />}
            </Panel>
          </div>
          <Panel title="By workflow">
            {loading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              data && <WorkflowBreakdown breakdown={data.workflowBreakdown} />
            )}
          </Panel>
        </div>
      )}

      {!error && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Panel title="Status overview">
            {loading ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              data && <StatusOverview statusOverview={data.statusOverview} />
            )}
          </Panel>
          <div className="lg:col-span-2">
            <Panel title="Recent activity">
              {loading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                data && <RecentActivity activity={data.recentActivity} />
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
