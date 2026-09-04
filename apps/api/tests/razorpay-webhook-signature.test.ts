import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyRazorpayWebhookSignature } from "../src/providers/razorpay/razorpay.client.js";

// Pure HMAC verification -- no SDK network call involved, so this
// exercises real signature logic without hitting Razorpay's API.
const SECRET = "test_webhook_secret";

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyRazorpayWebhookSignature", () => {
  it("accepts a correctly signed raw body", () => {
    const body = JSON.stringify({
      event: "payment_link.paid",
      payload: { payment_link: { entity: { id: "plink_test123" } } },
    });
    const signature = sign(body);

    expect(verifyRazorpayWebhookSignature(body, signature, SECRET)).toBe(true);
  });

  it("accepts a correctly signed raw Buffer body", () => {
    const body = Buffer.from(JSON.stringify({ event: "payment_link.paid" }));
    const signature = sign(body.toString("utf8"));

    expect(verifyRazorpayWebhookSignature(body, signature, SECRET)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    const body = JSON.stringify({ event: "payment_link.paid" });
    const signature = sign(body, "a_different_secret");

    expect(verifyRazorpayWebhookSignature(body, signature, SECRET)).toBe(false);
  });

  it("rejects a tampered body that no longer matches its signature", () => {
    const originalBody = JSON.stringify({ event: "payment_link.paid", amount: 10000 });
    const signature = sign(originalBody);
    const tamperedBody = JSON.stringify({ event: "payment_link.paid", amount: 999999999 });

    expect(verifyRazorpayWebhookSignature(tamperedBody, signature, SECRET)).toBe(false);
  });

  it("rejects a garbage/empty signature", () => {
    const body = JSON.stringify({ event: "payment_link.paid" });

    expect(verifyRazorpayWebhookSignature(body, "not-a-real-signature", SECRET)).toBe(false);
  });
});
