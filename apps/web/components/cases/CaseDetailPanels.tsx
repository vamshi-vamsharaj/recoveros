import type { RecoveryCaseDetailResponse } from "@/types";
import { SOURCE_TYPE_LABEL, formatAmount, formatDate, formatEventType } from "@/lib/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/States";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

export function CaseOverview({ data }: { data: RecoveryCaseDetailResponse["case"] }) {
  return (
    <Panel title="Case overview" action={<StatusBadge status={data.status} />}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Customer" value={data.customer.name} />
        <Field label="Email" value={data.customer.email} />
        <Field label="Workflow" value={SOURCE_TYPE_LABEL[data.sourceType]} />
        <Field label="Amount" value={formatAmount(data.amount, data.currency)} />
        <Field
          label="Recovered"
          value={data.recoveredAmount != null ? formatAmount(data.recoveredAmount, data.currency) : "--"}
        />
        <Field label="Detected" value={formatDate(data.createdAt)} />
      </div>
      {data.failureReason && (
        <div className="mt-4 rounded-md bg-neutral-soft px-3 py-2 text-sm text-muted">
          Failure reason: {data.failureReason}
        </div>
      )}
    </Panel>
  );
}

export function AiRecommendation({
  decision,
}: {
  decision: RecoveryCaseDetailResponse["decisions"][number] | undefined;
}) {
  if (!decision) {
    return (
      <Panel title="AI recommendation">
        <EmptyState title="No recommendation yet" />
      </Panel>
    );
  }

  const confidenceTone =
    decision.confidence === "HIGH"
      ? "text-success"
      : decision.confidence === "MEDIUM"
        ? "text-warning"
        : "text-danger";

  return (
    <Panel title="AI recommendation">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">
            {decision.strategy.replaceAll("_", " ")}
          </span>
          <span className={`text-xs font-medium ${confidenceTone}`}>
            {decision.confidence.charAt(0) + decision.confidence.slice(1).toLowerCase()} confidence
          </span>
        </div>
        <p className="text-sm text-muted">{decision.reason}</p>
        <span className="text-xs text-muted">Provider: {decision.providerName}</span>
      </div>
    </Panel>
  );
}

export function PolicyEvaluationPanel({
  decision,
}: {
  decision: RecoveryCaseDetailResponse["decisions"][number] | undefined;
}) {
  const evaluation = decision?.policyEvaluation;

  return (
    <Panel title="Policy evaluation">
      {!evaluation ? (
        <EmptyState title="Not evaluated yet" />
      ) : (
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
              evaluation.result === "APPROVED" ? "bg-success" : "bg-danger"
            }`}
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium text-ink">
              {evaluation.result === "APPROVED" ? "Allowed by policy" : "Blocked by policy"}
            </p>
            <p className="text-sm text-muted">{evaluation.reason}</p>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function RecoveryTimeline({
  timeline,
}: {
  timeline: RecoveryCaseDetailResponse["timeline"];
}) {
  return (
    <Panel title="Recovery timeline">
      {timeline.length === 0 ? (
        <EmptyState title="No events recorded yet" />
      ) : (
        <ol className="flex flex-col gap-4">
          {timeline.map((event, i) => (
            <li key={event.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
                {i < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-line" aria-hidden />}
              </div>
              <div className="flex-1 pb-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-ink">{formatEventType(event.eventType)}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {formatDate(event.createdAt)}
                  </span>
                </div>
                <span className="text-xs text-muted">{event.actor}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function RecoveryAttempts({
  attempts,
}: {
  attempts: RecoveryCaseDetailResponse["attempts"];
}) {
  return (
    <Panel title="Recovery attempts">
      {attempts.length === 0 ? (
        <EmptyState title="No attempts yet" description="An attempt is created once a strategy executes." />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {attempts.map((attempt) => (
            <li key={attempt.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <div className="text-sm text-ink">{attempt.adapterName}</div>
                <div className="text-xs text-muted">{formatDate(attempt.createdAt)}</div>
              </div>
              <div className="text-right">
                <div
                  className={`text-sm font-medium ${
                    attempt.status === "RECOVERED"
                      ? "text-success"
                      : attempt.status === "FAILED"
                        ? "text-danger"
                        : "text-accent"
                  }`}
                >
                  {attempt.status.charAt(0) + attempt.status.slice(1).toLowerCase()}
                </div>
                {attempt.providerReference && (
                  <div className="font-mono text-xs text-muted">{attempt.providerReference}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
