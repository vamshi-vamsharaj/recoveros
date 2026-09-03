import "dotenv/config";
import { PrismaClient } from "@prisma/client";

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
  console.log("");
  console.log("Try:");
  console.log(
    `  POST http://localhost:4000/api/recovery/payment/${failedPayment.id}/run`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
