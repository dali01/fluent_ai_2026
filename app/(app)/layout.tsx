import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { AppSidebar } from "@/components/app-sidebar";
import { requireOrg } from "@/lib/auth/require-org";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireOrg();

  return (
    <div className="flex min-h-svh flex-1">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/80 px-4 py-3 backdrop-blur-md md:px-8">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
          />
          <UserButton />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
