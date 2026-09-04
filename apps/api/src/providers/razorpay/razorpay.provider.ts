import { getRazorpayClient } from "./razorpay.client.js";
import type { CreatePaymentLinkInput, CreatePaymentLinkResult } from "./razorpay.types.js";

/**
 * Creates a NEW Razorpay Test Mode Payment Link (POST /v1/payment_links
 * via the Node SDK's `paymentLink.create`). This is a bounded recovery
 * action, not a retry of the original failed payment -- the original
 * payment is never touched or resubmitted.
 *
 * reference_id is capped at 40 characters by Razorpay; a RecoveryCase
 * cuid is well under that, but it's still truncated defensively.
 */
export async function createPaymentLink(
  input: CreatePaymentLinkInput
): Promise<CreatePaymentLinkResult> {
  const client = getRazorpayClient();

  const hasCustomerDetails = Boolean(
    input.customerName || input.customerEmail || input.customerContact
  );

  const response = await client.paymentLink.create({
    amount: input.amount,
    currency: input.currency,
    reference_id: input.referenceId.slice(0, 40),
    description: input.description,
    notify: { sms: false, email: false },
    reminder_enable: false,
    ...(hasCustomerDetails
      ? {
          customer: {
            ...(input.customerName ? { name: input.customerName } : {}),
            ...(input.customerEmail ? { email: input.customerEmail } : {}),
            ...(input.customerContact ? { contact: input.customerContact } : {}),
          },
        }
      : {}),
  });

  return {
    id: response.id,
    shortUrl: response.short_url,
    status: response.status,
    raw: response as unknown as Record<string, unknown>,
  };
}
