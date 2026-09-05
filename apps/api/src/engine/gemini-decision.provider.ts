import type { DecisionProvider } from "./decision-provider.js";
import { validateDecisionResult } from "./decision-provider.js";
import type { DecisionInput, DecisionResult } from "./types.js";
import { StubDecisionProvider } from "./stub-decision.provider.js";
import { callGeminiForDecision } from "../ai/gemini.client.js";
import {
  GeminiRawDecisionSchema,
  isStrategyValidForWorkflow,
} from "../ai/schemas/decision.schema.js";


const WORKFLOW_NAME = "payment-degradation";

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

    return validateDecisionResult(candidate);
  }

  private async fallback(input: DecisionInput, reason: string): Promise<DecisionResult> {
    const fallbackResult = await this.fallbackProvider.decide(input);


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
