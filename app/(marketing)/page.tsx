import Link from "next/link";
import { ArrowRight, Printer, Sparkles, Workflow } from "lucide-react";
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
    title: "Run the whole shop",
    description:
      "Contacts, quotes, jobs, proofs, presses and invoices — one pipeline from first enquiry to delivered reorder.",
  },
  {
    icon: Printer,
    title: "Built for print",
    description:
      "Stock, colour modes, bleed, finishing, press scheduling. Not a generic CRM with print bolted on.",
  },
  {
    icon: Sparkles,
    title: "AI where it counts",
    description:
      "Prepress file checks in plain English, reorder-likelihood scoring, drafted outreach — reviewed by you, never auto-sent.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 md:px-12">
        <div className="flex items-center gap-2 font-semibold">
          <Printer className="size-5" aria-hidden />
          Fluent AI
        </div>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" render={<Link href="/sign-in" />}>
            Sign in
          </Button>
          <Button render={<Link href="/sign-up" />}>Get started</Button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-12 px-6 py-24 text-center">
        <div className="flex max-w-2xl flex-col items-center gap-6">
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
                  className="mb-2 size-5 text-muted-foreground"
                  aria-hidden
                />
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Fluent AI
      </footer>
    </div>
  );
}
