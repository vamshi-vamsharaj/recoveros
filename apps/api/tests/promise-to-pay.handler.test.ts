import { describe, it, expect, afterAll } from "vitest";
import {
  detectDuePromise,
  runPromiseToPayWorkflow,
} from "../src/workflows/promise-to-pay.handler.js";
import { prisma, createFixture, createPromiseToPay } from "./fixtures.js";

describe("promise-to-pay.handler", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("detectDuePromise", () => {
    it("detects a due, unfulfilled promise and creates a RecoveryCase", async () => {
      const { merchant, customer } = await createFixture();
      const promise = await createPromiseToPay(customer.id, {
        status: "PENDING",
        amount: 15000,
        promisedDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      const recoveryCase = await detectDuePromise(prisma, promise.id);

      expect(recoveryCase.sourceType).toBe("PROMISE_TO_PAY");
      expect(recoveryCase.paymentId).toBeNull();
      expect(recoveryCase.merchantId).toBe(merchant.id);
      expect(recoveryCase.customerId).toBe(customer.id);
      expect(recoveryCase.amount).toBe(15000);
      expect(recoveryCase.status).toBe("DETECTED");

      const updatedPromise = await prisma.promiseToPay.findUniqueOrThrow({
        where: { id: promise.id },
      });
      expect(updatedPromise.recoveryCaseId).toBe(recoveryCase.id);

      const auditLogs = await prisma.auditLog.findMany({
        where: { recoveryCaseId: recoveryCase.id },
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]?.eventType).toBe("RECOVERY_CASE_CREATED");
    });

    it("rejects a fulfilled (KEPT) promise", async () => {
      const { customer } = await createFixture();
      const promise = await createPromiseToPay(customer.id, {
        status: "KEPT",
        promisedDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      await expect(detectDuePromise(prisma, promise.id)).rejects.toThrow(
        /not PENDING/i
      );
    });

    it("rejects a promise that is not yet due", async () => {
      const { customer } = await createFixture();
      const promise = await createPromiseToPay(customer.id, {
        status: "PENDING",
        promisedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await expect(detectDuePromise(prisma, promise.id)).rejects.toThrow(
        /not yet due/i
      );
    });

    it("rejects a missing promise", async () => {
      await expect(
        detectDuePromise(prisma, "does-not-exist")
      ).rejects.toThrow(/not found/i);
    });

    it("does not create a duplicate RecoveryCase for a repeated detection run", async () => {
      const { customer } = await createFixture();
      const promise = await createPromiseToPay(customer.id, {
        status: "PENDING",
        promisedDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      const first = await detectDuePromise(prisma, promise.id);
      const second = await detectDuePromise(prisma, promise.id);

      expect(second.id).toBe(first.id);

      const cases = await prisma.recoveryCase.findMany({
        where: { customerId: customer.id, sourceType: "PROMISE_TO_PAY" },
      });
      expect(cases).toHaveLength(1);
    });
  });

  describe("runPromiseToPayWorkflow", () => {
    it("takes a due, unfulfilled promise all the way through the shared orchestrator", async () => {
      const { customer } = await createFixture();
      const promise = await createPromiseToPay(customer.id, {
        status: "PENDING",
        amount: 60000,
        promisedDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      const result = await runPromiseToPayWorkflow(prisma, promise.id);

      expect(result.blocked).toBe(false);
      expect(result.status).toBe("RECOVERED");

      const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
        where: { id: result.recoveryCaseId },
      });
      expect(recoveryCase.sourceType).toBe("PROMISE_TO_PAY");
      expect(recoveryCase.status).toBe("RECOVERED");
      expect(recoveryCase.recoveredAmount).toBe(60000);

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

    it("blocks via the shared policy engine exactly like the other workflows", async () => {
      const { customer } = await createFixture({ maxAttempts: 0 });
      const promise = await createPromiseToPay(customer.id, {
        status: "PENDING",
        promisedDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      const result = await runPromiseToPayWorkflow(prisma, promise.id);

      expect(result.blocked).toBe(true);
      expect(result.status).toBe("BLOCKED");

      const attempts = await prisma.recoveryAttempt.findMany({
        where: { recoveryCaseId: result.recoveryCaseId },
      });
      expect(attempts).toHaveLength(0);
    });
  });
});