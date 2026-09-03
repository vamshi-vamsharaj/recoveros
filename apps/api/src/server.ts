import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";
import { workflowRegistry } from "./workflows/registry.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "recoveros-api",
  });
});

// Runs the complete payment-degradation recovery pipeline against a
// seeded FAILED payment: detection -> decision -> policy evaluation
// -> approval gate -> simulated execution -> verification.
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