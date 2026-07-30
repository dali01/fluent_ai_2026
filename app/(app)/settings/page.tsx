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
import { getSource, SOURCE_IDS } from "@/lib/prospecting/sources";
import {
  readGeneralConfig,
  readProspectingConfig,
} from "@/lib/db/org-settings";
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

  const [tiers, rules, prospecting, general, organization] = await Promise.all([
    db.priceTier.findMany({ orderBy: { name: "asc" } }),
    db.pricingRule.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
    readProspectingConfig(orgId),
    readGeneralConfig(orgId),
    (async () =>
      (await clerkClient()).organizations
        .getOrganization({ organizationId: orgId })
        .catch(() => null))(),
  ]);

  // Availability is a server-side fact (env + config); the form only
  // renders it.
  const sourceAvailability: SourceAvailability[] = SOURCE_IDS.map((id) => ({
    id,
    enabled: prospecting.sources[id],
    unavailableReason: getSource(id, {
      queries: prospecting.placesQueries,
      center: prospecting.market?.center,
      radiusMeters: prospecting.market?.radiusMeters,
    }).unavailableReason(),
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
