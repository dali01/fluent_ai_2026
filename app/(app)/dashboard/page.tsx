import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import {
  ArrowRight,
  Building2,
  Contact,
  KanbanSquare,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { LEAD_STAGES } from "@/lib/validation/crm";

export const metadata = { title: "Dashboard" };

const STAGE_LABELS: Record<string, string> = {
  QUOTE_REQUESTED: "Quote requested",
  QUOTED: "Quoted",
  APPROVED: "Approved",
  IN_PRODUCTION: "In production",
  DELIVERED: "Delivered",
  REPEAT: "Repeat",
};

export default async function DashboardPage() {
  const { orgId, orgRole } = await requireOrg();
  const db = tenantDb(orgId);

  const client = await clerkClient();
  const [
    organization,
    contactCount,
    companyCount,
    openLeads,
    activeJobs,
    recentActivity,
  ] = await Promise.all([
    client.organizations.getOrganization({ organizationId: orgId }),
    db.contact.count({ where: { deletedAt: null } }),
    db.company.count({ where: { deletedAt: null } }),
    db.lead.findMany({
      // Kanban stages only (prospects excluded), minus the closed stages
      where: {
        deletedAt: null,
        stage: {
          in: [...LEAD_STAGES],
          notIn: ["DELIVERED", "REPEAT"],
        },
      },
      select: { value: true, stage: true },
    }),
    db.job.count({ where: { deletedAt: null, status: { not: "DONE" } } }),
    db.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { contact: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const pipelineValue = openLeads.reduce(
    (sum, lead) => sum + (lead.value ? Number(lead.value) : 0),
    0,
  );
  const stageCounts = LEAD_STAGES.map((stage) => ({
    stage,
    count: openLeads.filter((l) => l.stage === stage).length,
  })).filter((s) => s.count > 0);

  const stats = [
    {
      label: "Open pipeline",
      value: `${pipelineValue.toLocaleString("sv-SE")} kr`,
      icon: KanbanSquare,
      chip: "bg-chart-1/10 text-chart-1",
      href: "/pipeline",
    },
    {
      label: "Active jobs",
      value: String(activeJobs),
      icon: Printer,
      chip: "bg-chart-2/10 text-chart-2",
      href: "/jobs",
    },
    {
      label: "Contacts",
      value: String(contactCount),
      icon: Contact,
      chip: "bg-chart-4/10 text-chart-4",
      href: "/contacts",
    },
    {
      label: "Companies",
      value: String(companyCount),
      icon: Building2,
      chip: "bg-chart-5/10 text-chart-5",
      href: "/companies",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {organization.name}
          </h1>
          <Badge variant="secondary" className="capitalize">
            {orgRole.replace("org:", "")}
          </Badge>
        </div>
        <Button render={<Link href="/pipeline" />} variant="outline">
          Open pipeline
          <ArrowRight aria-hidden />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="group">
            <Card className="transition-shadow group-hover:shadow-md">
              <CardContent className="flex items-center gap-4">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${stat.chip}`}
                >
                  <stat.icon className="size-5" aria-hidden />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">
                    {stat.label}
                  </span>
                  <span className="font-mono text-xl font-semibold tracking-tight">
                    {stat.value}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline by stage</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {stageCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No open leads.{" "}
                <Link href="/pipeline" className="text-primary hover:underline">
                  Create the first one
                </Link>
                .
              </p>
            ) : (
              stageCounts.map(({ stage, count }) => (
                <div key={stage} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 text-muted-foreground">
                    {STAGE_LABELS[stage]}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.max(8, (count / openLeads.length) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono">{count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing logged yet.
              </p>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="flex flex-col text-sm">
                  <span className="line-clamp-1">{activity.summary}</span>
                  <span className="text-xs text-muted-foreground">
                    {activity.contact
                      ? `${activity.contact.firstName} ${activity.contact.lastName} · `
                      : ""}
                    {activity.createdAt.toLocaleString("sv-SE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
