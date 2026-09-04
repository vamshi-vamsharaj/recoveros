import { Worker, type Job } from "bullmq";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { verifyOutcome } from "../engine/verification.service.js";
import { writeAuditLog } from "../audit/audit-logger.js";

interface WebhookJobData {
  webhookEventId: string;
}

/**
 * Consumes jobs queued by webhooks/razorpay.webhook.ts. This is the
 * only place a Razorpay webhook is actually allowed to change domain
 * state -- the HTTP handler only verifies, persists, and queues.
 *
 * Only two Razorpay events are acted on for the RETRY_PAYMENT_LINK /
 * PAYMENT_LINK strategy this milestone implements:
 *   - payment_link.paid                -> RecoveryAttempt RECOVERED
 *   - payment_link.expired / cancelled -> RecoveryAttempt FAILED
 * Any other event type is acknowledged (marked PROCESSED) but causes
 * no state change -- there is nothing in this codebase yet that acts
 * on payment.captured, order.paid, etc. directly (those are the
 * *original* payment's events, not this recovery action's).
 */
async function processWebhookEvent(job: Job<WebhookJobData>) {
  const webhookEvent = await prisma.webhookEvent.findUnique({
    where: { id: job.data.webhookEventId },
  });

  if (!webhookEvent) {
    console.error(`[webhook.worker] WebhookEvent ${job.data.webhookEventId} not found`);
    return;
  }

  if (webhookEvent.status === "PROCESSED") {
    // Extra idempotency layer beyond ingestion-side dedup, in case a
    // job is redelivered by BullMQ itself (e.g. after a crash before ack).
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = webhookEvent.payload as any;
  let recoveryCaseId: string | undefined;

  try {
    switch (webhookEvent.eventType) {
      case "payment_link.paid": {
        const linkId = payload?.payload?.payment_link?.entity?.id as string | undefined;
        const paidAmount = payload?.payload?.payment?.entity?.amount as number | undefined;

        if (linkId) {
          const attempt = await prisma.recoveryAttempt.findFirst({
            where: { providerReference: linkId },
            orderBy: { createdAt: "desc" },
          });

          if (attempt) {
            recoveryCaseId = attempt.recoveryCaseId;
            await verifyOutcome(prisma, attempt, {
              status: "RECOVERED",
              recoveredAmount: paidAmount ?? null,
              adapterName: "RazorpayAdapter",
            });
          } else {
            console.error(
              `[webhook.worker] payment_link.paid for ${linkId} but no matching RecoveryAttempt.providerReference was found`
            );
          }
        }
        break;
      }

      case "payment_link.expired":
      case "payment_link.cancelled": {
        const linkId = payload?.payload?.payment_link?.entity?.id as string | undefined;

        if (linkId) {
          const attempt = await prisma.recoveryAttempt.findFirst({
            where: { providerReference: linkId },
            orderBy: { createdAt: "desc" },
          });

          if (attempt) {
            recoveryCaseId = attempt.recoveryCaseId;
            await verifyOutcome(prisma, attempt, {
              status: "FAILED",
              recoveredAmount: null,
              adapterName: "RazorpayAdapter",
            });
          }
        }
        break;
      }

      default:
        // Acknowledged, no domain action for this event type yet.
        break;
    }

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    await writeAuditLog(prisma, {
      recoveryCaseId,
      eventType: "WEBHOOK_PROCESSED",
      actor: "webhook.worker",
      metadata: { webhookEventId: webhookEvent.id, eventType: webhookEvent.eventType },
    });
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "FAILED" },
    });
    // Re-throw so BullMQ records the job as failed and can retry per
    // the queue's configured retry policy.
    throw err;
  }
}

export const webhookWorker = new Worker<WebhookJobData>("webhook-events", processWebhookEvent, {
  connection: redis,
});

webhookWorker.on("failed", (job, err) => {
  console.error(`[webhook.worker] Job ${job?.id} failed:`, err);
});
