import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * Prisma client singleton backed by the Neon serverless driver.
 *
 * Lazy: the client (and its DATABASE_URL requirement) is only created on
 * first use, so `next build` succeeds without a database configured.
 *
 * Phase 1 adds the tenant-scoped data-access layer on top of this —
 * application code must go through that layer, never through `db` directly.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}
