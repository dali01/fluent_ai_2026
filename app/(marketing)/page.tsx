import Link from "next/link";
import { ArrowRight, Printer, Sparkles, Workflow } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    icon: Workflow,
    accent: "text-chart-1",
    title: "Run the whole shop",
    description:
      "Contacts, quotes, jobs, proofs, presses and invoices — one pipeline from first enquiry to delivered reorder.",
  },
  {
    icon: Printer,
    accent: "text-chart-2",
    title: "Built for print",
    description:
      "Stock, colour modes, bleed, finishing, press scheduling. Not a generic CRM with print bolted on.",
  },
  {
    icon: Sparkles,
    accent: "text-chart-4",
    title: "AI where it counts",
    description:
      "Prepress file checks in plain English, reorder-likelihood scoring, drafted outreach — reviewed by you, never auto-sent.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 md:px-12">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" render={<Link href="/sign-in" />}>
            Sign in
          </Button>
          <Button render={<Link href="/sign-up" />}>Get started</Button>
        </nav>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center gap-12 overflow-hidden px-6 py-24 text-center">
        {/* CMYK registration glow behind the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-105 max-w-3xl opacity-20 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side at 35% 40%, oklch(0.7 0.13 220), transparent 70%)," +
              "radial-gradient(closest-side at 65% 40%, oklch(0.62 0.21 350), transparent 70%)," +
              "radial-gradient(closest-side at 50% 70%, oklch(0.83 0.14 90), transparent 70%)",
          }}
        />
        <div className="flex max-w-2xl flex-col items-center gap-6">
          <span className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            The CRM print shops actually want
          </span>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            The modern CRM for print businesses
          </h1>
          <p className="text-lg text-muted-foreground">
            Fluent AI brings client acquisition, quoting, production and
            invoicing into one clean workspace — with AI woven through the parts
            that used to eat your day.
          </p>
          <Button size="lg" render={<Link href="/sign-up" />}>
            Start free
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="grid w-full max-w-4xl gap-4 text-left md:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon
                  className={`mb-2 size-5 ${feature.accent}`}
                  aria-hidden
                />
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>

      <footer className="flex items-center justify-between px-6 py-6 text-sm text-muted-foreground md:px-12">
        <Logo className="text-sm" markClassName="size-4" />
        <span>© {new Date().getFullYear()} Fluent AI</span>
      </footer>
    </div>
  );
}
