import type { PrismaClient } from "@prisma/client";
import { detectFailedPayment } from "../engine/detection.service.js";
import { runRecoveryOrchestrator } from "../engine/recovery.orchestrator.js";
import { StubDecisionProvider } from "../engine/stub-decision.provider.js";
import { SimulatedAdapter } from "../adapters/simulated.adapter.js";
import type { WorkflowRunResult } from "./registry.js";

// Milestone 2 wiring: StubDecisionProvider stands in for Claude,
// SimulatedAdapter stands in for Razorpay. Swapping either later
// requires no changes to this handler or the orchestrator.
const decisionProvider = new StubDecisionProvider();
const adapter = new SimulatedAdapter();

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
