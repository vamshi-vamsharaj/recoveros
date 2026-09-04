import { describe, it, expect, afterAll } from "vitest";
import {
  detectAbandonedCheckout,
  runCheckoutDropoffWorkflow,
} from "../src/workflows/checkout-dropoff.handler.js";
import { prisma, createFixture, createCheckoutSession } from "./fixtures.js";

describe("checkout-dropoff.handler", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("detectAbandonedCheckout", () => {
    it("detects a valid abandoned checkout and creates a RecoveryCase", async () => {
      const { merchant, customer } = await createFixture();
      const checkout = await createCheckoutSession(merchant.id, customer.id, {
        status: "ABANDONED",
        amount: 45000,
      });

      const recoveryCase = await detectAbandonedCheckout(prisma, checkout.id);

      expect(recoveryCase.sourceType).toBe("CHECKOUT_SESSION");
      expect(recoveryCase.paymentId).toBeNull();
      expect(recoveryCase.merchantId).toBe(merchant.id);
      expect(recoveryCase.customerId).toBe(customer.id);
      expect(recoveryCase.amount).toBe(45000);
      expect(recoveryCase.status).toBe("DETECTED");

      const auditLogs = await prisma.auditLog.findMany({
        where: { recoveryCaseId: recoveryCase.id },
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]?.eventType).toBe("RECOVERY_CASE_CREATED");
    });

    it("rejects a checkout session that is not ABANDONED", async () => {
      const { merchant, customer } = await createFixture();
      const checkout = await createCheckoutSession(merchant.id, customer.id, {
        status: "STARTED",
      });

      await expect(detectAbandonedCheckout(prisma, checkout.id)).rejects.toThrow(
        /not ABANDONED/i
      );

      const checkout2 = await createCheckoutSession(merchant.id, customer.id, {
        status: "COMPLETED",
      });
      await expect(detectAbandonedCheckout(prisma, checkout2.id)).rejects.toThrow(
        /not ABANDONED/i
      );
    });

    it("rejects a missing checkout session", async () => {
      await expect(
        detectAbandonedCheckout(prisma, "does-not-exist")
      ).rejects.toThrow(/not found/i);
    });

    it("rejects a guest checkout session with no customer", async () => {
      const { merchant } = await createFixture();
      const checkout = await createCheckoutSession(merchant.id, null, {
        status: "ABANDONED",
      });

      await expect(detectAbandonedCheckout(prisma, checkout.id)).rejects.toThrow(
        /no associated customer/i
      );
    });

    it("does not create a duplicate RecoveryCase for a repeated detection run", async () => {
      const { merchant, customer } = await createFixture();
      const checkout = await createCheckoutSession(merchant.id, customer.id, {
        status: "ABANDONED",
      });

      const first = await detectAbandonedCheckout(prisma, checkout.id);
      const second = await detectAbandonedCheckout(prisma, checkout.id);

      expect(second.id).toBe(first.id);

      const cases = await prisma.recoveryCase.findMany({
        where: { merchantId: merchant.id, sourceType: "CHECKOUT_SESSION" },
      });
      expect(cases).toHaveLength(1);
    });
  });

  describe("runCheckoutDropoffWorkflow", () => {
    it("takes an abandoned checkout all the way through the shared orchestrator", async () => {
      const { merchant, customer } = await createFixture();
      const checkout = await createCheckoutSession(merchant.id, customer.id, {
        status: "ABANDONED",
        amount: 89900,
      });

      const result = await runCheckoutDropoffWorkflow(prisma, checkout.id);

      expect(result.blocked).toBe(false);
      expect(result.status).toBe("RECOVERED");

      const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
        where: { id: result.recoveryCaseId },
      });
      expect(recoveryCase.sourceType).toBe("CHECKOUT_SESSION");
      expect(recoveryCase.status).toBe("RECOVERED");
      expect(recoveryCase.recoveredAmount).toBe(89900);

      const decision = await prisma.recoveryDecision.findFirstOrThrow({
        where: { recoveryCaseId: recoveryCase.id },
      });
      expect(decision.strategy).toBe("PAYMENT_LINK");
      expect(decision.providerName).toBe("StubDecisionProvider");

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
      const checkout = await createCheckoutSession(merchant.id, customer.id, {
        status: "ABANDONED",
      });

      const result = await runCheckoutDropoffWorkflow(prisma, checkout.id);

      expect(result.blocked).toBe(true);
      expect(result.status).toBe("BLOCKED");

      const attempts = await prisma.recoveryAttempt.findMany({
        where: { recoveryCaseId: result.recoveryCaseId },
      });
      expect(attempts).toHaveLength(0);
    });
  });
});