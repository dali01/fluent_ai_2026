import Link from "next/link";
import { Radar } from "lucide-react";
import {
  ProspectRow,
  type ProspectRowData,
} from "@/components/prospecting/prospect-row";
import { RunSourceButton } from "@/components/prospecting/run-source-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { readProspectingConfig } from "@/lib/db/org-settings";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import {
  getSource,
  SOURCE_ENUM,
  SOURCE_IDS,
  SOURCE_META,
} from "@/lib/prospecting/sources";
import { prospectFilterSchema } from "@/lib/validation/prospecting";

export const metadata = { title: "Prospects" };

const SOURCES = SOURCE_IDS.map((id) => ({
  id,
  label: SOURCE_META[id].label,
  enum: SOURCE_ENUM[id],
}));

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { orgId } = await requireOrg();
  const db = tenantDb(orgId);
  const params = await searchParams;
  const filter = prospectFilterSchema.parse({
    source:
      params.source && ["FDA", "PLACES", "PERMIT"].includes(params.source)
        ? params.source
        : "all",
  });

  const [prospects, lastRuns, config] = await Promise.all([
    db.lead.findMany({
      where: {
        deletedAt: null,
        stage: "PROSPECT",
        ...(filter.source !== "all" ? { prospectSource: filter.source } : {}),
      },
      orderBy: [{ score: "desc" }, { discoveredAt: "desc" }],
      take: 100,
    }),
    Promise.all(
      SOURCES.map((s) =>
        db.sourceRun.findFirst({
          where: { source: s.enum as never },
          orderBy: { startedAt: "desc" },
        }),
      ),
    ),
    readProspectingConfig(orgId),
  ]);

  // Per-agent state: switched on for this org, and actually runnable
  const agentState = SOURCE_IDS.map((id) => ({
    id,
    label: SOURCE_META[id].label,
    enumValue: SOURCE_ENUM[id],
    enabledForOrg: config.sources[id],
    unavailableReason: getSource(id, {
      queries: config.placesQueries,
      center: config.market?.center,
      radiusMeters: config.market?.radiusMeters,
    }).unavailableReason(),
  }));

  const rows: ProspectRowData[] = prospects.map((p) => ({
    id: p.id,
    businessName: p.notes ?? p.title,
    triggerReason: p.triggerReason ?? "",
    source: p.prospectSource,
    category: p.category,
    city: p.city,
    score: p.score,
    rationale: p.rationale,
    scoreFactors:
      (p.scoreBreakdown as ProspectRowData["scoreFactors"] | null) ?? [],
    contactName: p.contactName,
    contactEmail: p.contactEmail,
    contactTitle: p.contactTitle,
    enrichmentStatus: p.enrichmentStatus,
    website: p.website,
    discoveredAt: p.discoveredAt?.toISOString() ?? null,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospects</h1>
          <p className="text-sm text-muted-foreground">
            Sourced from new-business signals — qualify the good ones onto the
            pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {agentState.map((a) => (
            <RunSourceButton
              key={a.id}
              sourceId={a.id}
              label={a.label}
              available={a.enabledForOrg && !a.unavailableReason}
            />
          ))}
        </div>
      </div>

      {!config.enabled ? (
        <div className="rounded-xl border border-chart-3/40 bg-chart-3/10 px-4 py-3 text-sm">
          Prospecting is disabled for this organization — enable it under{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>
          .
        </div>
      ) : null}

      {/* Last-run strip — the entire ops surface for unattended
          operation. An agent that can't run says so here, so a skipped
          run is never a mystery. */}
      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        {agentState.map((a, i) => {
          const run = lastRuns[i];
          const blocked = !a.enabledForOrg
            ? "switched off for this organization"
            : a.unavailableReason;
          return (
            <span key={a.id} className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{a.label}:</span>
              {blocked ? (
                <Badge
                  variant="outline"
                  className="border-chart-3/40 px-1.5 py-0 text-chart-3"
                >
                  {blocked}
                </Badge>
              ) : null}
              {run ? (
                <>
                  <Badge
                    variant={
                      run.status === "FAILED" ? "destructive" : "outline"
                    }
                    className="px-1.5 py-0"
                  >
                    {run.status.toLowerCase()}
                  </Badge>
                  {run.startedAt.toLocaleString("sv-SE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                  {run.status !== "SKIPPED"
                    ? ` · ${run.created} new / ${run.duplicates} dup`
                    : ""}
                </>
              ) : (
                "never run"
              )}
            </span>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={filter.source === "all" ? "secondary" : "ghost"}
          render={<Link href="/prospects" />}
        >
          All
        </Button>
        {SOURCES.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={filter.source === s.enum ? "secondary" : "ghost"}
            render={<Link href={`/prospects?source=${s.enum}`} />}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Radar className="size-8" aria-hidden />
          <p>No prospects yet — run a source or wait for the nightly cron.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <ProspectRow key={row.id} prospect={row} />
          ))}
        </div>
      )}
    </div>
  );
}
