import { Router } from "express";
import { RecoveryCaseStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { approveRecoveryCase, rejectRecoveryCase } from "../engine/approval-service.js";

/**
 * Milestone 6 addition. Every route here is read-only or (for
 * approve/reject) calls straight into approval-service.ts, which
 * itself only reuses the existing orchestrator's execution path (see
 * engine/recovery.orchestrator.ts). No route in this file writes to
 * the database directly except via that shared service -- this file
 * has no engine/policy/workflow logic of its own.
 *
 * There is exactly one Merchant seeded in this project (see
 * scripts/seed.ts), and no auth/session layer exists yet anywhere in
 * the codebase, so these routes operate merchant-wide rather than
 * scoping to a merchantId derived from a request. Scoping to a real
 * merchant/session is a pre-existing gap in the whole API, not
 * something this milestone introduces or should silently paper over.
 */
export const dashboardRouter = Router();

// Built from the generated RecoveryCaseStatus enum rather than raw
// string literals: if the Prisma Client running this file is ever
// out of sync with schema.prisma (e.g. `prisma generate` ran before
// a migration added PENDING_APPROVAL/REJECTED), this fails to
// *compile* instead of throwing a runtime "Invalid value for
// argument `in`" error from inside a live request.
const ACTIVE_STATUSES = [
  RecoveryCaseStatus.DETECTED,
  RecoveryCaseStatus.RECOMMENDED,
  RecoveryCaseStatus.PENDING_APPROVAL,
  RecoveryCaseStatus.APPROVED,
  RecoveryCaseStatus.EXECUTING,
];

const TERMINAL_STATUSES = [
  RecoveryCaseStatus.RECOVERED,
  RecoveryCaseStatus.BLOCKED,
  RecoveryCaseStatus.REJECTED,
  RecoveryCaseStatus.FAILED,
];

// -----------------------------------------------------------------
// GET /api/dashboard
// -----------------------------------------------------------------
dashboardRouter.get("/dashboard", async (_req, res) => {
  try {
    const [atRisk, recovered, activeCount, terminalCounts, statusCounts, sourceGroups, trendRows, recentActivity] =
      await Promise.all([
        prisma.recoveryCase.aggregate({
          _sum: { amount: true },
          where: { status: { notIn: [RecoveryCaseStatus.RECOVERED] } },
        }),
        prisma.recoveryCase.aggregate({
          _sum: { recoveredAmount: true },
          where: { status: RecoveryCaseStatus.RECOVERED },
        }),
        prisma.recoveryCase.count({
          where: { status: { in: ACTIVE_STATUSES } },
        }),
        prisma.recoveryCase.count({
          where: { status: { in: TERMINAL_STATUSES } },
        }),
        prisma.recoveryCase.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.recoveryCase.groupBy({
          by: ["sourceType"],
          _count: { _all: true },
          _sum: { amount: true, recoveredAmount: true },
        }),
        // Last 14 days of case creation, for the trend chart.
        prisma.$queryRaw<{ day: Date; created: bigint; recovered: bigint }[]>`
          SELECT
            date_trunc('day', "createdAt") AS day,
            COUNT(*) AS created,
            COUNT(*) FILTER (WHERE "status" = 'RECOVERED') AS recovered
          FROM "RecoveryCase"
          WHERE "createdAt" >= NOW() - INTERVAL '14 days'
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        prisma.auditLog.findMany({
          take: 12,
          orderBy: { createdAt: "desc" },
          include: {
            recoveryCase: {
              select: { id: true, sourceType: true, amount: true, currency: true, customer: { select: { name: true } } },
            },
          },
        }),
      ]);

    const recoveredCount =
      statusCounts.find((s: { status: string }) => s.status === "RECOVERED")?._count._all ?? 0;
    const resolvedCount = terminalCounts;
    const successRate = resolvedCount > 0 ? recoveredCount / resolvedCount : null;

    res.json({
      metrics: {
        revenueAtRisk: atRisk._sum.amount ?? 0,
        revenueRecovered: recovered._sum.recoveredAmount ?? 0,
        activeCases: activeCount,
        successRate,
      },
      statusOverview: statusCounts.map((row: { status: string; _count: { _all: number } }) => ({
        status: row.status,
        count: row._count._all,
      })),
      workflowBreakdown: sourceGroups.map(
        (row: {
          sourceType: string;
          _count: { _all: number };
          _sum: { amount: number | null; recoveredAmount: number | null };
        }) => ({
          sourceType: row.sourceType,
          cases: row._count._all,
          amount: row._sum.amount ?? 0,
          recoveredAmount: row._sum.recoveredAmount ?? 0,
        })
      ),
      trend: trendRows.map((row: { day: Date; created: bigint; recovered: bigint }) => ({
        date: row.day,
        casesCreated: Number(row.created),
        casesRecovered: Number(row.recovered),
      })),
      recentActivity: recentActivity.map(
        (log: {
          id: string;
          eventType: string;
          actor: string;
          createdAt: Date;
          metadata: unknown;
          recoveryCase: {
            id: string;
            sourceType: string;
            amount: number;
            currency: string;
            customer: { name: string } | null;
          } | null;
        }) => ({
          id: log.id,
          eventType: log.eventType,
          actor: log.actor,
          createdAt: log.createdAt,
          recoveryCaseId: log.recoveryCase?.id ?? null,
          customerName: log.recoveryCase?.customer?.name ?? null,
          sourceType: log.recoveryCase?.sourceType ?? null,
          amount: log.recoveryCase?.amount ?? null,
          currency: log.recoveryCase?.currency ?? null,
        })
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

// -----------------------------------------------------------------
// GET /api/recovery/cases
// -----------------------------------------------------------------
dashboardRouter.get("/recovery/cases", async (req, res) => {
  try {
    const { status, sourceType, q } = req.query as {
      status?: string;
      sourceType?: string;
      q?: string;
    };

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (sourceType) where.sourceType = sourceType;
    if (q) {
      where.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
      ];
    }

    const cases = await prisma.recoveryCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        customer: { select: { name: true, email: true } },
        decisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { strategy: true, confidence: true, reason: true },
        },
      },
    });

    res.json({
      cases: cases.map(
        (c: (typeof cases)[number]) => ({
          id: c.id,
          customerName: c.customer.name,
          customerEmail: c.customer.email,
          sourceType: c.sourceType,
          status: c.status,
          amount: c.amount,
          currency: c.currency,
          recoveredAmount: c.recoveredAmount,
          strategy: c.decisions[0]?.strategy ?? null,
          confidence: c.decisions[0]?.confidence ?? null,
          createdAt: c.createdAt,
        })
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

// -----------------------------------------------------------------
// GET /api/recovery/cases/:id
// -----------------------------------------------------------------
dashboardRouter.get("/recovery/cases/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const recoveryCase = await prisma.recoveryCase.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, email: true } },
        payment: { select: { failureReason: true } },
        decisions: {
          orderBy: { createdAt: "desc" },
          include: { policyEvaluation: true },
        },
        attempts: { orderBy: { createdAt: "desc" } },
        auditLogs: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!recoveryCase) {
      res.status(404).json({ success: false, error: "RecoveryCase not found" });
      return;
    }

    res.json({
      case: {
        id: recoveryCase.id,
        status: recoveryCase.status,
        sourceType: recoveryCase.sourceType,
        amount: recoveryCase.amount,
        currency: recoveryCase.currency,
        recoveredAmount: recoveryCase.recoveredAmount,
        failureReason: recoveryCase.payment?.failureReason ?? null,
        createdAt: recoveryCase.createdAt,
        updatedAt: recoveryCase.updatedAt,
        customer: recoveryCase.customer,
      },
      decisions: recoveryCase.decisions.map((d: (typeof recoveryCase.decisions)[number]) => ({
        id: d.id,
        strategy: d.strategy,
        reason: d.reason,
        confidence: d.confidence,
        providerName: d.providerName,
        createdAt: d.createdAt,
        policyEvaluation: d.policyEvaluation
          ? {
              result: d.policyEvaluation.result,
              reason: d.policyEvaluation.reason,
              createdAt: d.policyEvaluation.createdAt,
            }
          : null,
      })),
      attempts: recoveryCase.attempts.map((a: (typeof recoveryCase.attempts)[number]) => ({
        id: a.id,
        status: a.status,
        adapterName: a.adapterName,
        recoveredAmount: a.recoveredAmount,
        providerReference: a.providerReference,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
      timeline: recoveryCase.auditLogs.map((log: (typeof recoveryCase.auditLogs)[number]) => ({
        id: log.id,
        eventType: log.eventType,
        actor: log.actor,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

// -----------------------------------------------------------------
// POST /api/recovery/cases/:id/approve
// -----------------------------------------------------------------
dashboardRouter.post("/recovery/cases/:id/approve", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await approveRecoveryCase(prisma, id!);
    res.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ success: false, error: message });
  }
});

// -----------------------------------------------------------------
// POST /api/recovery/cases/:id/reject
// -----------------------------------------------------------------
dashboardRouter.post("/recovery/cases/:id/reject", async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body ?? {};
  try {
    const result = await rejectRecoveryCase(prisma, id!, typeof reason === "string" ? reason : undefined);
    res.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ success: false, error: message });
  }
});
