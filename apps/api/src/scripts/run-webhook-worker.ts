import "dotenv/config";
import { webhookWorker } from "../workers/webhook.worker.js";


console.log("[run-webhook-worker] Razorpay webhook worker started, listening on queue 'webhook-events'.");

process.on("SIGTERM", async () => {
  await webhookWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await webhookWorker.close();
  process.exit(0);
});
