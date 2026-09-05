import { describe, it, expect, afterAll } from "vitest";
import {
  detectOverdueInvoice,
  runInvoiceOverdueWorkflow,
} from "../src/workflows/invoice-overdue.handler.js";
import { prisma, createFixture, createInvoice } from "./fixtures.js";

describe("invoice-overdue.handler", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("detectOverdueInvoice", () => {
    it("detects a genuinely overdue invoice and creates a RecoveryCase", async () => {
      const { merchant, customer } = await createFixture();
      const invoice = await createInvoice(merchant.id, customer.id, {
        status: "OVERDUE",
        amount: 75000,
      });

      const recoveryCase = await detectOverdueInvoice(prisma, invoice.id);

      expect(recoveryCase.sourceType).toBe("INVOICE");
      expect(recoveryCase.paymentId).toBeNull();
      expect(recoveryCase.merchantId).toBe(merchant.id);
      expect(recoveryCase.customerId).toBe(customer.id);
      expect(recoveryCase.amount).toBe(75000);
      expect(recoveryCase.currency).toBe("INR");
      expect(recoveryCase.status).toBe("DETECTED");

      const auditLogs = await prisma.auditLog.findMany({
        where: { recoveryCaseId: recoveryCase.id },
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]?.eventType).toBe("RECOVERY_CASE_CREATED");
    });

    it("rejects a non-overdue invoice", async () => {
      const { merchant, customer } = await createFixture();
      const invoice = await createInvoice(merchant.id, customer.id, {
        status: "OPEN",
      });

      await expect(detectOverdueInvoice(prisma, invoice.id)).rejects.toThrow(
        /not OVERDUE/i
      );
    });

    it("rejects a missing invoice", async () => {
      await expect(
        detectOverdueInvoice(prisma, "does-not-exist")
      ).rejects.toThrow(/not found/i);
    });

    it("does not create a duplicate RecoveryCase for a repeated detection run", async () => {
      const { merchant, customer } = await createFixture();
      const invoice = await createInvoice(merchant.id, customer.id, {
        status: "OVERDUE",
      });

      const first = await detectOverdueInvoice(prisma, invoice.id);
      const second = await detectOverdueInvoice(prisma, invoice.id);

      expect(second.id).toBe(first.id);

      const cases = await prisma.recoveryCase.findMany({
        where: { merchantId: merchant.id, sourceType: "INVOICE" },
      });
      expect(cases).toHaveLength(1);
    });
  });

  describe("runInvoiceOverdueWorkflow", () => {
    it("takes an overdue invoice all the way through the shared orchestrator", async () => {
      const { merchant, customer } = await createFixture();
      const invoice = await createInvoice(merchant.id, customer.id, {
        status: "OVERDUE",
        amount: 120000,
      });

      const result = await runInvoiceOverdueWorkflow(prisma, invoice.id);

      expect(result.blocked).toBe(false);
      expect(result.status).toBe("RECOVERED");

      const recoveryCase = await prisma.recoveryCase.findUniqueOrThrow({
        where: { id: result.recoveryCaseId },
      });
      expect(recoveryCase.sourceType).toBe("INVOICE");
      expect(recoveryCase.status).toBe("RECOVERED");
      expect(recoveryCase.recoveredAmount).toBe(120000);

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

    it("blocks via the shared policy engine exactly like the other workflows", async () => {
      const { merchant, customer } = await createFixture({ maxAttempts: 0 });
      const invoice = await createInvoice(merchant.id, customer.id, {
        status: "OVERDUE",
      });

      const result = await runInvoiceOverdueWorkflow(prisma, invoice.id);

      expect(result.blocked).toBe(true);
      expect(result.status).toBe("BLOCKED");

      const attempts = await prisma.recoveryAttempt.findMany({
        where: { recoveryCaseId: result.recoveryCaseId },
      });
      expect(attempts).toHaveLength(0);
    });
  });
});