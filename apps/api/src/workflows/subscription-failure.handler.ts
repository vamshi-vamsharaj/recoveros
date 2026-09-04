import type { PrismaClient, Prisma, RecoveryCase } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import { runRecoveryOrchestrator } from "../engine/recovery.orchestrator.js";
import type { DecisionProvider } from "../engine/decision-provider.js";
import type { RecoveryAdapter } from "../adapters/recovery.adapter.js";
import { StubDecisionProvider } from "../engine/stub-decision.provider.js";
import { SimulatedAdapter } from "../adapters/simulated.adapter.js";
import { RazorpayAdapter } from "../adapters/razorpay.adapter.js";
import type { WorkflowRunResult } from "./registry.js";

const ACTOR = "subscription-failure.handler";

// Same active-case statuses detection.service.ts uses for
// payment-degradation.
const ACTIVE_CASE_STATUSES = [
  "DETECTED",
  "RECOMMENDED",
  "APPROVED",
  "EXECUTING",
  "RECOVERED",
] as const;

/**
 * Milestone 5 wiring decision -- identical reasoning to
 * checkout-dropoff.handler.ts: GeminiDecisionProvider is not wired in
 * here because engine/gemini-decision.provider.ts (not modifiable in
 * this milestone) hardcodes its strategy-validation workflow name to
 * "payment-degradation". Using it here would validate Gemini's
 * subscription-failure recommendations against the wrong workflow's
 * allow-list. StubDecisionProvider is deterministic and always
 * recommends PAYMENT_LINK, which both adapters below can actually
 * execute.
 *
 * IMPORTANT: RETRY_CARD is deliberately NOT used for this workflow,
 * per the milestone brief -- RazorpayAdapter has no real Razorpay
 * execution path for RETRY_CARD (it isn't a direct card-retry
 * integration; see adapters/razorpay.adapter.ts, which fails any
 * strategy other than PAYMENT_LINK rather than guessing at a call).
 * Recommending RETRY_CARD here would be a strategy the current system
 * cannot safely execute.
 */
const decisionProvider: DecisionProvider = new StubDecisionProvider();

const adapter: RecoveryAdapter =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new RazorpayAdapter()
    : new SimulatedAdapter();

/**
 * Detects revenue at risk from a subscription that has fallen behind
 * on payment.
 *
 * Eligibility mirrors detection.service.ts's shape for payments:
 *   1. Look up the subscription.
 *   2. Confirm it is genuinely eligible (status === PAST_DUE).
 *      ACTIVE has nothing to recover; CANCELED and PAUSED are not
 *      failures a payment-recovery action can act on.
 *   3. Check for an existing active RecoveryCase for this exact
 *      subscription (see dedup note below -- same approach and same
 *      documented limitation as checkout-dropoff.handler.ts).
 *   4. If none exists, create one and write an AuditLog entry.
 *
 * Subscription.customerId is required by the schema (unlike
 * CheckoutSession's), so there is no guest-subscription case to
 * reject here.
 */
export async function detectFailedSubscription(
  prisma: PrismaClient,
  subscriptionId: string
): Promise<RecoveryCase> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });

  if (!subscription) {
    throw new Error(`Subscription not found: ${subscriptionId}`);
  }

  if (subscription.status !== "PAST_DUE") {
    throw new Error(
      `Subscription ${subscriptionId} is not PAST_DUE (status=${subscription.status}); nothing to recover`
    );
  }

  const existingAudit = await prisma.auditLog.findFirst({
    where: {
      eventType: "RECOVERY_CASE_CREATED",
      metadata: { path: ["subscriptionId"], equals: subscriptionId },
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
        merchantId: subscription.merchantId,
        customerId: subscription.customerId,
        sourceType: "SUBSCRIPTION",
        paymentId: null,
        status: "DETECTED",
        amount: subscription.amount,
        currency: subscription.currency,
      },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: created.id,
      eventType: "RECOVERY_CASE_CREATED",
      actor: ACTOR,
      metadata: {
        subscriptionId: subscription.id,
        planName: subscription.planName,
        amount: subscription.amount,
        currency: subscription.currency,
      },
    });

    return created;
  });

  return recoveryCase;
}

/**
 * Handles revenue-at-risk detected as a past-due subscription.
 *
 * IMPORTANT: like payment-degradation, this handler calls detection
 * then the shared orchestrator only. It must NEVER call an adapter
 * directly.
 */
export async function runSubscriptionFailureWorkflow(
  prisma: PrismaClient,
  subscriptionId: string
): Promise<WorkflowRunResult> {
  const recoveryCase = await detectFailedSubscription(prisma, subscriptionId);

  return runRecoveryOrchestrator(prisma, recoveryCase, decisionProvider, adapter);
}