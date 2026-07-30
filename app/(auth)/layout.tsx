import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="px-6 py-4 md:px-12">
        <Link href="/" aria-label="Fluent AI home">
          <Logo />
        </Link>
      </header>
      {children}
    </div>
  );
}
