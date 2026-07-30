"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Building2,
  Lightbulb,
  CalendarDays,
  Contact,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  Printer,
  Radar,
  Receipt,
  Settings,
  Truck,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const navGroups: Array<{
  label: string | null;
  items: Array<{ href: string; label: string; icon: typeof Contact }>;
}> = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { href: "/contacts", label: "Contacts", icon: Contact },
      { href: "/companies", label: "Companies", icon: Building2 },
      { href: "/prospects", label: "Prospects", icon: Radar },
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
      { href: "/quotes", label: "Quotes", icon: FileText },
      { href: "/insights", label: "Insights", icon: Lightbulb },
    ],
  },
  {
    label: "Production",
    items: [
      { href: "/jobs", label: "Jobs", icon: Printer },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/vendors", label: "Vendors", icon: Truck },
    ],
  },
  {
    label: "Finance",
    items: [{ href: "/invoices", label: "Invoices", icon: Receipt }],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar md:flex md:flex-col">
      <div className="px-5 py-5">
        <Link href="/dashboard" aria-label="Dashboard">
          <Logo />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.label ?? "top"} className="flex flex-col gap-0.5">
            {group.label ? (
              <span className="px-3 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
                {group.label}
              </span>
            ) : null}
            {group.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon
                    className={cn("size-4", active && "text-primary")}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t px-3 py-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
        >
          <Settings className="size-4" aria-hidden />
          Settings
        </Link>
      </div>
    </aside>
  );
}
