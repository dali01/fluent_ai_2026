/**
 * Enable prospecting for one org, against the DB in NEON_DATABASE_URL
 * (falls back to DATABASE_URL for local runs).
 *
 *   pnpm exec tsx scripts/enable-prospecting.ts <orgId>
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

if (process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
  process.env.DIRECT_URL = process.env.NEON_DATABASE_URL;
}

async function main() {
  const orgId = process.argv[2];
  if (!orgId) throw new Error("usage: enable-prospecting.ts <orgId>");

  const { readProspectingConfig, writeProspectingConfig } = await import(
    "@/lib/db/org-settings"
  );
  const config = await readProspectingConfig(orgId);
  await writeProspectingConfig(orgId, { ...config, enabled: true });
  console.log(`prospecting enabled for ${orgId}:`, {
    ...(await readProspectingConfig(orgId)),
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
