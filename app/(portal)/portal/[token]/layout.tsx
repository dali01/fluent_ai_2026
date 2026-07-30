import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { resolvePortalToken } from "@/lib/portal/auth";

export const metadata = { title: "Client portal" };

export default async function PortalLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}>) {
  const { token } = await params;
  const portal = await resolvePortalToken(token);
  if (!portal) notFound();

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-muted/30">
      <header className="border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex flex-col">
            <span className="font-heading text-lg font-semibold tracking-tight">
              {portal.orgName}
            </span>
            <span className="text-xs text-muted-foreground">
              Client portal · {portal.company.name}
            </span>
          </div>
          <Logo className="text-sm" markClassName="size-4" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        {children}
      </main>
      <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
        Powered by Fluent AI
      </footer>
    </div>
  );
}
