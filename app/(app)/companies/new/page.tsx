import { CompanyForm } from "@/components/crm/company-form";
import { createCompany } from "@/lib/actions/companies";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "New company" };

export default async function NewCompanyPage() {
  const { orgId } = await requireOrg();
  const priceTiers = await tenantDb(orgId).priceTier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New company</h1>
      <CompanyForm
        action={createCompany}
        priceTiers={priceTiers}
        submitLabel="Create company"
      />
    </div>
  );
}
