import { describe, it, expect, afterAll } from "vitest";
import {
  detectFailedMandate,
  runMandateFailureWorkflow,
} from "../src/workflows/mandate-failure.handler.js";
import { prisma, createFixture, createMandate } from "./fixtures.js";

describe("mandate-failure.handler", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("detectFailedMandate", () => {
    it("detects a REVOKED mandate and creates a RecoveryCase", async () => {
      const { merchant, customer } = await createFixture();
      const mandate = await createMandate(merchant.id, customer.id, {
        status: "REVOKED",
        amount: 50000,
      });

      const recoveryCase = await detectFailedMandate(prisma, mandate.id);

      expect(recoveryCase.sourceType).toBe("MANDATE");
      expect(recoveryCase.paymentId).toBeNull();
      expect(recoveryCase.merchantId).toBe(merchant.id);
      expect(recoveryCase.customerId).toBe(customer.id);
      expect(recoveryCase.amount).toBe(50000);
      expect(recoveryCase.status).toBe("DETECTED");

      const auditLogs = await prisma.auditLog.findMany({
        where: { recoveryCaseId: recoveryCase.id },
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]?.eventType).toBe("RECOVERY_CASE_CREATED");
    });

    it("detects an EXPIRED mandate too", async () => {
      const { merchant, customer } = await createFixture();
      const mandate = await createMandate(merchant.id, customer.id, {
        status: "EXPIRED",
        amount: 30000,
      });

      const recoveryCase = await detectFailedMandate(prisma, mandate.id);

      expect(recoveryCase.sourceType).toBe("MANDATE");
      expect(recoveryCase.amount).toBe(30000);
    });

    it("rejects a valid/non-failed mandate (ACTIVE or PAUSED)", async () => {
      const { merchant, customer } = await createFixture();
      const active = await createMandate(merchant.id, customer.id, { status: "ACTIVE" });
      const paused = await createMandate(merchant.id, customer.id, { status: "PAUSED" });

      await expect(detectFailedMandate(prisma, active.id)).rejects.toThrow(
        /not in a failed state/i
      );
      await expect(detectFailedMandate(prisma, paused.id)).rejects.toThrow(
        /not in a failed state/i
      );
    });

    it("rejects a missing mandate", async () => {
      await expect(
        detectFailedMandate(prisma, "does-not-exist")
      ).rejects.toThrow(/not found/i);
    });

    it("rejects a failed mandate with no recorded amount", async () => {
      const { merchant, customer } = await createFixture();
      const mandate = await createMandate(merchant.id, customer.id, {
        status: "REVOKED",
        amount: null,
      });

      await expect(detectFailedMandate(prisma, mandate.id)).rejects.toThrow(
        /no amount recorded/i
      );
    });

    it("does not create a duplicate RecoveryCase for a repeated detection run", async () => {
      const { merchant, customer } = await createFixture();
      const mandate = await createMandate(merchant.id, customer.id, {
        status: "REVOKED",
      });

      const first = await detectFailedMandate(prisma, mandate.id);
      const second = await detectFailedMandate(prisma, mandate.id);

      expect(second.id).toBe(first.id);

      const cases = await prisma.recoveryCase.findMany({
        where: { merchantId: merchant.id, sourceType: "MANDATE" },
      });
      expect(cases).toHaveLength(1);
    });
  });

  describe("runMandateFailureWorkflow", () => {
    it("takes a failed mandate all the way through the shared orchestrator", async () => {
      const { merchant, customer } = await createFixture();
      const mandate = await createMandate(merchant.id, customer.id, {
        status: "REVOKED",
        amount: 40000,
      });

      const result = await runMandateFailureWorkflow(prisma, mandate.id);

      expect(result.blocked).toBe(false);
      expect(result.status).toBe("RECOVERED");

      const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
        where: { id: result.recoveryCaseId },
      });
      expect(recoveryCase.sourceType).toBe("MANDATE");
      expect(recoveryCase.status).toBe("RECOVERED");
      expect(recoveryCase.recoveredAmount).toBe(40000);

      const decision = await prisma.recoveryDecision.findFirstOrThrow({
        where: { recoveryCaseId: recoveryCase.id },
      });
      // Bounded fallback strategy -- see mandate-failure.handler.ts's
      // wiring comment: no real Razorpay mandate-retry API exists, so
      // no invented "retry mandate" strategy is ever recommended here.
      expect(decision.strategy).toBe("PAYMENT_LINK");

      const attempt = await prisma.recoveryAttempt.findFirstOrThrow({
        where: { recoveryCaseId: recoveryCase.id },
      });
      expect(attempt.status).toBe("RECOVERED");
      expect(attempt.adapterName).toBe("SimulatedAdapter");
    });

    it("enforces bounded retries via the shared policy engine (never retries indefinitely)", async () => {
      const { merchant, customer } = await createFixture({ maxAttempts: 0 });
      const mandate = await createMandate(merchant.id, customer.id, {
        status: "REVOKED",
      });

      const result = await runMandateFailureWorkflow(prisma, mandate.id);

      expect(result.blocked).toBe(true);
      expect(result.status).toBe("BLOCKED");

      const attempts = await prisma.recoveryAttempt.findMany({
        where: { recoveryCaseId: result.recoveryCaseId },
      });
      expect(attempts).toHaveLength(0);
    });
  });
});