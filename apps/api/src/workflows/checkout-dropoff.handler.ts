import type { PrismaClient, Prisma, RecoveryCase } from "@prisma/client";
import { writeAuditLog } from "../audit/audit-logger.js";
import { runRecoveryOrchestrator } from "../engine/recovery.orchestrator.js";
import type { DecisionProvider } from "../engine/decision-provider.js";
import type { RecoveryAdapter } from "../adapters/recovery.adapter.js";
import { StubDecisionProvider } from "../engine/stub-decision.provider.js";
import { SimulatedAdapter } from "../adapters/simulated.adapter.js";
import { RazorpayAdapter } from "../adapters/razorpay.adapter.js";
import type { WorkflowRunResult } from "./registry.js";

const ACTOR = "checkout-dropoff.handler";

// Same active-case statuses detection.service.ts uses for
// payment-degradation. A case in any of these is still "being worked",
// so a repeat detection run for the same source must not create a
// second one.
const ACTIVE_CASE_STATUSES = [
  "DETECTED",
  "RECOMMENDED",
  "APPROVED",
  "EXECUTING",
  "RECOVERED",
] as const;

/**
 * Milestone 5 wiring decision, deliberately narrower than
 * payment-degradation's: this workflow does NOT env-gate
 * GeminiDecisionProvider.
 *
 * Reason (see PROJECT_STATUS / the Milestone 5 brief's "STOP and
 * explain" instruction): engine/gemini-decision.provider.ts -- which
 * this milestone must not modify -- hardcodes
 * `const WORKFLOW_NAME = "payment-degradation"` and validates every
 * recommendation against `VALID_STRATEGIES_BY_WORKFLOW["payment-degradation"]`
 * regardless of which workflow actually calls it. Wiring it into
 * checkout-dropoff would silently validate Gemini's output against
 * the wrong workflow's allow-list -- an incorrect result, not a
 * missing feature -- and fixing that requires either changing that
 * engine file (forbidden by this milestone's acceptance criteria) or
 * adding an ai/schemas/decision.schema.ts entry for
 * "checkout-dropoff" that the hardcoded provider would never actually
 * consult anyway. Rather than do either, this workflow uses
 * StubDecisionProvider unconditionally. It is deterministic, always
 * recommends PAYMENT_LINK, and that strategy is the one both
 * SimulatedAdapter and RazorpayAdapter can actually execute -- so
 * this stays consistent with "do not invent strategies that cannot
 * safely pass through the current system."
 *
 * RazorpayAdapter vs SimulatedAdapter selection is unchanged from
 * payment-degradation (env-gated on Razorpay credentials), since both
 * adapters implement the same RecoveryAdapter contract the
 * orchestrator already calls generically.
 */
const decisionProvider: DecisionProvider = new StubDecisionProvider();

const adapter: RecoveryAdapter =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new RazorpayAdapter()
    : new SimulatedAdapter();

/**
 * Detects revenue at risk from an abandoned checkout.
 *
 * Eligibility mirrors detection.service.ts's shape for payments:
 *   1. Look up the checkout session.
 *   2. Confirm it is genuinely eligible (status === ABANDONED).
 *   3. Confirm it has a customer to attribute the case to --
 *      CheckoutSession.customerId is nullable in the schema (guest
 *      checkouts), but RecoveryCase.customerId is NOT nullable, so a
 *      guest checkout has no schema-valid way to become a
 *      RecoveryCase. This is treated as ineligible rather than
 *      inventing a placeholder customer.
 *   4. Check for an existing active RecoveryCase for this exact
 *      checkout session (see dedup note below).
 *   5. If none exists, create one and write an AuditLog entry.
 *
 * Dedup note (Milestone 5 "Deduplication" requirement):
 * detection.service.ts dedupes payment-degradation cases with a
 * direct query on RecoveryCase.paymentId, because RecoveryCase has a
 * dedicated paymentId column. RecoveryCase has NO equivalent
 * checkoutSessionId column -- sourceType only tags CHECKOUT_SESSION
 * cases, it doesn't reference which checkout session. Adding one
 * would be a schema change, which this milestone says to avoid unless
 * absolutely required.
 *
 * The safest option that needs no schema change and still dedupes on
 * the actual source entity (not a coarser proxy like customerId,
 * which would wrongly collapse two distinct abandoned checkouts by
 * the same customer into one case): every RECOVERY_CASE_CREATED audit
 * entry already records identifying metadata (see
 * detection.service.ts's `metadata: { paymentId, ... }`). This
 * function does the same, storing `checkoutSessionId` in that JSON,
 * then dedupes by querying AuditLog for a RECOVERY_CASE_CREATED entry
 * whose metadata.checkoutSessionId matches AND whose linked
 * RecoveryCase is still active. This reuses the existing audit
 * architecture rather than inventing a parallel dedup table, at the
 * cost of a JSON-path query instead of an indexed column lookup --
 * an accepted, documented trade-off for this milestone's scope, not
 * a silent gap.
 */
export async function detectAbandonedCheckout(
  prisma: PrismaClient,
  checkoutSessionId: string
): Promise<RecoveryCase> {
  const checkoutSession = await prisma.checkoutSession.findUnique({
    where: { id: checkoutSessionId },
  });

  if (!checkoutSession) {
    throw new Error(`CheckoutSession not found: ${checkoutSessionId}`);
  }

  if (checkoutSession.status !== "ABANDONED") {
    throw new Error(
      `CheckoutSession ${checkoutSessionId} is not ABANDONED (status=${checkoutSession.status}); nothing to recover`
    );
  }

  if (!checkoutSession.customerId) {
    throw new Error(
      `CheckoutSession ${checkoutSessionId} has no associated customer (guest checkout); cannot create a RecoveryCase without a customerId`
    );
  }
  const customerId = checkoutSession.customerId;

  const existingAudit = await prisma.auditLog.findFirst({
    where: {
      eventType: "RECOVERY_CASE_CREATED",
      metadata: { path: ["checkoutSessionId"], equals: checkoutSessionId },
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
        merchantId: checkoutSession.merchantId,
        customerId,
        sourceType: "CHECKOUT_SESSION",
        paymentId: null,
        status: "DETECTED",
        amount: checkoutSession.amount,
        currency: checkoutSession.currency,
      },
    });

    await writeAuditLog(tx, {
      recoveryCaseId: created.id,
      eventType: "RECOVERY_CASE_CREATED",
      actor: ACTOR,
      metadata: {
        checkoutSessionId: checkoutSession.id,
        amount: checkoutSession.amount,
        currency: checkoutSession.currency,
      },
    });

    return created;
  });

  return recoveryCase;
}

/**
 * Handles revenue-at-risk detected as an abandoned checkout.
 *
 * IMPORTANT: like payment-degradation, this handler calls detection
 * then the shared orchestrator only. It must NEVER call an adapter
 * directly.
 */
export async function runCheckoutDropoffWorkflow(
  prisma: PrismaClient,
  checkoutSessionId: string
): Promise<WorkflowRunResult> {
  const recoveryCase = await detectAbandonedCheckout(prisma, checkoutSessionId);

  return runRecoveryOrchestrator(prisma, recoveryCase, decisionProvider, adapter);
}