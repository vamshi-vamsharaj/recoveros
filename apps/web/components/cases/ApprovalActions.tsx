"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface ApprovalActionsProps {
  caseId: string;
  onResolved: () => void;
}

type PendingAction = "approve" | "reject" | null;
type Feedback = { type: "success" | "error"; message: string } | null;

export function ApprovalActions({ caseId, onResolved }: ApprovalActionsProps) {
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const runAction = async (action: "approve" | "reject") => {
    setSubmitting(true);
    setFeedback(null);
    try {
      const result =
        action === "approve" ? await api.approveCase(caseId) : await api.rejectCase(caseId);
      setFeedback({
        type: "success",
        message:
          action === "approve"
            ? `Approved. Case is now ${result.status.toLowerCase()}.`
            : "Case rejected.",
      });
      setConfirming(null);
      onResolved();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4">
      <div>
        <p className="text-sm font-medium text-ink">This case needs your review</p>
        <p className="text-xs text-muted">
          The recommended amount is above the automatic-approval threshold.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="primary" onClick={() => setConfirming("approve")} disabled={submitting}>
          Approve recovery
        </Button>
        <Button variant="secondary" onClick={() => setConfirming("reject")} disabled={submitting}>
          Reject recovery
        </Button>
      </div>

      {feedback && (
        <p className={`text-sm ${feedback.type === "success" ? "text-success" : "text-danger"}`}>
          {feedback.message}
        </p>
      )}

      <ConfirmDialog
        open={confirming === "approve"}
        title="Approve this recovery action?"
        description="RecoverOS will execute the recommended strategy immediately. This cannot be undone."
        confirmLabel="Approve"
        variant="primary"
        loading={submitting}
        onConfirm={() => runAction("approve")}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "reject"}
        title="Reject this recovery action?"
        description="The case will be closed without executing any recovery action. This cannot be undone."
        confirmLabel="Reject"
        variant="danger"
        loading={submitting}
        onConfirm={() => runAction("reject")}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
