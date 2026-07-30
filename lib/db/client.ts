import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client singleton.
 *
 * Adapter is picked from the connection string: localhost/127.0.0.1 uses
 * the node-postgres driver (local dev/CI containers), anything else uses
 * the Neon serverless driver (production on Vercel).
 *
 * Lazy: the client (and its DATABASE_URL requirement) is only created on
 * first use, so `next build` succeeds without a database configured.
 *
 * Feature code must go through the tenant-scoped layer in lib/db/tenant.ts,
 * never through `getDb()` directly.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function isLocalUrl(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = isLocalUrl(connectionString)
    ? new PrismaPg({ connectionString })
    : new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}
