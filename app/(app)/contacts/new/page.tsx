import { ContactForm } from "@/components/crm/contact-form";
import { createContact } from "@/lib/actions/contacts";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "New contact" };

export default async function NewContactPage() {
  const { orgId } = await requireOrg();
  const companies = await tenantDb(orgId).company.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New contact</h1>
      <ContactForm
        action={createContact}
        companies={companies}
        submitLabel="Create contact"
      />
    </div>
  );
}
