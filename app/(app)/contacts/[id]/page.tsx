import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Calendar,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  StickyNote,
  Zap,
} from "lucide-react";
import { ArchiveButton } from "@/components/crm/archive-button";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { PortalLinkButton } from "@/components/crm/portal-link-button";
import { TagList } from "@/components/crm/tag-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { archiveContact } from "@/lib/actions/contacts";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Contact" };

const ACTIVITY_ICONS: Record<string, typeof Mail> = {
  EMAIL: Mail,
  SMS: MessageSquare,
  CALL: Phone,
  MEETING: Calendar,
  NOTE: StickyNote,
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrg();
  const { id } = await params;

  const db = tenantDb(orgId);
  const contact = await db.contact.findUnique({
    where: { id },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!contact || contact.deletedAt) notFound();

  const activities = await db.activityLog.findMany({
    where: { contactId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const info: Array<[string, React.ReactNode]> = [
    ["Email", contact.email || "—"],
    ["Phone", contact.phone || "—"],
    ["Title", contact.title || "—"],
    [
      "Company",
      contact.company ? (
        <Link
          key="c"
          href={`/companies/${contact.company.id}`}
          className="hover:underline"
        >
          {contact.company.name}
        </Link>
      ) : (
        "—"
      ),
    ],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {contact.firstName} {contact.lastName}
        </h1>
        <div className="flex gap-2">
          <PortalLinkButton contactId={contact.id} />
          <Button
            variant="outline"
            render={<Link href={`/contacts/${contact.id}/edit`} />}
          >
            <Pencil aria-hidden /> Edit
          </Button>
          <ArchiveButton
            action={archiveContact.bind(null, contact.id)}
            entityLabel={`contact "${contact.firstName} ${contact.lastName}"`}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {info.map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <span>{value}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tags</span>
              <TagList tags={contact.tags} />
            </div>
            {contact.notes ? (
              <p className="mt-2 whitespace-pre-wrap border-t pt-2">
                {contact.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Communication log</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <LogActivityForm contactId={contact.id} />
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing logged yet.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {activities.map((activity) => {
                  const Icon = ACTIVITY_ICONS[activity.type] ?? Zap;
                  return (
                    <li key={activity.id} className="flex gap-3 text-sm">
                      <Icon
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="flex flex-col">
                        <span>{activity.summary}</span>
                        <span className="text-xs text-muted-foreground">
                          {activity.type} ·{" "}
                          {activity.createdAt.toLocaleString("sv-SE", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
