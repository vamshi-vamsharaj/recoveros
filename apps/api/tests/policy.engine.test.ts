import { describe, it, expect, afterAll } from "vitest";
import { evaluatePolicy } from "../src/engine/policy.engine.js";
import { prisma, createFixture, createFailedPayment } from "./fixtures.js";

async function createCaseAndDecision(
  merchantId: string,
  customerId: string,
  paymentId: string,
  status: "DETECTED" | "RECOVERED" = "DETECTED"
) {
  const recoveryCase = await prisma.recoveryCase.create({
    data: {
      merchantId,
      customerId,
      sourceType: "PAYMENT",
      paymentId,
      status,
      amount: 10000,
      currency: "INR",
    },
  });

  const decision = await prisma.recoveryDecision.create({
    data: {
      recoveryCaseId: recoveryCase.id,
      strategy: "PAYMENT_LINK",
      reason: "test decision",
      confidence: "HIGH",
      providerName: "StubDecisionProvider",
      rawOutput: {},
    },
  });

  return { recoveryCase, decision };
}

describe("policy.engine", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("blocks when the RecoveryCase is already RECOVERED", async () => {
    const { merchant, customer } = await createFixture();
    const payment = await createFailedPayment(merchant.id, customer.id);
    const { recoveryCase, decision } = await createCaseAndDecision(
      merchant.id,
      customer.id,
      payment.id,
      "RECOVERED"
    );

    const outcome = await evaluatePolicy(prisma, recoveryCase, decision);

    expect(outcome.result).toBe("BLOCKED");
    expect(outcome.reason).toMatch(/already RECOVERED/i);
  });

  it("blocks when maximum recovery attempts have been reached", async () => {
    const { merchant, customer, policy } = await createFixture({
      maxAttempts: 1,
    });
    const payment = await createFailedPayment(merchant.id, customer.id);
    const { recoveryCase, decision: firstDecision } = await createCaseAndDecision(
      merchant.id,
      customer.id,
      payment.id
    );

    // Create one prior approved+executed attempt to hit maxAttempts.
    const firstEvaluation = await prisma.policyEvaluation.create({
      data: {
        recoveryDecisionId: firstDecision.id,
        policyId: policy.id,
        result: "APPROVED",
        reason: "seed attempt",
      },
    });
    await prisma.recoveryAttempt.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        recoveryDecisionId: firstDecision.id,
        policyEvaluationId: firstEvaluation.id,
        adapterName: "SimulatedAdapter",
        status: "RECOVERED",
        recoveredAmount: 10000,
      },
    });

    const secondDecision = await prisma.recoveryDecision.create({
      data: {
        recoveryCaseId: recoveryCase.id,
        strategy: "PAYMENT_LINK",
        reason: "second attempt",
        confidence: "HIGH",
        providerName: "StubDecisionProvider",
        rawOutput: {},
      },
    });

    const outcome = await evaluatePolicy(prisma, recoveryCase, secondDecision);

    expect(outcome.result).toBe("BLOCKED");
    expect(outcome.reason).toMatch(/maximum recovery attempts/i);
  });

  it("blocks when the policy is disabled", async () => {
    const { merchant, customer } = await createFixture({
      policyEnabled: false,
    });
    const payment = await createFailedPayment(merchant.id, customer.id);
    const { recoveryCase, decision } = await createCaseAndDecision(
      merchant.id,
      customer.id,
      payment.id
    );

    const outcome = await evaluatePolicy(prisma, recoveryCase, decision);

    expect(outcome.result).toBe("BLOCKED");
    expect(outcome.reason).toMatch(/disabled/i);
  });

  it("approves a valid recovery case within retry limits", async () => {
    const { merchant, customer } = await createFixture();
    const payment = await createFailedPayment(merchant.id, customer.id);
    const { recoveryCase, decision } = await createCaseAndDecision(
      merchant.id,
      customer.id,
      payment.id
    );

    const outcome = await evaluatePolicy(prisma, recoveryCase, decision);

    expect(outcome.result).toBe("APPROVED");
    expect(outcome.reason).toMatch(/within retry limit/i);
  });
});
