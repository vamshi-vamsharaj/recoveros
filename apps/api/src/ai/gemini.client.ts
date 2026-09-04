import { GoogleGenAI } from "@google/genai";

/**
 * Sole owner of the Gemini SDK. Nothing outside this file should
 * import "@google/genai" -- engine/gemini-decision.provider.ts calls
 * only callGeminiForDecision() below, mirroring how
 * providers/razorpay/ is the sole owner of the Razorpay SDK.
 *
 * Returns a structured result rather than throwing for the "normal"
 * failure modes (missing config, timeout, API error, empty response)
 * so callers can implement fallback logic without try/catch sprawl.
 * Genuinely unexpected errors still throw.
 */

export interface GeminiCallInput {
  recoveryCaseId: string;
  paymentId: string | null;
  amount: number;
  currency: string;
  failureReason: string | null;
}

export interface GeminiCallResult {
  /** Parsed JSON candidate from Gemini, or null if unusable. */
  raw: unknown;
  /** Present whenever `raw` is null -- why no usable output was produced. */
  error?: string;
}

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 8_000;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    strategy: {
      type: "STRING",
      enum: ["PAYMENT_LINK", "RETRY_CARD", "SEND_REMINDER", "OFFER_DISCOUNT", "ALTERNATE_METHOD"],
    },
    reason: { type: "STRING" },
    confidence: { type: "STRING", enum: ["LOW", "MEDIUM", "HIGH"] },
  },
  required: ["strategy", "reason", "confidence"],
} as const;

export async function callGeminiForDecision(
  input: GeminiCallInput,
  opts?: { timeoutMs?: number }
): Promise<GeminiCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { raw: null, error: "GEMINI_API_KEY is not configured" };
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: buildPrompt(input),
        config: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      timeoutMs
    );

    const text = response.text;
    if (!text || text.trim().length === 0) {
      return { raw: null, error: "Gemini returned an empty response" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { raw: null, error: "Gemini response was not valid JSON" };
    }

    return { raw: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Gemini error";
    return { raw: null, error: message };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Gemini request timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function buildPrompt(input: GeminiCallInput): string {
  return [
    "You are a payment recovery strategist for an Indian payments platform built on Razorpay.",
    "A customer payment has failed and needs a recovery recommendation.",
    "",
    "Payment details:",
    `- Recovery Case ID: ${input.recoveryCaseId}`,
    `- Payment ID: ${input.paymentId ?? "unknown"}`,
    `- Amount (smallest currency unit): ${input.amount}`,
    `- Currency: ${input.currency}`,
    `- Failure reason: ${input.failureReason ?? "unknown"}`,
    "",
    "Recommend exactly one recovery strategy from this fixed set:",
    "PAYMENT_LINK, RETRY_CARD, SEND_REMINDER, OFFER_DISCOUNT, ALTERNATE_METHOD",
    "",
    "Respond with JSON only, matching the provided schema. Keep `reason` to one or two sentences.",
  ].join("\n");
}
