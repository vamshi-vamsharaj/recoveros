import type { PrismaClient } from "@prisma/client";
import { runPaymentDegradationWorkflow } from "./payment-degradation.handler.js";
import { runCheckoutDropoffWorkflow } from "./checkout-dropoff.handler.js";
import { runSubscriptionFailureWorkflow } from "./subscription-failure.handler.js";
import { runInvoiceOverdueWorkflow } from "./invoice-overdue.handler.js";
import { runMandateFailureWorkflow } from "./mandate-failure.handler.js";
import { runPromiseToPayWorkflow } from "./promise-to-pay.handler.js";

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


export const workflowRegistry: Record<string, WorkflowHandler> = {
  "payment-degradation": (prisma, input) =>
    runPaymentDegradationWorkflow(prisma, input.entityId),
  "checkout-dropoff": (prisma, input) =>
    runCheckoutDropoffWorkflow(prisma, input.entityId),
  "subscription-failure": (prisma, input) =>
    runSubscriptionFailureWorkflow(prisma, input.entityId),
  "invoice-overdue": (prisma, input) =>
    runInvoiceOverdueWorkflow(prisma, input.entityId),
  "mandate-failure": (prisma, input) =>
    runMandateFailureWorkflow(prisma, input.entityId),
  "promise-to-pay": (prisma, input) =>
    runPromiseToPayWorkflow(prisma, input.entityId),
};