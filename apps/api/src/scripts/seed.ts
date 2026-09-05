import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { workflowRegistry } from "../workflows/registry.js";

const prisma = new PrismaClient();

async function main() {
  // Idempotent: upsert the merchant by its unique email so re-running
  // the seed script doesn't create duplicates.
  const merchant = await prisma.merchant.upsert({
    where: { email: "billing@acmewidgets.test" },
    update: {},
    create: {
      name: "Acme Widgets",
      email: "billing@acmewidgets.test",
    },
  });

  const customerSeeds = [
    { name: "Asha Rao", email: "asha.rao@example.test" },
    { name: "Diego Fernandez", email: "diego.fernandez@example.test" },
    { name: "Mei Lin", email: "mei.lin@example.test" },
  ];

  const customers = [];
  for (const seed of customerSeeds) {
    const existing = await prisma.customer.findFirst({
      where: { merchantId: merchant.id, email: seed.email },
    });
    const customer =
      existing ??
      (await prisma.customer.create({
        data: { merchantId: merchant.id, name: seed.name, email: seed.email },
      }));
    customers.push(customer);
  }

  const [asha, diego, mei] = customers;
  if (!asha || !diego || !mei) {
    throw new Error("Expected 3 seeded customers");
  }

  // Default recovery policy for the merchant.
  const existingPolicy = await prisma.policy.findFirst({
    where: { merchantId: merchant.id, name: "Default Recovery Policy" },
  });
  const policy =
    existingPolicy ??
    (await prisma.policy.create({
      data: {
        merchantId: merchant.id,
        name: "Default Recovery Policy",
        isEnabled: true,
        maxAttempts: 3,
      },
    }));

  // Payments: at least one FAILED and one SUCCEEDED, tied to different
  // customers so the recovery workflow has an obvious target to run
  // against (asha's failed payment).
  const existingFailedPayment = await prisma.payment.findFirst({
    where: { merchantId: merchant.id, customerId: asha.id, status: "FAILED" },
  });
  const failedPayment =
    existingFailedPayment ??
    (await prisma.payment.create({
      data: {
        merchantId: merchant.id,
        customerId: asha.id,
        amount: 149900,
        currency: "INR",
        status: "FAILED",
        failureReason: "Card declined by issuing bank",
      },
    }));

  const existingSucceededPayment = await prisma.payment.findFirst({
    where: {
      merchantId: merchant.id,
      customerId: diego.id,
      status: "SUCCEEDED",
    },
  });
  const succeededPayment =
    existingSucceededPayment ??
    (await prisma.payment.create({
      data: {
        merchantId: merchant.id,
        customerId: diego.id,
        amount: 249900,
        currency: "INR",
        status: "SUCCEEDED",
      },
    }));

  // A second failed payment, for mei, so there is more than one
  // recoverable case to explore.
  const existingSecondFailedPayment = await prisma.payment.findFirst({
    where: { merchantId: merchant.id, customerId: mei.id, status: "FAILED" },
  });
  const secondFailedPayment =
    existingSecondFailedPayment ??
    (await prisma.payment.create({
      data: {
        merchantId: merchant.id,
        customerId: mei.id,
        amount: 89900,
        currency: "INR",
        status: "FAILED",
        failureReason: "Insufficient funds",
      },
    }));

  // Milestone 6 addition: a third failed payment large enough to
  // cross HUMAN_APPROVAL_AMOUNT_THRESHOLD (see engine/approval-gate.ts),
  // so the dashboard/cases UI has a real PENDING_APPROVAL case to
  // demo Approve/Reject against, instead of frontend mock data.
  const existingBigFailedPayment = await prisma.payment.findFirst({
    where: { merchantId: merchant.id, customerId: asha.id, status: "FAILED", amount: 500000 },
  });
  const bigFailedPayment =
    existingBigFailedPayment ??
    (await prisma.payment.create({
      data: {
        merchantId: merchant.id,
        customerId: asha.id,
        amount: 500000,
        currency: "INR",
        status: "FAILED",
        failureReason: "Card declined -- suspected fraud hold",
      },
    }));

  // One abandoned checkout and one past-due subscription so the
  // checkout-dropoff and subscription-failure workflows (Milestone 5)
  // also have real demo data, not just payment-degradation.
  const existingCheckoutSession = await prisma.checkoutSession.findFirst({
    where: { merchantId: merchant.id, customerId: diego.id, status: "ABANDONED" },
  });
  const checkoutSession =
    existingCheckoutSession ??
    (await prisma.checkoutSession.create({
      data: {
        merchantId: merchant.id,
        customerId: diego.id,
        amount: 65000,
        currency: "INR",
        status: "ABANDONED",
      },
    }));

  const existingSubscription = await prisma.subscription.findFirst({
    where: { merchantId: merchant.id, customerId: mei.id, status: "PAST_DUE" },
  });
  const subscription =
    existingSubscription ??
    (await prisma.subscription.create({
      data: {
        merchantId: merchant.id,
        customerId: mei.id,
        planName: "Pro Monthly",
        amount: 120000,
        currency: "INR",
        status: "PAST_DUE",
        currentPeriodEnd: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    }));

  // Milestone 6 addition: actually run each workflow against its
  // seeded entity, so `npm run prisma:seed` alone leaves the
  // dashboard/cases UI with real RecoveryCase, RecoveryDecision,
  // PolicyEvaluation, RecoveryAttempt, and AuditLog rows to render --
  // per the milestone's "use real backend data, no fake analytics"
  // requirement. Each workflow already dedupes against an existing
  // active RecoveryCase for the same source entity (see each
  // handler's detection function), so this is safe to re-run.
  const workflowRuns: Array<[keyof typeof workflowRegistry, string]> = [
    ["payment-degradation", failedPayment.id],
    ["payment-degradation", secondFailedPayment.id],
    ["payment-degradation", bigFailedPayment.id],
    ["checkout-dropoff", checkoutSession.id],
    ["subscription-failure", subscription.id],
  ];

  for (const [workflowName, entityId] of workflowRuns) {
    try {
      const handler = workflowRegistry[workflowName];
      if (!handler) {
        throw new Error(`Workflow not registered: ${workflowName}`);
      }
      const result = await handler(prisma, { entityId });
      console.log(`  Ran ${workflowName} for ${entityId}: ${result.status}`);
    } catch (err) {
      console.log(
        `  Skipped ${workflowName} for ${entityId}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  console.log("Seed complete:");
  console.log(`  Merchant:  ${merchant.name} (${merchant.id})`);
  console.log(`  Policy:    ${policy.name} (${policy.id})`);
  console.log(
    `  Customers: ${asha.name}, ${diego.name}, ${mei.name}`
  );
  console.log(
    `  Failed payment (recoverable): ${failedPayment.id} -- ${failedPayment.amount} ${failedPayment.currency}`
  );
  console.log(
    `  Second failed payment: ${secondFailedPayment.id} -- ${secondFailedPayment.amount} ${secondFailedPayment.currency}`
  );
  console.log(
    `  Succeeded payment: ${succeededPayment.id} -- ${succeededPayment.amount} ${succeededPayment.currency}`
  );
  console.log(
    `  Large failed payment (PENDING_APPROVAL demo): ${bigFailedPayment.id} -- ${bigFailedPayment.amount} ${bigFailedPayment.currency}`
  );
  console.log(`  Abandoned checkout: ${checkoutSession.id}`);
  console.log(`  Past-due subscription: ${subscription.id}`);
  console.log("");
  console.log("Frontend: http://localhost:3000");
  console.log("API:      http://localhost:4000/api/dashboard");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
