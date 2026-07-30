import Link from "next/link";
import { Plus, Users } from "lucide-react";
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

export const metadata = { title: "Contacts" };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { orgId } = await requireOrg();
  const { q, tag } = await searchParams;

  const contacts = await tenantDb(orgId).contact.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <Button render={<Link href="/contacts/new" />}>
          <Plus aria-hidden /> New contact
        </Button>
      </div>

      <form className="flex gap-2" action="/contacts">
        <Input
          name="q"
          placeholder="Search contacts…"
          defaultValue={q}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {tag ? (
          <Button variant="ghost" render={<Link href="/contacts" />}>
            Tag: {tag} ✕
          </Button>
        ) : null}
      </form>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Users className="size-8" aria-hidden />
          <p>No contacts yet. Create the first one.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="font-medium hover:underline"
                  >
                    {contact.firstName} {contact.lastName}
                  </Link>
                  {contact.title ? (
                    <span className="ml-2 text-muted-foreground">
                      {contact.title}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  {contact.company ? (
                    <Link
                      href={`/companies/${contact.company.id}`}
                      className="hover:underline"
                    >
                      {contact.company.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{contact.email ?? "—"}</TableCell>
                <TableCell>{contact.phone ?? "—"}</TableCell>
                <TableCell>
                  <TagList tags={contact.tags} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
