import type { Customer, Merchant, PrismaClient } from "@prisma/client";
import { workflowRegistry, type WorkflowHandler } from "../workflows/registry.js";
import { approveRecoveryCase } from "../engine/approval-service.js";
import { evaluateBaseline } from "./baseline.js";
import type { BatchScenario, ScenarioEvaluationResult } from "./types.js";

const ENABLED_MERCHANT_EMAIL = "batch-eval-enabled@recoveros.internal";
const DISABLED_MERCHANT_EMAIL = "batch-eval-disabled@recoveros.internal";
const CUSTOMER_POOL_SIZE = 5;

interface BatchFixtures {
  enabledMerchant: Merchant;
  enabledCustomers: Customer[];
  disabledMerchant: Merchant;
  disabledCustomer: Customer;
}

async function upsertMerchant(
  prisma: PrismaClient,
  email: string,
  name: string
): Promise<Merchant> {
  return prisma.merchant.upsert({
    where: { email },
    update: {},
    create: { name, email },
  });
}

async function upsertCustomer(
  prisma: PrismaClient,
  merchantId: string,
  email: string,
  name: string
): Promise<Customer> {
  const existing = await prisma.customer.findFirst({ where: { merchantId, email } });
  if (existing) return existing;
  return prisma.customer.create({ data: { merchantId, name, email } });
}

async function upsertPolicy(
  prisma: PrismaClient,
  merchantId: string,
  name: string,
  isEnabled: boolean
): Promise<void> {
  const existing = await prisma.policy.findFirst({ where: { merchantId, name } });
  if (existing) {
    if (existing.isEnabled !== isEnabled) {
      await prisma.policy.update({ where: { id: existing.id }, data: { isEnabled } });
    }
    return;
  }
  await prisma.policy.create({
    data: { merchantId, name, isEnabled, maxAttempts: 10 },
  });
}

/**
 * Idempotently provisions the dedicated merchants/customers/policies
 * the batch evaluator runs scenarios against. Never touches
 * merchants seeded by scripts/seed.ts or created by real usage --
 * every batch-evaluation entity lives under one of these two
 * merchants, identified by a fixed, reserved email.
 *
 * Two merchants exist (not one) because policy.engine.ts resolves a
 * merchant's policy with `findFirst(...).orderBy("createdAt","asc")`
 * -- there is no per-RecoveryCase policy selection. Demonstrating the
 * Policy Engine's real BLOCK path therefore requires a second
 * merchant whose oldest policy is disabled, not a flag on one shared
 * merchant.
 */
async function ensureBatchFixtures(prisma: PrismaClient): Promise<BatchFixtures> {
  const enabledMerchant = await upsertMerchant(
    prisma,
    ENABLED_MERCHANT_EMAIL,
    "Batch Evaluation Merchant"
  );
  await upsertPolicy(prisma, enabledMerchant.id, "Batch Evaluation Policy", true);

  const enabledCustomers: Customer[] = [];
  for (let i = 0; i < CUSTOMER_POOL_SIZE; i += 1) {
    const customer = await upsertCustomer(
      prisma,
      enabledMerchant.id,
      `batch-eval-customer-${i}@recoveros.internal`,
      `Batch Evaluation Customer ${i + 1}`
    );
    enabledCustomers.push(customer);
  }

  const disabledMerchant = await upsertMerchant(
    prisma,
    DISABLED_MERCHANT_EMAIL,
    "Batch Evaluation Merchant (Policy Disabled)"
  );
  await upsertPolicy(prisma, disabledMerchant.id, "Batch Evaluation Policy (Disabled)", false);
  const disabledCustomer = await upsertCustomer(
    prisma,
    disabledMerchant.id,
    "batch-eval-disabled-customer@recoveros.internal",
    "Batch Evaluation Customer (Disabled Policy)"
  );

  return { enabledMerchant, enabledCustomers, disabledMerchant, disabledCustomer };
}

function pickCustomer(fixtures: BatchFixtures, scenario: BatchScenario, index: number): Customer {
  if (scenario.useDisabledPolicy) return fixtures.disabledCustomer;
  return fixtures.enabledCustomers[index % fixtures.enabledCustomers.length]!;
}

function merchantIdFor(fixtures: BatchFixtures, scenario: BatchScenario): string {
  return scenario.useDisabledPolicy ? fixtures.disabledMerchant.id : fixtures.enabledMerchant.id;
}

/**
 * Creates the real domain entity a scenario represents (a FAILED
 * Payment, an ABANDONED CheckoutSession, and so on) and returns the
 * entityId the workflow registry expects. This is the only place the
 * batch evaluator writes revenue-entity rows -- everything after this
 * point is the real workflowRegistry -> Recovery Engine path.
 */
async function createEntityForScenario(
  prisma: PrismaClient,
  fixtures: BatchFixtures,
  scenario: BatchScenario,
  index: number
): Promise<string> {
  const merchantId = merchantIdFor(fixtures, scenario);
  const customer = pickCustomer(fixtures, scenario, index);

  switch (scenario.workflow) {
    case "payment-degradation": {
      const payment = await prisma.payment.create({
        data: {
          merchantId,
          customerId: customer.id,
          amount: scenario.amount,
          currency: scenario.currency,
          status: "FAILED",
          failureReason: scenario.condition,
        },
      });
      return payment.id;
    }
    case "checkout-dropoff": {
      const checkoutSession = await prisma.checkoutSession.create({
        data: {
          merchantId,
          customerId: customer.id,
          amount: scenario.amount,
          currency: scenario.currency,
          status: "ABANDONED",
        },
      });
      return checkoutSession.id;
    }
    case "subscription-failure": {
      const subscription = await prisma.subscription.create({
        data: {
          merchantId,
          customerId: customer.id,
          planName: scenario.condition,
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
          customerId: customer.id,
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
          customerId: customer.id,
          status: index % 2 === 0 ? "REVOKED" : "EXPIRED",
          amount: scenario.amount,
          currency: scenario.currency,
        },
      });
      return mandate.id;
    }
    case "promise-to-pay": {
      const promiseToPay = await prisma.promiseToPay.create({
        data: {
          customerId: customer.id,
          amount: scenario.amount,
          promisedDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          status: "PENDING",
        },
      });
      return promiseToPay.id;
    }
    default: {
      const exhaustiveCheck: never = scenario.workflow;
      throw new Error(`Unhandled batch-evaluation workflow: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Routes one synthetic scenario through the actual RecoverOS
 * architecture: create the domain entity, run it through the real
 * workflowRegistry (detection -> decision -> policy -> approval gate
 * -> execution -> verification), and, if the Approval Gate paused it
 * on PENDING_APPROVAL, resume it through the existing
 * approveRecoveryCase() -- the same function a human operator's
 * "Approve" click calls (see routes/recovery-dashboard.router.ts).
 * No orchestrator, policy, decision, or execution logic is
 * reimplemented here.
 */
async function evaluateScenario(
  prisma: PrismaClient,
  fixtures: BatchFixtures,
  scenario: BatchScenario,
  index: number,
  workflow: WorkflowHandler
): Promise<ScenarioEvaluationResult> {
  const entityId = await createEntityForScenario(prisma, fixtures, scenario, index);
  const runResult = await workflow(prisma, { entityId });

  let approvalRequired = false;
  let finalRecoveryCaseId = runResult.recoveryCaseId;

  if (runResult.status === "PENDING_APPROVAL") {
    approvalRequired = true;
    const approvalResult = await approveRecoveryCase(prisma, runResult.recoveryCaseId);
    finalRecoveryCaseId = approvalResult.recoveryCaseId;
  }

  const finalCase = await prisma.recoveryCase.findUniqueOrThrow({
    where: { id: finalRecoveryCaseId },
  });

  const baseline = evaluateBaseline(scenario);

  return {
    scenarioId: scenario.id,
    workflow: scenario.workflow,
    amount: scenario.amount,
    currency: scenario.currency,
    condition: scenario.condition,
    riskTier: scenario.riskTier,
    recoveryCaseId: finalCase.id,
    recoverOsStatus: finalCase.status,
    recoverOsRecoveredAmount: finalCase.recoveredAmount ?? 0,
    approvalRequired,
    baselineRecovered: baseline.recovered,
    baselineRecoveredAmount: baseline.recoveredAmount,
  };
}

export async function evaluateAllScenarios(
  prisma: PrismaClient,
  scenarios: BatchScenario[]
): Promise<ScenarioEvaluationResult[]> {
  const fixtures = await ensureBatchFixtures(prisma);
  const results: ScenarioEvaluationResult[] = [];

  for (let i = 0; i < scenarios.length; i += 1) {
    const scenario = scenarios[i]!;
    const workflow = workflowRegistry[scenario.workflow];
    if (!workflow) {
      throw new Error(`Workflow "${scenario.workflow}" is not registered`);
    }
    const result = await evaluateScenario(prisma, fixtures, scenario, i, workflow);
    results.push(result);
  }

  return results;
}
