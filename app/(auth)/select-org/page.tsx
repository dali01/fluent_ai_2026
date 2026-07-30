import { OrganizationList } from "@clerk/nextjs";

// Every workspace in Fluent AI is org-scoped: users must act inside an
// organization (their print business), never in a personal context.
export default function SelectOrgPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose your print business
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select an organization to continue, or create one for your shop.
        </p>
      </div>
      <OrganizationList
        hidePersonal
        afterSelectOrganizationUrl="/dashboard"
        afterCreateOrganizationUrl="/dashboard"
      />
    </div>
  );
}
