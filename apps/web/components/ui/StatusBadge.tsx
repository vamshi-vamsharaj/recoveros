import type { RecoveryCaseStatus } from "@/types";
import { STATUS_LABEL, STATUS_TONE, type StatusTone } from "@/lib/format";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "text-success bg-success-soft border-transparent",
  warning: "text-warning bg-warning-soft border-transparent",
  danger: "text-danger bg-danger-soft border-transparent",
  accent: "text-accent bg-accent-soft border-transparent",
  neutral: "text-muted bg-neutral-soft border-transparent",
};

export function StatusBadge({ status }: { status: RecoveryCaseStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "currentColor" }}
        aria-hidden
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
