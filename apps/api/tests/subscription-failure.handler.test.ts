import { describe, it, expect, afterAll } from "vitest";
import {
  detectFailedSubscription,
  runSubscriptionFailureWorkflow,
} from "../src/workflows/subscription-failure.handler.js";
import { prisma, createFixture, createSubscription } from "./fixtures.js";

describe("subscription-failure.handler", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("detectFailedSubscription", () => {
    it("detects a valid PAST_DUE subscription and creates a RecoveryCase", async () => {
      const { merchant, customer } = await createFixture();
      const subscription = await createSubscription(merchant.id, customer.id, {
        status: "PAST_DUE",
        amount: 29900,
      });

      const recoveryCase = await detectFailedSubscription(prisma, subscription.id);

      expect(recoveryCase.sourceType).toBe("SUBSCRIPTION");
      expect(recoveryCase.paymentId).toBeNull();
      expect(recoveryCase.merchantId).toBe(merchant.id);
      expect(recoveryCase.customerId).toBe(customer.id);
      expect(recoveryCase.amount).toBe(29900);
      expect(recoveryCase.status).toBe("DETECTED");

      const auditLogs = await prisma.auditLog.findMany({
        where: { recoveryCaseId: recoveryCase.id },
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]?.eventType).toBe("RECOVERY_CASE_CREATED");
    });

    it("rejects an ACTIVE subscription", async () => {
      const { merchant, customer } = await createFixture();
      const subscription = await createSubscription(merchant.id, customer.id, {
        status: "ACTIVE",
      });

      await expect(
        detectFailedSubscription(prisma, subscription.id)
      ).rejects.toThrow(/not PAST_DUE/i);
    });

    it("rejects CANCELED and PAUSED subscriptions", async () => {
      const { merchant, customer } = await createFixture();
      const canceled = await createSubscription(merchant.id, customer.id, {
        status: "CANCELED",
      });
      const paused = await createSubscription(merchant.id, customer.id, {
        status: "PAUSED",
      });

      await expect(detectFailedSubscription(prisma, canceled.id)).rejects.toThrow(
        /not PAST_DUE/i
      );
      await expect(detectFailedSubscription(prisma, paused.id)).rejects.toThrow(
        /not PAST_DUE/i
      );
    });

    it("rejects a missing subscription", async () => {
      await expect(
        detectFailedSubscription(prisma, "does-not-exist")
      ).rejects.toThrow(/not found/i);
    });

    it("does not create a duplicate RecoveryCase for a repeated detection run", async () => {
      const { merchant, customer } = await createFixture();
      const subscription = await createSubscription(merchant.id, customer.id, {
        status: "PAST_DUE",
      });

      const first = await detectFailedSubscription(prisma, subscription.id);
      const second = await detectFailedSubscription(prisma, subscription.id);

      expect(second.id).toBe(first.id);

      const cases = await prisma.recoveryCase.findMany({
        where: { merchantId: merchant.id, sourceType: "SUBSCRIPTION" },
      });
      expect(cases).toHaveLength(1);
    });
  });

  describe("runSubscriptionFailureWorkflow", () => {
    it("takes a PAST_DUE subscription all the way through the shared orchestrator", async () => {
      const { merchant, customer } = await createFixture();
      const subscription = await createSubscription(merchant.id, customer.id, {
        status: "PAST_DUE",
        amount: 19900,
      });

      const result = await runSubscriptionFailureWorkflow(prisma, subscription.id);

      expect(result.blocked).toBe(false);
      expect(result.status).toBe("RECOVERED");

      const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
        where: { id: result.recoveryCaseId },
      });
      expect(recoveryCase.sourceType).toBe("SUBSCRIPTION");
      expect(recoveryCase.status).toBe("RECOVERED");
      expect(recoveryCase.recoveredAmount).toBe(19900);

      const decision = await prisma.recoveryDecision.findFirstOrThrow({
        where: { recoveryCaseId: recoveryCase.id },
      });
      // RETRY_CARD is not used -- see subscription-failure.handler.ts's
      // wiring comment. StubDecisionProvider always recommends
      // PAYMENT_LINK, which both adapters can actually execute.
      expect(decision.strategy).toBe("PAYMENT_LINK");

      const attempt = await prisma.recoveryAttempt.findFirstOrThrow({
        where: { recoveryCaseId: recoveryCase.id },
      });
      expect(attempt.status).toBe("RECOVERED");
      expect(attempt.adapterName).toBe("SimulatedAdapter");

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

    it("blocks via the shared policy engine exactly like payment-degradation", async () => {
      const { merchant, customer } = await createFixture({ maxAttempts: 0 });
      const subscription = await createSubscription(merchant.id, customer.id, {
        status: "PAST_DUE",
      });

      const result = await runSubscriptionFailureWorkflow(prisma, subscription.id);

      expect(result.blocked).toBe(true);
      expect(result.status).toBe("BLOCKED");

      const attempts = await prisma.recoveryAttempt.findMany({
        where: { recoveryCaseId: result.recoveryCaseId },
      });
      expect(attempts).toHaveLength(0);
    });
  });
});