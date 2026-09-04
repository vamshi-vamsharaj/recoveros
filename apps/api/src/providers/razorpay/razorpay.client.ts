import Razorpay from "razorpay";

/**
 * This folder (apps/api/src/providers/razorpay/) is the sole owner of
 * the Razorpay SDK import. No AI module, workflow handler, policy
 * engine, approval gate, or detection logic may import "razorpay"
 * directly -- only adapters/razorpay.adapter.ts and
 * webhooks/razorpay.webhook.ts reach into this folder, and only this
 * file touches the SDK itself.
 */

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (client) return client;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured");
  }

  client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}

/**
 * Verifies the `X-Razorpay-Signature` header: HMAC-SHA256 over the
 * RAW request body, hex-encoded, keyed with the dashboard webhook
 * secret (distinct from the API key/secret pair). Confirmed against
 * current Razorpay documentation -- this must run on the raw,
 * unparsed body, before any JSON.parse.
 *
 * Uses the SDK's own static helper rather than reimplementing HMAC,
 * so this stays correct if Razorpay changes internal details.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret: string
): boolean {
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return Razorpay.validateWebhookSignature(body, signature, secret);
}
