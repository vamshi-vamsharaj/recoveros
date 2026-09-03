import { describe, it, expect, afterAll } from "vitest";
import { runPaymentDegradationWorkflow } from "../src/workflows/payment-degradation.handler.js";
import { prisma, createFixture, createFailedPayment } from "./fixtures.js";

describe("recovery pipeline (integration)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("takes a FAILED payment all the way to RECOVERED", async () => {
    const { merchant, customer } = await createFixture();
    const payment = await createFailedPayment(merchant.id, customer.id, 149900);

    const result = await runPaymentDegradationWorkflow(prisma, payment.id);

    expect(result.blocked).toBe(false);
    expect(result.status).toBe("RECOVERED");

    const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
      where: { id: result.recoveryCaseId },
    });
    expect(recoveryCase.status).toBe("RECOVERED");
    expect(recoveryCase.recoveredAmount).toBe(149900);

    const attempt = await prisma.recoveryAttempt.findFirstOrThrow({
      where: { recoveryCaseId: recoveryCase.id },
    });
    expect(attempt.status).toBe("RECOVERED");
    expect(attempt.adapterName).toBe("SimulatedAdapter");
    expect(attempt.recoveredAmount).toBe(149900);

    const evaluation = await prisma.policyEvaluation.findUniqueOrThrow({
      where: { id: attempt.policyEvaluationId },
    });
    expect(evaluation.result).toBe("APPROVED");

    const auditLogs = await prisma.auditLog.findMany({
      where: { recoveryCaseId: recoveryCase.id },
      orderBy: { createdAt: "asc" },
    });
    const eventTypes = auditLogs.map((log: { eventType: string }) => log.eventType);
    expect(eventTypes).toEqual([
      "RECOVERY_CASE_CREATED",
      "DECISION_CREATED",
      "POLICY_EVALUATED",
      "ACTION_APPROVED",
      "EXECUTION_STARTED",
      "EXECUTION_COMPLETED",
      "RECOVERY_VERIFIED",
    ]);
  });

  it("does not create a RecoveryAttempt when policy blocks the decision", async () => {
    const { merchant, customer } = await createFixture({ maxAttempts: 0 });
    const payment = await createFailedPayment(merchant.id, customer.id, 5000);

    const result = await runPaymentDegradationWorkflow(prisma, payment.id);

    expect(result.blocked).toBe(true);
    expect(result.status).toBe("BLOCKED");

    const attempts = await prisma.recoveryAttempt.findMany({
      where: { recoveryCaseId: result.recoveryCaseId },
    });
    expect(attempts).toHaveLength(0);

    const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
      where: { id: result.recoveryCaseId },
    });
    expect(recoveryCase.status).toBe("BLOCKED");
  });
});
