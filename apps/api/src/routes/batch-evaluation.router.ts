import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  getBatchEvaluationById,
  listBatchEvaluations,
  runBatchEvaluation,
} from "../batch-evaluation/service.js";

export const batchEvaluationRouter = Router();

// -----------------------------------------------------------------
// POST /api/batch-evaluation/run
// -----------------------------------------------------------------
batchEvaluationRouter.post("/batch-evaluation/run", async (_req, res) => {
  try {
    const result = await runBatchEvaluation(prisma);
    res.json({ success: true, batchEvaluation: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

// -----------------------------------------------------------------
// GET /api/batch-evaluation
// -----------------------------------------------------------------
batchEvaluationRouter.get("/batch-evaluation", async (_req, res) => {
  try {
    const batchEvaluations = await listBatchEvaluations(prisma);
    res.json({ success: true, batchEvaluations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

// -----------------------------------------------------------------
// GET /api/batch-evaluation/:id
// -----------------------------------------------------------------
batchEvaluationRouter.get("/batch-evaluation/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const batchEvaluation = await getBatchEvaluationById(prisma, id!);
    if (!batchEvaluation) {
      res.status(404).json({ success: false, error: "BatchEvaluation not found" });
      return;
    }
    res.json({ success: true, batchEvaluation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});
