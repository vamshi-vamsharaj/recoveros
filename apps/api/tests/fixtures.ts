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
