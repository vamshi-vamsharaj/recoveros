import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Integration test for the actual dedup mechanism: the DB unique
 * constraint on WebhookEvent.externalId (see prisma/schema.prisma and
 * webhooks/razorpay.webhook.ts). This intentionally does NOT go
 * through the HTTP route or signature verification -- it isolates and
 * proves the one thing that matters for "duplicate delivery must not
 * create duplicate recovery actions": that a second insert with the
 * same externalId is rejected at the database level, not just caught
 * by an in-memory check that a second server instance wouldn't share.
 *
 * REQUIRES a real PostgreSQL database reachable via DATABASE_URL, with
 * the Milestone 3/4 schema changes (WebhookEvent.externalId,
 * RecoveryAttempt.providerReference/providerMetadata, new
 * AuditEventType values) migrated in.
 *
 * NOT RUN in the environment this was written in -- no network egress
 * to reach a Postgres instance or to run `prisma migrate dev` /
 * `prisma generate` against the real schema (see PROJECT_STATUS.md,
 * "Known limitations", both the pre-existing Milestone 2 entry and the
 * Milestone 3/4 addition). Run with:
 *
 *   npx prisma migrate dev --name add_gemini_razorpay_fields
 *   npm run test -- razorpay-webhook-dedup
 */
const prisma = new PrismaClient();

const TEST_EXTERNAL_ID = "evt_dedup_test_only_do_not_reuse";

describe("WebhookEvent dedup (integration, requires Postgres)", () => {
  beforeAll(async () => {
    await prisma.webhookEvent.deleteMany({ where: { externalId: TEST_EXTERNAL_ID } });
  });

  afterAll(async () => {
    await prisma.webhookEvent.deleteMany({ where: { externalId: TEST_EXTERNAL_ID } });
    await prisma.$disconnect();
  });

  it("accepts the first delivery of an event", async () => {
    const first = await prisma.webhookEvent.create({
      data: {
        source: "razorpay",
        eventType: "payment_link.paid",
        externalId: TEST_EXTERNAL_ID,
        payload: { event: "payment_link.paid" },
        status: "RECEIVED",
      },
    });

    expect(first.externalId).toBe(TEST_EXTERNAL_ID);
  });

  it("rejects a duplicate delivery of the same event with a unique-constraint error", async () => {
    // Same externalId as the row created above -- simulates Razorpay
    // redelivering the same webhook.
    await expect(
      prisma.webhookEvent.create({
        data: {
          source: "razorpay",
          eventType: "payment_link.paid",
          externalId: TEST_EXTERNAL_ID,
          payload: { event: "payment_link.paid" },
          status: "RECEIVED",
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    // Exactly one row exists -- the duplicate was rejected, not
    // silently accepted as a second WebhookEvent.
    const rows = await prisma.webhookEvent.findMany({
      where: { externalId: TEST_EXTERNAL_ID },
    });
    expect(rows).toHaveLength(1);
  });
});
