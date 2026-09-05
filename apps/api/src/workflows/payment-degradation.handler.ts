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


const decisionProvider: DecisionProvider = process.env.GEMINI_API_KEY
  ? new GeminiDecisionProvider()
  : new StubDecisionProvider();

const adapter: RecoveryAdapter =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new RazorpayAdapter()
    : new SimulatedAdapter();

export async function runPaymentDegradationWorkflow(
  prisma: PrismaClient,
  paymentId: string
): Promise<WorkflowRunResult> {
  const recoveryCase = await detectFailedPayment(prisma, paymentId);

  return runRecoveryOrchestrator(prisma, recoveryCase, decisionProvider, adapter);
}
