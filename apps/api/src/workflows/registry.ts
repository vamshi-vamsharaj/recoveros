import type { PrismaClient } from "@prisma/client";
import { runPaymentDegradationWorkflow } from "./payment-degradation.handler.js";
import { runCheckoutDropoffWorkflow } from "./checkout-dropoff.handler.js";
import { runSubscriptionFailureWorkflow } from "./subscription-failure.handler.js";

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
 * Registered workflows. Milestone 2 implemented "payment-degradation".
 * Milestone 5 adds "checkout-dropoff" and "subscription-failure" --
 * both call the same shared engine/orchestrator code path as
 * payment-degradation (see recovery.orchestrator.ts), just with their
 * own detection logic and `entityId` meaning (a CheckoutSession id /
 * a Subscription id, respectively, instead of a Payment id). Future
 * workflows (invoice-overdue, mandate-retry, promise-to-pay) can still
 * be registered here without changing how the registry or its callers
 * work.
 */
export const workflowRegistry: Record<string, WorkflowHandler> = {
  "payment-degradation": (prisma, input) =>
    runPaymentDegradationWorkflow(prisma, input.entityId),
  "checkout-dropoff": (prisma, input) =>
    runCheckoutDropoffWorkflow(prisma, input.entityId),
  "subscription-failure": (prisma, input) =>
    runSubscriptionFailureWorkflow(prisma, input.entityId),
};