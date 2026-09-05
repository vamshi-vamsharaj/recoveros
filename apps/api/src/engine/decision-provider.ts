import { z } from "zod";
import type { DecisionInput, DecisionResult } from "./types.js";


export interface DecisionProvider {
  readonly name: string;
  decide(input: DecisionInput): Promise<DecisionResult>;
}


export const DecisionResultSchema = z.object({
  strategy: z.enum([
    "PAYMENT_LINK",
    "RETRY_CARD",
    "SEND_REMINDER",
    "OFFER_DISCOUNT",
    "ALTERNATE_METHOD",
  ]),
  reason: z.string().min(1),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  providerName: z.string().min(1),
  rawOutput: z.record(z.unknown()),
});

export function validateDecisionResult(candidate: unknown): DecisionResult {
  return DecisionResultSchema.parse(candidate);
}
