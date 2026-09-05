import type { PrismaClient, Prisma, RecoveryCase } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import { runRecoveryOrchestrator } from "../engine/recovery.orchestrator.js";
import type { DecisionProvider } from "../engine/decision-provider.js";
import type { RecoveryAdapter } from "../adapters/recovery.adapter.js";
import { StubDecisionProvider } from "../engine/stub-decision.provider.js";
import { SimulatedAdapter } from "../adapters/simulated.adapter.js";
import { RazorpayAdapter } from "../adapters/razorpay.adapter.js";
import type { WorkflowRunResult } from "./registry.js";

const ACTOR = "invoice-overdue.handler";

// Same active-case statuses detection.service.ts uses for
// payment-degradation.
const ACTIVE_CASE_STATUSES = [
  "DETECTED",
  "RECOMMENDED",
  "APPROVED",
  "EXECUTING",
  "RECOVERED",
] as const;


const decisionProvider: DecisionProvider = new StubDecisionProvider();

const adapter: RecoveryAdapter =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new RazorpayAdapter()
    : new SimulatedAdapter();

export async function detectOverdueInvoice(
  prisma: PrismaClient,
  invoiceId: string
): Promise<RecoveryCase> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  if (invoice.status !== "OVERDUE") {
    throw new Error(
      `Invoice ${invoiceId} is not OVERDUE (status=${invoice.status}); nothing to recover`
    );
  }

  const existingAudit = await prisma.auditLog.findFirst({
    where: {
      eventType: "RECOVERY_CASE_CREATED",
      metadata: { path: ["invoiceId"], equals: invoiceId },
      recoveryCase: { status: { in: [...ACTIVE_CASE_STATUSES] } },
    },
    include: { recoveryCase: true },
    orderBy: { createdAt: "desc" },
  });

  if (existingAudit?.recoveryCase) {
    return existingAudit.recoveryCase;
  }

  const recoveryCase = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.recoveryCase.create({
      data: {
        merchantId: invoice.merchantId,
        customerId: invoice.customerId,
        sourceType: "INVOICE",
        paymentId: null,
        status: "DETECTED",
        amount: invoice.amount,
        currency: invoice.currency,
      },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: created.id,
      eventType: "RECOVERY_CASE_CREATED",
      actor: ACTOR,
      metadata: {
        invoiceId: invoice.id,
        dueDate: invoice.dueDate.toISOString(),
        amount: invoice.amount,
        currency: invoice.currency,
      },
    });

    return created;
  });

  return recoveryCase;
}

export async function runInvoiceOverdueWorkflow(
  prisma: PrismaClient,
  invoiceId: string
): Promise<WorkflowRunResult> {
  const recoveryCase = await detectOverdueInvoice(prisma, invoiceId);

  return runRecoveryOrchestrator(prisma, recoveryCase, decisionProvider, adapter);
}