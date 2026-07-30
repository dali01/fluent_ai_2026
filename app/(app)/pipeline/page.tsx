import { NewLeadDialog } from "@/components/crm/new-lead-dialog";
import {
  PipelineBoard,
  type PipelineLead,
} from "@/components/crm/pipeline-board";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { LEAD_STAGES } from "@/lib/validation/crm";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const { orgId } = await requireOrg();
  const db = tenantDb(orgId);

  const [leads, companies, contacts] = await Promise.all([
    db.lead.findMany({
      // Kanban stages only — sourced prospects live on /prospects (§1a)
      where: { deletedAt: null, stage: { in: [...LEAD_STAGES] } },
      include: {
        company: { select: { name: true } },
        contact: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    db.company.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.contact.findMany({
      where: { deletedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  // Decimal isn't serializable to client components — stringify it.
  const boardLeads: PipelineLead[] = leads.map((lead) => ({
    id: lead.id,
    title: lead.title,
    stage: lead.stage,
    value: lead.value ? lead.value.toString() : null,
    companyName: lead.company?.name ?? null,
    contactName: lead.contact
      ? `${lead.contact.firstName} ${lead.contact.lastName}`
      : null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <NewLeadDialog
          companies={companies}
          contacts={contacts.map((c) => ({
            id: c.id,
            name: `${c.firstName} ${c.lastName}`,
          }))}
        />
      </div>
      <PipelineBoard leads={boardLeads} />
    </div>
  );
}
