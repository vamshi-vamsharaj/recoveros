import type { AuditEventType, Prisma, PrismaClient } from "@prisma/client";

// Accepts either the shared PrismaClient or a `$transaction` callback's
// transaction client, so callers can write audit entries inside the
// same DB transaction as the state change they describe.
type PrismaLike = PrismaClient | Prisma.TransactionClient;

export interface AuditEntryInput {
  recoveryCaseId?: string;
  eventType: AuditEventType;
  actor: string;
  metadata: Record<string, unknown>;
}

export async function writeAuditLog(
  db: PrismaLike,
  entry: AuditEntryInput
): Promise<void> {
  await db.auditLog.create({
    data: {
      recoveryCaseId: entry.recoveryCaseId,
      eventType: entry.eventType,
      actor: entry.actor,
      metadata: entry.metadata as Prisma.InputJsonValue,
    },
  });
}
