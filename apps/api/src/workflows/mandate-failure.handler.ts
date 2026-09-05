import type { PrismaClient, Prisma, RecoveryCase } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import { runRecoveryOrchestrator } from "../engine/recovery.orchestrator.js";
import type { DecisionProvider } from "../engine/decision-provider.js";
import type { RecoveryAdapter } from "../adapters/recovery.adapter.js";
import { StubDecisionProvider } from "../engine/stub-decision.provider.js";
import { SimulatedAdapter } from "../adapters/simulated.adapter.js";
import { RazorpayAdapter } from "../adapters/razorpay.adapter.js";
import type { WorkflowRunResult } from "./registry.js";

const ACTOR = "mandate-failure.handler";

const ACTIVE_CASE_STATUSES = [
  "DETECTED",
  "RECOMMENDED",
  "APPROVED",
  "EXECUTING",
  "RECOVERED",
] as const;
const FAILED_MANDATE_STATUSES = ["REVOKED", "EXPIRED"] as const;


const decisionProvider: DecisionProvider = new StubDecisionProvider();

const adapter: RecoveryAdapter =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new RazorpayAdapter()
    : new SimulatedAdapter();

export async function detectFailedMandate(
  prisma: PrismaClient,
  mandateId: string
): Promise<RecoveryCase> {
  const mandate = await prisma.mandate.findUnique({
    where: { id: mandateId },
  });

  if (!mandate) {
    throw new Error(`Mandate not found: ${mandateId}`);
  }

  if (
    !FAILED_MANDATE_STATUSES.includes(
      mandate.status as (typeof FAILED_MANDATE_STATUSES)[number]
    )
  ) {
    throw new Error(
      `Mandate ${mandateId} is not in a failed state (status=${mandate.status}); nothing to recover`
    );
  }

  if (mandate.amount === null) {
    throw new Error(
      `Mandate ${mandateId} has no amount recorded; cannot create a RecoveryCase without an amount`
    );
  }
  const amount = mandate.amount;

  const existingAudit = await prisma.auditLog.findFirst({
    where: {
      eventType: "RECOVERY_CASE_CREATED",
      metadata: { path: ["mandateId"], equals: mandateId },
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
        merchantId: mandate.merchantId,
        customerId: mandate.customerId,
        sourceType: "MANDATE",
        paymentId: null,
        status: "DETECTED",
        amount,
        currency: mandate.currency,
      },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: created.id,
      eventType: "RECOVERY_CASE_CREATED",
      actor: ACTOR,
      metadata: {
        mandateId: mandate.id,
        status: mandate.status,
        amount,
        currency: mandate.currency,
      },
    });

    return created;
  });

  return recoveryCase;
}

export async function runMandateFailureWorkflow(
  prisma: PrismaClient,
  mandateId: string
): Promise<WorkflowRunResult> {
  const recoveryCase = await detectFailedMandate(prisma, mandateId);

  return runRecoveryOrchestrator(prisma, recoveryCase, decisionProvider, adapter);
}