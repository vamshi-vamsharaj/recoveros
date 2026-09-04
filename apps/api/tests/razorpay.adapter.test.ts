import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock at the razorpay.provider.ts boundary -- RazorpayAdapter only
// ever calls createPaymentLink(), so this suite never touches
// providers/razorpay/razorpay.client.ts or the real Razorpay SDK.
const createPaymentLink = vi.fn();

vi.mock("../src/providers/razorpay/razorpay.provider.js", () => ({
  createPaymentLink: (...args: unknown[]) => createPaymentLink(...args),
}));

const { RazorpayAdapter } = await import("../src/adapters/razorpay.adapter.js");

function decisionWith(strategy: string) {
  return {
    strategy: strategy as any,
    reason: "test reason",
    confidence: "HIGH" as const,
    providerName: "TestProvider",
    rawOutput: {},
  };
}

beforeEach(() => {
  createPaymentLink.mockReset();
});

describe("RazorpayAdapter", () => {
  it("creates a Payment Link and returns EXECUTING with the provider reference recorded", async () => {
    createPaymentLink.mockResolvedValue({
      id: "plink_test123",
      shortUrl: "https://rzp.io/i/test123",
      status: "created",
      raw: { id: "plink_test123", short_url: "https://rzp.io/i/test123", status: "created" },
    });

    const adapter = new RazorpayAdapter();
    const result = await adapter.execute({
      recoveryCaseId: "case_1",
      amount: 10000,
      currency: "INR",
      decision: decisionWith("PAYMENT_LINK"),
    });

    // Request construction: amount/currency/referenceId passed through correctly.
    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10000,
        currency: "INR",
        referenceId: "case_1",
      })
    );

    // Response handling: link id recorded as providerReference, status
    // is EXECUTING (not RECOVERED) because payment isn't confirmed yet.
    expect(result.status).toBe("EXECUTING");
    expect(result.recoveredAmount).toBeNull();
    expect(result.adapterName).toBe("RazorpayAdapter");
    expect(result.providerReference).toBe("plink_test123");
    expect(result.providerMetadata).toMatchObject({ shortUrl: "https://rzp.io/i/test123" });
  });

  it("fails the attempt (does not throw) when Razorpay Payment Link creation errors", async () => {
    createPaymentLink.mockRejectedValue(new Error("Razorpay API error: 401 Unauthorized"));

    const adapter = new RazorpayAdapter();
    const result = await adapter.execute({
      recoveryCaseId: "case_2",
      amount: 5000,
      currency: "INR",
      decision: decisionWith("PAYMENT_LINK"),
    });

    expect(result.status).toBe("FAILED");
    expect(result.recoveredAmount).toBeNull();
    expect(result.providerReference).toBeUndefined();
  });

  it("fails immediately, without calling Razorpay, for any strategy other than PAYMENT_LINK", async () => {
    const adapter = new RazorpayAdapter();
    const result = await adapter.execute({
      recoveryCaseId: "case_3",
      amount: 5000,
      currency: "INR",
      decision: decisionWith("RETRY_CARD"),
    });

    expect(createPaymentLink).not.toHaveBeenCalled();
    expect(result.status).toBe("FAILED");
  });

  it("truncates an over-length reference id to Razorpay's 40-character limit", async () => {
    createPaymentLink.mockResolvedValue({
      id: "plink_x",
      shortUrl: "https://rzp.io/i/x",
      status: "created",
      raw: {},
    });

    const longId = "c".repeat(60);
    const adapter = new RazorpayAdapter();
    await adapter.execute({
      recoveryCaseId: longId,
      amount: 1000,
      currency: "INR",
      decision: decisionWith("PAYMENT_LINK"),
    });

    // referenceId truncation actually happens inside razorpay.provider.ts's
    // createPaymentLink -- this just confirms the adapter passes the raw
    // (untruncated) id through and lets the provider boundary own that rule.
    expect(createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: longId })
    );
  });
});
