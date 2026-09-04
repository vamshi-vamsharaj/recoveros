import type { DecisionProvider } from "./decision-provider.js";
import { validateDecisionResult } from "./decision-provider.js";
import type { DecisionInput, DecisionResult } from "./types.js";
import { StubDecisionProvider } from "./stub-decision.provider.js";
import { callGeminiForDecision } from "../ai/gemini.client.js";
import {
  GeminiRawDecisionSchema,
  isStrategyValidForWorkflow,
} from "../ai/schemas/decision.schema.js";

// Only "payment-degradation" is registered (see workflows/registry.ts),
// so this provider is scoped to it for now. A future provider serving
// multiple workflows would need this passed in rather than hardcoded.
const WORKFLOW_NAME = "payment-degradation";

/**
 * Real Gemini-backed recovery recommendation.
 *
 * Validation order (per the task's required boundary):
 *   Gemini Response -> Structured Parsing -> Zod Schema Validation
 *   -> Workflow Strategy Validation -> RecoveryDecision
 *
 * Falls back to a deterministic recommendation (by default,
 * StubDecisionProvider's) whenever Gemini's call fails, times out,
 * returns malformed/empty output, fails schema validation, or
 * recommends a strategy invalid for this workflow. The fallback is
 * itself validated through the same DecisionResultSchema every
 * DecisionProvider goes through -- it can never persist bad data, and
 * it never throws, so a Gemini outage cannot crash the pipeline.
 *
 * Like StubDecisionProvider, this class only ever returns a
 * recommendation -- it never calls an adapter or touches the
 * database. Implements the same DecisionProvider interface, so
 * recovery.orchestrator.ts requires no changes to use it.
 */
export class GeminiDecisionProvider implements DecisionProvider {
  readonly name = "GeminiDecisionProvider";
  private readonly fallbackProvider: DecisionProvider;

  constructor(fallbackProvider: DecisionProvider = new StubDecisionProvider()) {
    this.fallbackProvider = fallbackProvider;
  }

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const call = await callGeminiForDecision(input);

    if (call.raw === null) {
      return this.fallback(input, call.error ?? "Gemini returned no usable output");
    }

    const structural = GeminiRawDecisionSchema.safeParse(call.raw);
    if (!structural.success) {
      return this.fallback(
        input,
        `Gemini output failed schema validation: ${structural.error.message}`
      );
    }

    if (!isStrategyValidForWorkflow(structural.data.strategy, WORKFLOW_NAME)) {
      return this.fallback(
        input,
        `Gemini recommended "${structural.data.strategy}", which is not a valid strategy for workflow "${WORKFLOW_NAME}"`
      );
    }

    const candidate = {
      strategy: structural.data.strategy,
      reason: structural.data.reason,
      confidence: structural.data.confidence,
      providerName: this.name,
      rawOutput: {
        recoveryCaseId: input.recoveryCaseId,
        paymentId: input.paymentId,
        amount: input.amount,
        currency: input.currency,
        failureReason: input.failureReason,
        source: "gemini",
        fallbackUsed: false,
        geminiRaw: structural.data,
      },
    };

    // Same final validation gate every DecisionProvider goes through --
    // a malformed candidate still cannot reach RecoveryDecision.
    return validateDecisionResult(candidate);
  }

  private async fallback(input: DecisionInput, reason: string): Promise<DecisionResult> {
    const fallbackResult = await this.fallbackProvider.decide(input);

    // The fallback reason is preserved in RecoveryDecision.rawOutput
    // (the existing audit architecture: recovery.orchestrator.ts's
    // DECISION_CREATED audit entry references this decision by id,
    // and rawOutput is persisted verbatim on the RecoveryDecision row)
    // rather than inventing a new audit event type for it.
    return {
      ...fallbackResult,
      providerName: this.name,
      rawOutput: {
        ...fallbackResult.rawOutput,
        source: "fallback",
        fallbackUsed: true,
        fallbackReason: reason,
        fallbackProvider: this.fallbackProvider.name,
      },
    };
  }
}
