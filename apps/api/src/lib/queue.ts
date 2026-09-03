import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const recoveryQueue = new Queue("recovery", {
  connection: redis,
});