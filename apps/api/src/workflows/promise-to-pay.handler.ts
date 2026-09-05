import type { PrismaClient, Prisma, RecoveryCase } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import { runRecoveryOrchestrator } from "../engine/recovery.orchestrator.js";
import type { DecisionProvider } from "../engine/decision-provider.js";
import type { RecoveryAdapter } from "../adapters/recovery.adapter.js";
import { StubDecisionProvider } from "../engine/stub-decision.provider.js";
import { SimulatedAdapter } from "../adapters/simulated.adapter.js";
import { RazorpayAdapter } from "../adapters/razorpay.adapter.js";
import type { WorkflowRunResult } from "./registry.js";

const ACTOR = "promise-to-pay.handler";


const decisionProvider: DecisionProvider = new StubDecisionProvider();

const adapter: RecoveryAdapter =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new RazorpayAdapter()
    : new SimulatedAdapter();

export async function detectDuePromise(
  prisma: PrismaClient,
  promiseToPayId: string
): Promise<RecoveryCase> {
  const promise = await prisma.promiseToPay.findUnique({
    where: { id: promiseToPayId },
    include: { customer: true },
  });

  if (!promise) {
    throw new Error(`PromiseToPay not found: ${promiseToPayId}`);
  }

  if (promise.status !== "PENDING") {
    throw new Error(
      `PromiseToPay ${promiseToPayId} is not PENDING (status=${promise.status}); already resolved`
    );
  }

  if (promise.promisedDate.getTime() > Date.now()) {
    throw new Error(
      `PromiseToPay ${promiseToPayId} is not yet due (promisedDate=${promise.promisedDate.toISOString()})`
    );
  }

  if (promise.recoveryCaseId) {
    const existingCase = await prisma.recoveryCase.findUnique({
      where: { id: promise.recoveryCaseId },
    });
    if (existingCase) {
      return existingCase;
    }
  }

  const recoveryCase = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.recoveryCase.create({
      data: {
        merchantId: promise.customer.merchantId,
        customerId: promise.customerId,
        sourceType: "PROMISE_TO_PAY",
        paymentId: null,
        status: "DETECTED",
        amount: promise.amount,
        currency: "INR",
      },
    });

    await tx.promiseToPay.update({
      where: { id: promise.id },
      data: { recoveryCaseId: created.id },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: created.id,
      eventType: "RECOVERY_CASE_CREATED",
      actor: ACTOR,
      metadata: {
        promiseToPayId: promise.id,
        promisedDate: promise.promisedDate.toISOString(),
        amount: promise.amount,
      },
    });

    return created;
  });

  return recoveryCase;
}

export async function runPromiseToPayWorkflow(
  prisma: PrismaClient,
  promiseToPayId: string
): Promise<WorkflowRunResult> {
  const recoveryCase = await detectDuePromise(prisma, promiseToPayId);

  return runRecoveryOrchestrator(prisma, recoveryCase, decisionProvider, adapter);
}