import { notFound } from "next/navigation";
import { ContactForm } from "@/components/crm/contact-form";
import { updateContact } from "@/lib/actions/contacts";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Edit contact" };

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrg();
  const { id } = await params;

  const db = tenantDb(orgId);
  const [contact, companies] = await Promise.all([
    db.contact.findUnique({ where: { id } }),
    db.company.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!contact || contact.deletedAt) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Edit {contact.firstName} {contact.lastName}
      </h1>
      <ContactForm
        action={updateContact.bind(null, contact.id)}
        initial={{
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          title: contact.title ?? "",
          companyId: contact.companyId ?? "",
          notes: contact.notes ?? "",
          tags: contact.tags,
        }}
        companies={companies}
        submitLabel="Save changes"
      />
    </div>
  );
}
