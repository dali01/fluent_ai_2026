import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TagList } from "@/components/crm/tag-list";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { orgId } = await requireOrg();
  const { q, tag } = await searchParams;

  const companies = await tenantDb(orgId).company.findMany({
    where: {
      deletedAt: null,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    include: {
      priceTier: true,
      _count: { select: { contacts: { where: { deletedAt: null } } } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
        <Button render={<Link href="/companies/new" />}>
          <Plus aria-hidden /> New company
        </Button>
      </div>

      <form className="flex gap-2" action="/companies">
        <Input
          name="q"
          placeholder="Search companies…"
          defaultValue={q}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {tag ? (
          <Button variant="ghost" render={<Link href="/companies" />}>
            Tag: {tag} ✕
          </Button>
        ) : null}
      </form>

      {companies.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Building2 className="size-8" aria-hidden />
          <p>No companies yet. Create the first one.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Contacts</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Tier</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <Link
                    href={`/companies/${company.id}`}
                    className="font-medium hover:underline"
                  >
                    {company.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {company.isReseller ? (
                    <Badge variant="secondary">Reseller</Badge>
                  ) : (
                    <span className="text-muted-foreground">Client</span>
                  )}
                </TableCell>
                <TableCell>{company.city ?? "—"}</TableCell>
                <TableCell>{company._count.contacts}</TableCell>
                <TableCell>
                  <TagList tags={company.tags} />
                </TableCell>
                <TableCell>{company.priceTier?.name ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
