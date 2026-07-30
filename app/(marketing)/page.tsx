import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  ArrowRight,
  CheckCircle2,
  Printer,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Workflow,
    chip: "bg-chart-1/10 text-chart-1",
    title: "Run the whole shop",
    description:
      "Contacts, quotes, jobs, proofs, presses and invoices — one pipeline from first enquiry to delivered reorder.",
  },
  {
    icon: Printer,
    chip: "bg-chart-2/10 text-chart-2",
    title: "Built for print",
    description:
      "Stock, colour modes, bleed, finishing, press scheduling. Not a generic CRM with print bolted on.",
  },
  {
    icon: Sparkles,
    chip: "bg-chart-4/10 text-chart-4",
    title: "AI where it counts",
    description:
      "Prepress checks in plain English, reorder scoring, drafted outreach — reviewed by you, never auto-sent.",
  },
];

const mockColumns = [
  {
    title: "Quoted",
    cards: [
      {
        title: "Coffee bag labels",
        meta: "Nordic Roasters",
        value: "18 500 kr",
        dot: "bg-chart-1",
      },
      {
        title: "Rebrand collateral",
        meta: "Brandhouse",
        value: "64 000 kr",
        dot: "bg-chart-2",
      },
    ],
  },
  {
    title: "In production",
    cards: [
      {
        title: "Festival signage",
        meta: "City Festival AB",
        value: "92 000 kr",
        dot: "bg-chart-3",
      },
    ],
  },
  {
    title: "Delivered",
    cards: [
      {
        title: "Menu reprint",
        meta: "Bistro Norr",
        value: "12 400 kr",
        dot: "bg-chart-5",
      },
    ],
  },
];

export default async function LandingPage() {
  // A signed-in user has no business on the pitch page — this also
  // rescues sessions stranded here by a missing post-sign-in redirect.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
          <Logo />
          <nav className="flex items-center gap-1.5">
            <Button variant="ghost" render={<Link href="/sign-in" />}>
              Sign in
            </Button>
            <Button render={<Link href="/sign-up" />}>
              Get started
              <ArrowRight aria-hidden />
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-130 max-w-4xl opacity-25 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side at 30% 45%, oklch(0.7 0.13 220), transparent 70%)," +
                "radial-gradient(closest-side at 70% 45%, oklch(0.62 0.21 350), transparent 70%)," +
                "radial-gradient(closest-side at 50% 80%, oklch(0.83 0.14 90), transparent 70%)",
            }}
          />
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-6 pt-20 pb-16 text-center md:pt-28">
            <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-2/60" />
                <span className="relative inline-flex size-2 rounded-full bg-chart-2" />
              </span>
              Now in early access
            </Badge>
            <h1 className="max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
              The CRM your print shop
              <span className="text-primary"> actually wants</span>
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              Client acquisition, quoting, production and invoicing in one clean
              workspace — with AI woven through the parts that used to eat your
              day.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" render={<Link href="/sign-up" />}>
                Start free
                <ArrowRight aria-hidden />
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<Link href="/sign-in" />}
              >
                Live demo
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {[
                "Multi-tenant from day one",
                "CMYK-native job specs",
                "No credit card required",
              ].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-chart-5" aria-hidden />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Product mock */}
          <div className="mx-auto w-full max-w-5xl px-6 pb-20">
            <div className="rounded-2xl border bg-linear-to-b from-border/60 to-transparent p-px shadow-lg shadow-primary/5">
              <div className="rounded-2xl bg-card">
                <div className="flex items-center gap-1.5 border-b px-4 py-3">
                  <span className="size-2.5 rounded-full bg-chart-2/40" />
                  <span className="size-2.5 rounded-full bg-chart-3/40" />
                  <span className="size-2.5 rounded-full bg-chart-5/40" />
                  <span className="ml-3 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    fluent.ai / pipeline
                  </span>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-3">
                  {mockColumns.map((column) => (
                    <div
                      key={column.title}
                      className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3"
                    >
                      <span className="px-1 text-xs font-medium text-muted-foreground">
                        {column.title}
                      </span>
                      {column.cards.map((card) => (
                        <div
                          key={card.title}
                          className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-left shadow-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2 rounded-full ${card.dot}`}
                            />
                            <span className="text-sm font-medium">
                              {card.title}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{card.meta}</span>
                            <span className="font-mono">{card.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 md:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="flex flex-col gap-3">
                <span
                  className={`flex size-10 items-center justify-center rounded-lg ${feature.chip}`}
                >
                  <feature.icon className="size-5" aria-hidden />
                </span>
                <h2 className="text-lg font-semibold tracking-tight">
                  {feature.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="relative overflow-hidden rounded-2xl bg-primary px-8 py-14 text-center text-primary-foreground">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                background:
                  "radial-gradient(closest-side at 15% 20%, oklch(0.7 0.13 220 / 60%), transparent 70%)," +
                  "radial-gradient(closest-side at 85% 80%, oklch(0.62 0.21 350 / 50%), transparent 70%)",
              }}
            />
            <div className="relative flex flex-col items-center gap-5">
              <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance md:text-4xl">
                Replace the binder, the whiteboard and the spreadsheet.
              </h2>
              <p className="max-w-md text-primary-foreground/75">
                Set up your shop in minutes. Your first organization is free
                while we&apos;re in early access.
              </p>
              <Button
                size="lg"
                variant="secondary"
                render={<Link href="/sign-up" />}
              >
                Create your workspace
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
          <Logo className="text-sm" markClassName="size-4" />
          <span>© {new Date().getFullYear()} Fluent AI</span>
        </div>
      </footer>
    </div>
  );
}
