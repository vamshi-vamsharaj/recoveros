import { Router } from "express";
import express from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { webhookQueue } from "../lib/queue.js";
import { verifyRazorpayWebhookSignature } from "../providers/razorpay/razorpay.client.js";
import { writeAuditLog } from "../audit/audit-logger.js";

export const razorpayWebhookRouter = Router();

/**
 * Flow: raw body capture -> signature verification -> WebhookEvent
 * persistence (idempotent via DB unique constraint) -> queue -> fast
 * 200 response. Domain state changes (recovery pipeline) happen later
 * in workers/webhook.worker.ts, off the HTTP request path.
 *
 * express.raw() is applied per-route (not globally) so this endpoint
 * gets the exact bytes Razorpay signed, while every other route keeps
 * using express.json() unaffected. This route must be mounted in
 * server.ts BEFORE the global express.json() middleware, or Express
 * would consume/parse the body before this handler ever sees it.
 */
razorpayWebhookRouter.post(
  "/razorpay",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.header("x-razorpay-signature");
    const rawBody = req.body as Buffer;

    if (!secret) {
      res.status(500).json({ success: false, error: "RAZORPAY_WEBHOOK_SECRET is not configured" });
      return;
    }

    if (!signature || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      res.status(400).json({ success: false, error: "Missing signature or body" });
      return;
    }

    const isValid = verifyRazorpayWebhookSignature(rawBody, signature, secret);
    if (!isValid) {
      await writeAuditLog(prisma, {
        eventType: "WEBHOOK_SIGNATURE_INVALID",
        actor: "razorpay.webhook",
        metadata: { reason: "signature mismatch" },
      });
      res.status(400).json({ success: false, error: "Invalid webhook signature" });
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ success: false, error: "Malformed JSON body" });
      return;
    }

    const eventType = typeof payload.event === "string" ? payload.event : "unknown";
    const headerEventId = req.header("x-razorpay-event-id");

    // Razorpay's own docs recommend X-Razorpay-Event-Id (unique per
    // event) for idempotency. If a delivery ever lacks that header,
    // fall back to a content hash so identical re-deliveries still
    // collide on the same externalId -- best-effort, not a substitute
    // for the header when Razorpay does send it.
    const externalId =
      headerEventId ?? `sha256:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;

    let webhookEvent;
    try {
      // The DB unique constraint on WebhookEvent.externalId is the
      // real dedup mechanism -- this insert is the idempotency check,
      // not an in-memory findFirst race.
      webhookEvent = await prisma.webhookEvent.create({
        data: {
          source: "razorpay",
          eventType,
          externalId,
          payload: payload as any,
          status: "RECEIVED",
        },
      });
    } catch (err) {
      const isDuplicate =
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002";

      if (isDuplicate) {
        await writeAuditLog(prisma, {
          eventType: "WEBHOOK_DUPLICATE_IGNORED",
          actor: "razorpay.webhook",
          metadata: { externalId, eventType },
        });
        // Acknowledge duplicates as already-handled -- do not requeue
        // or reprocess. This is what keeps a resend from creating a
        // second RecoveryAttempt/RecoveryCase.
        res.status(200).json({ success: true, duplicate: true });
        return;
      }
      throw err;
    }

    await writeAuditLog(prisma, {
      eventType: "WEBHOOK_RECEIVED",
      actor: "razorpay.webhook",
      metadata: { webhookEventId: webhookEvent.id, externalId, eventType },
    });

    // jobId = webhookEvent.id gives BullMQ its own dedup layer on top
    // of the DB unique constraint above.
    await webhookQueue.add(
      "process-razorpay-webhook",
      { webhookEventId: webhookEvent.id },
      { jobId: webhookEvent.id }
    );

    res.status(200).json({ success: true, webhookEventId: webhookEvent.id });
  }
);
