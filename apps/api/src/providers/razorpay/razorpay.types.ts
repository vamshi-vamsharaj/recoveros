export interface CreatePaymentLinkInput {
  /** Smallest currency unit (e.g. paise for INR). */
  amount: number;
  currency: string;
  /** Razorpay caps reference_id at 40 characters. */
  referenceId: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerContact?: string;
}

export interface CreatePaymentLinkResult {
  /** Razorpay Payment Link id, e.g. "plink_ERgihyaAAC0VNW". */
  id: string;
  shortUrl: string;
  status: string;
  raw: Record<string, unknown>;
}
