import { clerkClient } from "@clerk/nextjs/server";
import {
  DeleteRuleButton,
  PriceTierDialog,
  PricingRuleDialog,
} from "@/components/settings/pricing-forms";
import { GeneralSettingsForm } from "@/components/settings/general-form";
import {
  ProspectingSettingsForm,
  type SourceAvailability,
} from "@/components/settings/prospecting-form";
import {
  getSource,
  sourceConfigsFrom,
  SOURCE_IDS,
} from "@/lib/prospecting/sources";
import { readAiSpend } from "@/lib/ai/spend";
import {
  readGeneralConfig,
  readProspectingConfig,
} from "@/lib/db/org-settings";
import { formatMoney } from "@/lib/format/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { orgId } = await requireOrg();
  const db = tenantDb(orgId);

  const [tiers, rules, prospecting, general, organization, aiSpend] =
    await Promise.all([
      db.priceTier.findMany({ orderBy: { name: "asc" } }),
      db.pricingRule.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
      readProspectingConfig(orgId),
      readGeneralConfig(orgId),
      (async () =>
        (await clerkClient()).organizations
          .getOrganization({ organizationId: orgId })
          .catch(() => null))(),
      readAiSpend(orgId),
    ]);

  // Availability is a server-side fact (env + config); the form only
  // renders it.
  const prospectingConfigs = sourceConfigsFrom(prospecting);
  const sourceAvailability: SourceAvailability[] = SOURCE_IDS.map((id) => ({
    id,
    enabled: prospecting.sources[id],
    unavailableReason: getSource(id, prospectingConfigs).unavailableReason(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          {organization?.name ?? orgId} — every setting here is specific to this
          organization.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <GeneralSettingsForm initial={general.currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Price tiers</CardTitle>
          <PriceTierDialog />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Multiplier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((tier) => (
                <TableRow key={tier.id}>
                  <TableCell className="font-medium">{tier.name}</TableCell>
                  <TableCell className="font-mono">
                    ×{Number(tier.multiplier)}
                  </TableCell>
                  <TableCell>
                    {tier.isResellerTier ? (
                      <Badge variant="secondary">Reseller</Badge>
                    ) : (
                      <span className="text-muted-foreground">Standard</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <PriceTierDialog
                      tier={{
                        id: tier.id,
                        name: tier.name,
                        multiplier: Number(tier.multiplier),
                        isResellerTier: tier.isResellerTier,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI usage — last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          {aiSpend.totalCalls === 0 ? (
            <p className="text-sm text-muted-foreground">
              No AI calls yet. Every Claude call records its model, tokens and
              cost here.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-6 text-sm">
                <span>
                  <span className="font-mono text-lg font-semibold">
                    {formatMoney(aiSpend.totalCostCents / 100, "USD")}
                  </span>{" "}
                  <span className="text-muted-foreground">total</span>
                </span>
                <span>
                  <span className="font-mono text-lg font-semibold">
                    {aiSpend.totalCalls}
                  </span>{" "}
                  <span className="text-muted-foreground">calls</span>
                </span>
                {aiSpend.failedCalls > 0 ? (
                  <span className="text-destructive">
                    <span className="font-mono text-lg font-semibold">
                      {aiSpend.failedCalls}
                    </span>{" "}
                    failed
                  </span>
                ) : null}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Calls</TableHead>
                    <TableHead>Tokens in / out</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiSpend.byKind.map((row) => (
                    <TableRow key={row.kind}>
                      <TableCell className="lowercase">
                        {row.kind.replaceAll("_", " ")}
                      </TableCell>
                      <TableCell className="font-mono">
                        {row.calls}
                        {row.failed > 0 ? (
                          <span className="text-destructive">
                            {" "}
                            ({row.failed} failed)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.inputTokens.toLocaleString("sv-SE")} /{" "}
                        {row.outputTokens.toLocaleString("sv-SE")}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatMoney(row.costCents / 100, "USD")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Billed by Anthropic in USD, independent of this
                organization&apos;s display currency.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prospecting</CardTitle>
        </CardHeader>
        <CardContent>
          <ProspectingSettingsForm
            sources={sourceAvailability}
            initial={{
              enabled: prospecting.enabled,
              city: prospecting.market?.city ?? "",
              country: prospecting.market?.country ?? "SE",
              placesQueries: prospecting.placesQueries,
              osmCategories: prospecting.osmCategories,
              minScore: prospecting.enrichment.minScore,
              maxPerRun: prospecting.enrichment.maxPerRun,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pricing rules</CardTitle>
          <PricingRuleDialog />
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rules yet — quotes will use manual unit prices until you add
              quantity tiers, surcharges and fees here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Config</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell className="lowercase">
                      {rule.type.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                      {JSON.stringify(rule.config)}
                    </TableCell>
                    <TableCell>
                      {rule.active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <span className="text-muted-foreground">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <PricingRuleDialog
                          rule={{
                            id: rule.id,
                            name: rule.name,
                            type: rule.type,
                            active: rule.active,
                            config: rule.config,
                          }}
                        />
                        <DeleteRuleButton ruleId={rule.id} name={rule.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
