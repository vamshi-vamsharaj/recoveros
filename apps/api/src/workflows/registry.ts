import type { PrismaClient } from "@prisma/client";
import { runPaymentDegradationWorkflow } from "./payment-degradation.handler.js";

export interface WorkflowRunResult {
  recoveryCaseId: string;
  status: string;
  blocked: boolean;
  blockedReason?: string;
}

export type WorkflowHandler = (
  prisma: PrismaClient,
  input: { entityId: string }
) => Promise<WorkflowRunResult>;

/**
 * Registered workflows. Only "payment-degradation" is implemented in
 * Milestone 2. Future workflows (checkout-dropoff, subscription-failure,
 * invoice-overdue, mandate-retry, promise-to-pay) can be registered
 * here without changing how the registry or its callers work.
 */
export const workflowRegistry: Record<string, WorkflowHandler> = {
  "payment-degradation": (prisma, input) =>
    runPaymentDegradationWorkflow(prisma, input.entityId),
};
