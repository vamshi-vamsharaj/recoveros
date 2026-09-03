import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runPaymentDegradationWorkflow } from "../workflows/payment-degradation.handler.js";

const prisma = new PrismaClient();

async function main() {
  const paymentId = process.argv[2];

  if (!paymentId) {
    // Fall back to the first FAILED payment found, so `npm run recover`
    // works with no arguments right after seeding.
    const failedPayment = await prisma.payment.findFirst({
      where: { status: "FAILED" },
      orderBy: { createdAt: "asc" },
    });

    if (!failedPayment) {
      console.error(
        "No FAILED payment found and no paymentId argument given. Run the seed script first."
      );
      process.exit(1);
    }

    console.log(`No paymentId given -- using seeded payment ${failedPayment.id}`);
    const result = await runPaymentDegradationWorkflow(prisma, failedPayment.id);
    console.log(result);
    return;
  }

  const result = await runPaymentDegradationWorkflow(prisma, paymentId);
  console.log(result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
