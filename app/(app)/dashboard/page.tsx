import { clerkClient } from "@clerk/nextjs/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireOrg } from "@/lib/auth/require-org";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { orgId, orgRole } = await requireOrg();

  const client = await clerkClient();
  const organization = await client.organizations.getOrganization({
    organizationId: orgId,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {organization.name}
        </h1>
        <Badge variant="secondary">{orgRole.replace("org:", "")}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>
              Leads and opportunities land here in Phase 2.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Production</CardTitle>
            <CardDescription>
              Jobs and the production board arrive in Phase 3.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quotes</CardTitle>
            <CardDescription>
              Quoting and pricing arrive in Phase 4.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
