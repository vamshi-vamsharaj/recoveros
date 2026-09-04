import type { PrismaClient } from "@prisma/client";
import { detectFailedPayment } from "../engine/detection.service.js";
import { runRecoveryOrchestrator } from "../engine/recovery.orchestrator.js";
import type { DecisionProvider } from "../engine/decision-provider.js";
import type { RecoveryAdapter } from "../adapters/recovery.adapter.js";
import { StubDecisionProvider } from "../engine/stub-decision.provider.js";
import { GeminiDecisionProvider } from "../engine/gemini-decision.provider.js";
import { SimulatedAdapter } from "../adapters/simulated.adapter.js";
import { RazorpayAdapter } from "../adapters/razorpay.adapter.js";
import type { WorkflowRunResult } from "./registry.js";

/**
 * Milestone 3/4 wiring decision: provider and adapter selection is
 * env-gated rather than hardcoded, so this workflow (and every
 * existing test/demo that runs it without Gemini/Razorpay credentials
 * configured) keeps behaving exactly as it did in Milestone 2 --
 * StubDecisionProvider + SimulatedAdapter, fully deterministic, no
 * network calls. GeminiDecisionProvider is only selected when
 * GEMINI_API_KEY is set, and RazorpayAdapter only when
 * RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set. GeminiDecisionProvider
 * additionally has its own deterministic fallback for API errors,
 * timeouts, and invalid output, so an unset or briefly-broken Gemini
 * key never crashes this workflow.
 *
 * This was a deliberate, minimal change to this handler -- everything
 * else (detection, orchestrator, policy engine, approval gate) is
 * untouched, and neither Stub/Simulated nor Gemini/Razorpay wiring
 * required any change to recovery.orchestrator.ts itself.
 */
const decisionProvider: DecisionProvider = process.env.GEMINI_API_KEY
  ? new GeminiDecisionProvider()
  : new StubDecisionProvider();

const adapter: RecoveryAdapter =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new RazorpayAdapter()
    : new SimulatedAdapter();

/**
 * Handles revenue-at-risk detected as a FAILED payment.
 *
 * IMPORTANT: this handler calls detection then the orchestrator only.
 * It must NEVER call an adapter directly -- execution is the
 * Recovery Orchestrator's responsibility alone.
 */
export async function runPaymentDegradationWorkflow(
  prisma: PrismaClient,
  paymentId: string
): Promise<WorkflowRunResult> {
  const recoveryCase = await detectFailedPayment(prisma, paymentId);

  return runRecoveryOrchestrator(prisma, recoveryCase, decisionProvider, adapter);
}
