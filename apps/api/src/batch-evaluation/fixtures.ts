import type { PrismaClient } from "@prisma/client";
import type { ScenarioDefinition } from "./types.js";

const MERCHANT_DOMAIN = "batch-eval.recoveros.internal";

export async function ensureScenarioTenant(
  prisma: PrismaClient,
  scenario: ScenarioDefinition
) {
  const merchantEmail = `${scenario.scenarioId}@${MERCHANT_DOMAIN}`;

  const merchant = await prisma.merchant.upsert({
    where: { email: merchantEmail },
    update: {},
    create: {
      name: `Batch Eval - ${scenario.scenarioId}`,
      email: merchantEmail,
    },
  });

  const customerEmail = `customer.${scenario.scenarioId}@${MERCHANT_DOMAIN}`;
  const customer =
    (await prisma.customer.findFirst({
      where: { merchantId: merchant.id, email: customerEmail },
    })) ??
    (await prisma.customer.create({
      data: {
        merchantId: merchant.id,
        name: `Batch Eval Customer - ${scenario.riskCondition}`,
        email: customerEmail,
      },
    }));

  const policy =
    (await prisma.policy.findFirst({
      where: { merchantId: merchant.id, name: "Batch Evaluation Policy" },
    })) ??
    (await prisma.policy.create({
      data: {
        merchantId: merchant.id,
        name: "Batch Evaluation Policy",
        isEnabled: scenario.policy.isEnabled,
        maxAttempts: scenario.policy.maxAttempts,
      },
    }));

  if (
    policy.isEnabled !== scenario.policy.isEnabled ||
    policy.maxAttempts !== scenario.policy.maxAttempts
  ) {
    await prisma.policy.update({
      where: { id: policy.id },
      data: {
        isEnabled: scenario.policy.isEnabled,
        maxAttempts: scenario.policy.maxAttempts,
      },
    });
  }

  return { merchant, customer };
}

export async function createScenarioEntity(
  prisma: PrismaClient,
  scenario: ScenarioDefinition,
  merchantId: string,
  customerId: string
): Promise<string> {
  switch (scenario.workflow) {
    case "payment-degradation": {
      const payment = await prisma.payment.create({
        data: {
          merchantId,
          customerId,
          amount: scenario.amount,
          currency: scenario.currency,
          status: "FAILED",
          failureReason: "Batch evaluation synthetic failure",
        },
      });
      return payment.id;
    }
    case "checkout-dropoff": {
      const session = await prisma.checkoutSession.create({
        data: {
          merchantId,
          customerId,
          amount: scenario.amount,
          currency: scenario.currency,
          status: "ABANDONED",
        },
      });
      return session.id;
    }
    case "subscription-failure": {
      const subscription = await prisma.subscription.create({
        data: {
          merchantId,
          customerId,
          planName: "Batch Evaluation Plan",
          amount: scenario.amount,
          currency: scenario.currency,
          status: "PAST_DUE",
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      return subscription.id;
    }
    case "invoice-overdue": {
      const invoice = await prisma.invoice.create({
        data: {
          merchantId,
          customerId,
          amount: scenario.amount,
          currency: scenario.currency,
          status: "OVERDUE",
          dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      });
      return invoice.id;
    }
    case "mandate-failure": {
      const mandate = await prisma.mandate.create({
        data: {
          merchantId,
          customerId,
          status: "REVOKED",
          amount: scenario.amount,
          currency: scenario.currency,
        },
      });
      return mandate.id;
    }
    case "promise-to-pay": {
      const promise = await prisma.promiseToPay.create({
        data: {
          customerId,
          amount: scenario.amount,
          promisedDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          status: "PENDING",
        },
      });
      return promise.id;
    }
    default: {
      const exhaustiveCheck: never = scenario.workflow;
      throw new Error(`Unhandled workflow: ${exhaustiveCheck}`);
    }
  }
}
