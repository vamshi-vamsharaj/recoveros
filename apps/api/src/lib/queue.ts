import { Queue } from "bullmq";
import { redis } from "./redis";

export const recoveryQueue = new Queue("recovery", {
  connection: redis,
});