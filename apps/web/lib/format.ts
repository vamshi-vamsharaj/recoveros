import type { RecoveryCaseSourceType, RecoveryCaseStatus } from "@/types";

export function formatAmount(amountInSmallestUnit: number, currency: string): string {
  const value = amountInSmallestUnit / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export const SOURCE_TYPE_LABEL: Record<RecoveryCaseSourceType, string> = {
  PAYMENT: "Payment degradation",
  CHECKOUT_SESSION: "Checkout drop-off",
  SUBSCRIPTION: "Subscription failure",
  INVOICE: "Invoice overdue",
  MANDATE: "Mandate retry",
};

export const STATUS_LABEL: Record<RecoveryCaseStatus, string> = {
  DETECTED: "Detected",
  RECOMMENDED: "Recommended",
  PENDING_APPROVAL: "Needs approval",
  APPROVED: "Approved",
  EXECUTING: "Executing",
  RECOVERED: "Recovered",
  BLOCKED: "Blocked",
  REJECTED: "Rejected",
  FAILED: "Failed",
};

export type StatusTone = "success" | "warning" | "danger" | "accent" | "neutral";

export const STATUS_TONE: Record<RecoveryCaseStatus, StatusTone> = {
  DETECTED: "neutral",
  RECOMMENDED: "neutral",
  PENDING_APPROVAL: "warning",
  APPROVED: "accent",
  EXECUTING: "accent",
  RECOVERED: "success",
  BLOCKED: "danger",
  REJECTED: "danger",
  FAILED: "danger",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  RECOVERY_CASE_CREATED: "Case created",
  DECISION_CREATED: "AI recommendation created",
  POLICY_EVALUATED: "Policy evaluated",
  ACTION_APPROVED: "Auto-approved",
  ACTION_BLOCKED: "Blocked by policy",
  APPROVAL_REQUESTED: "Sent for approval",
  APPROVAL_GRANTED: "Approved by operator",
  APPROVAL_REJECTED: "Rejected by operator",
  EXECUTION_STARTED: "Execution started",
  EXECUTION_COMPLETED: "Execution completed",
  RECOVERY_VERIFIED: "Outcome verified",
  WEBHOOK_RECEIVED: "Webhook received",
  WEBHOOK_DUPLICATE_IGNORED: "Duplicate webhook ignored",
  WEBHOOK_SIGNATURE_INVALID: "Invalid webhook signature",
  WEBHOOK_PROCESSED: "Webhook processed",
};

export function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABEL[eventType] ?? eventType;
}
