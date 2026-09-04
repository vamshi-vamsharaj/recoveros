import "dotenv/config";
import { webhookWorker } from "../workers/webhook.worker.js";

// Importing webhook.worker.ts is what actually starts the Worker
// (BullMQ Workers begin polling their queue on construction). This
// script exists so the worker can run as its own process, separate
// from the HTTP server -- run alongside `npm run dev`:
//
//   npm run worker:webhook
console.log("[run-webhook-worker] Razorpay webhook worker started, listening on queue 'webhook-events'.");

process.on("SIGTERM", async () => {
  await webhookWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await webhookWorker.close();
  process.exit(0);
});
