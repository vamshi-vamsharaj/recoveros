import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

let counter = 0;

/** Creates a fresh Merchant + Customer + enabled Policy for a test. */
export async function createFixture(opts?: {
  maxAttempts?: number;
  policyEnabled?: boolean;
}) {
  counter += 1;
  const unique = `${Date.now()}-${counter}`;

  const merchant = await prisma.merchant.create({
    data: {
      name: `Test Merchant ${unique}`,
      email: `merchant-${unique}@test.local`,
    },
  });

  const customer = await prisma.customer.create({
    data: {
      merchantId: merchant.id,
      name: `Test Customer ${unique}`,
      email: `customer-${unique}@test.local`,
    },
  });

  const policy = await prisma.policy.create({
    data: {
      merchantId: merchant.id,
      name: `Test Policy ${unique}`,
      isEnabled: opts?.policyEnabled ?? true,
      maxAttempts: opts?.maxAttempts ?? 3,
    },
  });

  return { merchant, customer, policy };
}

export async function createFailedPayment(
  merchantId: string,
  customerId: string,
  amount = 10000
) {
  return prisma.payment.create({
    data: {
      merchantId,
      customerId,
      amount,
      currency: "INR",
      status: "FAILED",
      failureReason: "Card declined by issuing bank",
    },
  });
}

/**
 * Milestone 5 fixture. `customerId` is optional (nullable in the
 * CheckoutSession schema) so tests can create a guest checkout to
 * exercise checkout-dropoff.handler.ts's "no customer to attribute
 * the case to" rejection path.
 */
export async function createCheckoutSession(
  merchantId: string,
  customerId: string | null,
  opts?: { status?: "STARTED" | "ABANDONED" | "COMPLETED"; amount?: number }
) {
  return prisma.checkoutSession.create({
    data: {
      merchantId,
      customerId,
      amount: opts?.amount ?? 10000,
      currency: "INR",
      status: opts?.status ?? "ABANDONED",
    },
  });
}

/** Milestone 5 fixture for subscription-failure.handler.ts tests. */
export async function createSubscription(
  merchantId: string,
  customerId: string,
  opts?: {
    status?: "ACTIVE" | "PAST_DUE" | "CANCELED" | "PAUSED";
    amount?: number;
  }
) {
  return prisma.subscription.create({
    data: {
      merchantId,
      customerId,
      planName: "Pro Plan",
      amount: opts?.amount ?? 10000,
      currency: "INR",
      status: opts?.status ?? "PAST_DUE",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

/** Milestone 7 fixture for invoice-overdue.handler.ts tests. */
export async function createInvoice(
  merchantId: string,
  customerId: string,
  opts?: {
    status?: "DRAFT" | "OPEN" | "PAID" | "OVERDUE" | "VOID";
    amount?: number;
    dueDate?: Date;
  }
) {
  return prisma.invoice.create({
    data: {
      merchantId,
      customerId,
      amount: opts?.amount ?? 10000,
      currency: "INR",
      status: opts?.status ?? "OVERDUE",
      dueDate: opts?.dueDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  });
}

/** Milestone 7 fixture for mandate-failure.handler.ts tests. */
export async function createMandate(
  merchantId: string,
  customerId: string,
  opts?: {
    status?: "ACTIVE" | "PAUSED" | "REVOKED" | "EXPIRED";
    amount?: number | null;
    currency?: string;
  }
) {
  return prisma.mandate.create({
    data: {
      merchantId,
      customerId,
      status: opts?.status ?? "REVOKED",
      amount: opts?.amount === undefined ? 10000 : opts.amount,
      currency: opts?.currency ?? "INR",
    },
  });
}

/** Milestone 7 fixture for promise-to-pay.handler.ts tests. */
export async function createPromiseToPay(
  customerId: string,
  opts?: {
    amount?: number;
    promisedDate?: Date;
    status?: "PENDING" | "KEPT" | "BROKEN";
    recoveryCaseId?: string;
  }
) {
  return prisma.promiseToPay.create({
    data: {
      customerId,
      amount: opts?.amount ?? 10000,
      promisedDate: opts?.promisedDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
      status: opts?.status ?? "PENDING",
      recoveryCaseId: opts?.recoveryCaseId ?? null,
    },
  });
}