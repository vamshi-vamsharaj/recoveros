import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const recoveryQueue = new Queue("recovery", {
  connection: redis,
});

// Milestone 4 addition: webhook ingestion
export const webhookQueue = new Queue("webhook-events", {
  connection: redis,
});