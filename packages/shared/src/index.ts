import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.string(),
  service: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;