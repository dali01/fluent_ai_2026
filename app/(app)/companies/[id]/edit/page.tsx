import { notFound } from "next/navigation";
import { CompanyForm } from "@/components/crm/company-form";
import { updateCompany } from "@/lib/actions/companies";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Edit company" };

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrg();
  const { id } = await params;

  const db = tenantDb(orgId);
  const [company, priceTiers] = await Promise.all([
    db.company.findUnique({ where: { id } }),
    db.priceTier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!company || company.deletedAt) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Edit {company.name}
      </h1>
      <CompanyForm
        action={updateCompany.bind(null, company.id)}
        initial={{
          name: company.name,
          email: company.email ?? "",
          phone: company.phone ?? "",
          website: company.website ?? "",
          city: company.city ?? "",
          country: company.country ?? "",
          isReseller: company.isReseller,
          priceTierId: company.priceTierId ?? "",
          notes: company.notes ?? "",
          tags: company.tags,
        }}
        priceTiers={priceTiers}
        submitLabel="Save changes"
      />
    </div>
  );
}
