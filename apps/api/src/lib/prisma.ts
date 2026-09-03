import { PrismaClient } from "@prisma/client";

// Single shared PrismaClient instance, following the same pattern as
// the existing redis.ts singleton. Avoids exhausting DB connections
// under tsx watch's hot-reload in dev.
export const prisma = new PrismaClient();
