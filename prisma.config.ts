import "dotenv/config";
import { defineConfig } from "prisma/config";

// The Prisma CLI (migrate/db pull) needs a direct, non-pooled connection.
// Neon convention: DATABASE_URL = pooled (runtime), DIRECT_URL = direct (CLI).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
