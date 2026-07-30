import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Match Next.js env-file behavior: .env.local wins over .env.
loadEnv({ path: [".env.local", ".env"] });

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
