import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock at the gemini.client.ts boundary -- GeminiDecisionProvider only
// ever calls callGeminiForDecision(), so mocking here means this suite
// never imports "@google/genai" or makes a network call, satisfying
// "Do not make live Gemini calls during unit tests."
const callGeminiForDecision = vi.fn();

vi.mock("../src/ai/gemini.client.js", () => ({
  callGeminiForDecision: (...args: unknown[]) => callGeminiForDecision(...args),
}));

const { GeminiDecisionProvider } = await import("../src/engine/gemini-decision.provider.js");

const baseInput = {
  recoveryCaseId: "case_1",
  paymentId: "pay_1",
  amount: 10000,
  currency: "INR",
  failureReason: "Card declined by issuing bank",
};

beforeEach(() => {
  callGeminiForDecision.mockReset();
});

describe("GeminiDecisionProvider", () => {
  it("returns a validated recommendation for a valid Gemini response", async () => {
    callGeminiForDecision.mockResolvedValue({
      raw: {
        strategy: "OFFER_DISCOUNT",
        reason: "Customer has a history of completing discounted retries.",
        confidence: "MEDIUM",
      },
    });

    const provider = new GeminiDecisionProvider();
    const result = await provider.decide(baseInput);

    expect(result.strategy).toBe("OFFER_DISCOUNT");
    expect(result.confidence).toBe("MEDIUM");
    expect(result.providerName).toBe("GeminiDecisionProvider");
    expect(result.rawOutput.fallbackUsed).toBe(false);
    expect(result.rawOutput.source).toBe("gemini");
  });

  it("falls back deterministically when the response fails schema validation", async () => {
    callGeminiForDecision.mockResolvedValue({
      raw: { strategy: "PAYMENT_LINK", confidence: "HIGH" /* missing `reason` */ },
    });

    const provider = new GeminiDecisionProvider();
    const result = await provider.decide(baseInput);

    expect(result.providerName).toBe("GeminiDecisionProvider");
    expect(result.rawOutput.fallbackUsed).toBe(true);
    expect(typeof result.rawOutput.fallbackReason).toBe("string");
    expect(result.strategy).toBeDefined(); // still a valid, persistable strategy
  });

  it("falls back deterministically when the strategy is invalid for this workflow", async () => {
    callGeminiForDecision.mockResolvedValue({
      raw: {
        strategy: "ALTERNATE_METHOD", // structurally valid, but not allowed for payment-degradation
        reason: "Customer has alternate methods on file.",
        confidence: "LOW",
      },
    });

    const provider = new GeminiDecisionProvider();
    const result = await provider.decide(baseInput);

    expect(result.rawOutput.fallbackUsed).toBe(true);
    expect(String(result.rawOutput.fallbackReason)).toContain("ALTERNATE_METHOD");
    expect(result.strategy).not.toBe("ALTERNATE_METHOD");
  });

  it("falls back deterministically on timeout", async () => {
    callGeminiForDecision.mockResolvedValue({
      raw: null,
      error: "Gemini request timed out after 8000ms",
    });

    const provider = new GeminiDecisionProvider();
    const result = await provider.decide(baseInput);

    expect(result.rawOutput.fallbackUsed).toBe(true);
    expect(String(result.rawOutput.fallbackReason)).toContain("timed out");
  });

  it("falls back deterministically on a Gemini API error", async () => {
    callGeminiForDecision.mockResolvedValue({
      raw: null,
      error: "Gemini API returned 500 Internal Server Error",
    });

    const provider = new GeminiDecisionProvider();
    const result = await provider.decide(baseInput);

    expect(result.rawOutput.fallbackUsed).toBe(true);
  });

  it("falls back deterministically and does not crash on empty/unusable output", async () => {
    callGeminiForDecision.mockResolvedValue({
      raw: null,
      error: "Gemini returned an empty response",
    });

    const provider = new GeminiDecisionProvider();
    const result = await provider.decide(baseInput);

    expect(result.rawOutput.fallbackUsed).toBe(true);
    // Fallback must still be a fully valid, persistable DecisionResult.
    expect(result.strategy).toBeDefined();
    expect(result.confidence).toBeDefined();
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("uses the injected fallback provider rather than always StubDecisionProvider by default", async () => {
    callGeminiForDecision.mockResolvedValue({ raw: null, error: "boom" });

    const customFallback = {
      name: "CustomFallbackProvider",
      decide: vi.fn().mockResolvedValue({
        strategy: "SEND_REMINDER",
        reason: "custom fallback reason",
        confidence: "LOW",
        providerName: "CustomFallbackProvider",
        rawOutput: {},
      }),
    };

    const provider = new GeminiDecisionProvider(customFallback);
    const result = await provider.decide(baseInput);

    expect(customFallback.decide).toHaveBeenCalledOnce();
    expect(result.strategy).toBe("SEND_REMINDER");
    expect(result.rawOutput.fallbackProvider).toBe("CustomFallbackProvider");
  });
});
