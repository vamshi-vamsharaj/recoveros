import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";
import { workflowRegistry } from "./workflows/registry.js";
import { razorpayWebhookRouter } from "./webhooks/razorpay.webhook.js";
import { dashboardRouter } from "./routes/recovery-dashboard.router.js";
import { batchEvaluationRouter } from "./routes/batch-evaluation.router.js";

const app = express();

app.use(cors());

// Mounted BEFORE express.json(): Razorpay webhook signature
// verification needs the exact raw request body. If this route were
// registered after the global json() middleware below, Express would
// have already parsed (and consumed) the body, and the signature
// check would fail against re-serialized JSON that no longer matches
// what Razorpay actually signed.
app.use("/api/webhooks", razorpayWebhookRouter);

app.use(express.json());

// Milestone 6: read-only dashboard/case-list/case-detail routes plus
// human approve/reject actions. See routes/recovery-dashboard.router.ts.
app.use("/api", dashboardRouter);

// Milestone 8: synthetic batch evaluation across all six workflows,
// compared against a deterministic baseline. See
// batch-evaluation/service.ts.
app.use("/api", batchEvaluationRouter);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "recoveros-api",
  });
});

// Runs the complete payment-degradation recovery pipeline against a
// seeded FAILED payment: detection -> decision -> policy evaluation
// -> approval gate -> execution -> verification. Which decision
// provider / adapter actually run depends on environment configuration
// (see workflows/payment-degradation.handler.ts) -- this route itself
// is unchanged from Milestone 2.
app.post("/api/recovery/payment/:paymentId/run", async (req, res) => {
  const { paymentId } = req.params;

  if (!paymentId) {
    res.status(400).json({ success: false, error: "paymentId is required" });
    return;
  }

  const workflow = workflowRegistry["payment-degradation"];
  if (!workflow) {
    res
      .status(500)
      .json({ success: false, error: "payment-degradation workflow is not registered" });
    return;
  }

  try {
    const result = await workflow(prisma, { entityId: paymentId });

    res.json({
      success: true,
      recoveryCaseId: result.recoveryCaseId,
      status: result.status,
      ...(result.blocked ? { blockedReason: result.blockedReason } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ success: false, error: message });
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`RecoverOS API running on port ${PORT}`);
});