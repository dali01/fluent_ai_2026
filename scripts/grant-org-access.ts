/**
 * Dev/demo helper: make sure a user is an admin member of every Clerk
 * organization, and that a "Demo Print Co" organization exists (the
 * seeded demo data needs a real Clerk org to be reachable from the UI).
 *
 *   pnpm exec tsx scripts/grant-org-access.ts <email>
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import { createClerkClient } from "@clerk/nextjs/server";

const DEMO_ORG_NAME = "Demo Print Co";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: grant-org-access.ts <email>");

  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
  });

  const users = await clerk.users.getUserList({ emailAddress: [email] });
  const user = users.data[0];
  if (!user) throw new Error(`No Clerk user with email ${email}`);
  console.log(`user: ${user.id} (${email})`);

  const orgs = await clerk.organizations.getOrganizationList({ limit: 50 });
  let demoOrg = orgs.data.find((o) => o.name === DEMO_ORG_NAME);
  if (!demoOrg) {
    demoOrg = await clerk.organizations.createOrganization({
      name: DEMO_ORG_NAME,
      createdBy: user.id,
    });
    console.log(`created org: ${demoOrg.id} (${DEMO_ORG_NAME})`);
  }

  const allOrgs = demoOrg && !orgs.data.some((o) => o.id === demoOrg.id)
    ? [...orgs.data, demoOrg]
    : orgs.data;

  for (const orgItem of allOrgs) {
    const memberships =
      await clerk.organizations.getOrganizationMembershipList({
        organizationId: orgItem.id,
        limit: 100,
      });
    const existing = memberships.data.find(
      (m) => m.publicUserData?.userId === user.id,
    );
    if (existing) {
      console.log(`${orgItem.name}: already ${existing.role}`);
      continue;
    }
    await clerk.organizations.createOrganizationMembership({
      organizationId: orgItem.id,
      userId: user.id,
      role: "org:admin",
    });
    console.log(`${orgItem.name}: added as org:admin`);
  }

  console.log(`Demo org id (for SEED_ORG_ID): ${demoOrg.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
