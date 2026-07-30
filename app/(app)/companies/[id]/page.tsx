import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { ArchiveButton } from "@/components/crm/archive-button";
import { TagList } from "@/components/crm/tag-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { archiveCompany } from "@/lib/actions/companies";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Company" };

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrg();
  const { id } = await params;

  const company = await tenantDb(orgId).company.findUnique({
    where: { id },
    include: {
      priceTier: true,
      contacts: { where: { deletedAt: null }, orderBy: { lastName: "asc" } },
    },
  });
  if (!company || company.deletedAt) notFound();

  const info: Array<[string, string | null]> = [
    ["Email", company.email],
    ["Phone", company.phone],
    ["Website", company.website],
    ["City", company.city],
    ["Country", company.country],
    ["Price tier", company.priceTier?.name ?? null],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {company.name}
          </h1>
          {company.isReseller ? (
            <Badge variant="secondary">Reseller</Badge>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href={`/companies/${company.id}/edit`} />}
          >
            <Pencil aria-hidden /> Edit
          </Button>
          <ArchiveButton
            action={archiveCompany.bind(null, company.id)}
            entityLabel={`company "${company.name}"`}
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
              <div key={label} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <span>{value || "—"}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tags</span>
              <TagList tags={company.tags} />
            </div>
            {company.notes ? (
              <p className="mt-2 whitespace-pre-wrap border-t pt-2">
                {company.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contacts ({company.contacts.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {company.contacts.length === 0 ? (
              <p className="text-muted-foreground">No contacts yet.</p>
            ) : (
              company.contacts.map((contact) => (
                <div key={contact.id} className="flex justify-between gap-4">
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="font-medium hover:underline"
                  >
                    {contact.firstName} {contact.lastName}
                  </Link>
                  <span className="text-muted-foreground">
                    {contact.title ?? contact.email ?? ""}
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
