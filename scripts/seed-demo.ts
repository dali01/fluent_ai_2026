/**
 * Rich demo dataset — additive on top of prisma/seed.ts, safe to run on
 * an org that already has the base seed. Guarded by a marker company:
 * if "Nordic Bistro Group" exists, the script assumes it already ran.
 *
 *   pnpm exec tsx scripts/seed-demo.ts            # demo org
 *   SEED_ORG_ID=org_x pnpm exec tsx scripts/seed-demo.ts
 *
 * The job histories are deliberately time-shaped so /insights fires:
 *  - Nordic Bistro Group  monthly cadence, 50 days silent → DUE TO REORDER
 *  - TechNova AB          60-day cadence, 75 days silent → mildly due
 *  - Grand Hotell         monthly for 6 months, then 430 days of silence → CHURNED
 *  - Vasa Fastigheter     4 orders in the prior half-year, 1 recent → DECLINING
 *  - Kronan Apotek Syd    quarterly, last order 20 days ago → healthy control
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import { getDb } from "../lib/db/client";
import { tenantDb } from "../lib/db/tenant";

const ORG_ID = process.env.SEED_ORG_ID ?? "org_demo_fluent";
const org = { organizationId: ORG_ID };
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000);
const daysAhead = (d: number) => new Date(now + d * 86_400_000);

async function main() {
  const t = tenantDb(ORG_ID);

  const marker = await t.company.findFirst({
    where: { name: "Nordic Bistro Group" },
  });
  if (marker) {
    console.log(`Rich demo data already present for ${ORG_ID} — skipping.`);
    return;
  }

  const standardTier = await t.priceTier.findFirst({
    where: { name: "Standard" },
  });
  const resellerTier = await t.priceTier.findFirst({
    where: { name: "Reseller" },
  });

  // ── Companies + contacts ───────────────────────────────────────
  async function company(data: {
    name: string;
    email: string;
    city: string;
    tags: string[];
    isReseller?: boolean;
    contacts: Array<{
      firstName: string;
      lastName: string;
      email: string;
      title: string;
      portalToken?: string;
    }>;
  }) {
    const c = await t.company.create({
      data: {
        ...org,
        name: data.name,
        email: data.email,
        city: data.city,
        country: "SE",
        tags: data.tags,
        isReseller: data.isReseller ?? false,
        priceTierId: data.isReseller ? resellerTier?.id : standardTier?.id,
      },
    });
    const contacts = [];
    for (const p of data.contacts) {
      contacts.push(
        await t.contact.create({
          data: { ...org, companyId: c.id, ...p },
        }),
      );
    }
    return { c, contacts };
  }

  const orgTail = ORG_ID.slice(-12);
  const bistro = await company({
    name: "Nordic Bistro Group",
    email: "print@nordicbistro.example",
    city: "Jönköping",
    tags: ["restaurant", "recurring"],
    contacts: [
      {
        firstName: "Maja",
        lastName: "Berg",
        email: "maja@nordicbistro.example",
        title: "Operations Manager",
        portalToken: `demo-portal-${orgTail}-maja`,
      },
    ],
  });
  const grand = await company({
    name: "Grand Hotell Jönköping",
    email: "info@grandhotell.example",
    city: "Jönköping",
    tags: ["hospitality"],
    contacts: [
      {
        firstName: "Henrik",
        lastName: "Ström",
        email: "henrik@grandhotell.example",
        title: "F&B Director",
      },
    ],
  });
  const vasa = await company({
    name: "Vasa Fastigheter",
    email: "kontor@vasafastigheter.example",
    city: "Stockholm",
    tags: ["property"],
    contacts: [
      {
        firstName: "Elin",
        lastName: "Vasa",
        email: "elin@vasafastigheter.example",
        title: "Communications Lead",
      },
    ],
  });
  const kronan = await company({
    name: "Kronan Apotek Syd",
    email: "inkop@kronanapotek.example",
    city: "Malmö",
    tags: ["pharma", "compliance"],
    contacts: [
      {
        firstName: "Samir",
        lastName: "Haddad",
        email: "samir@kronanapotek.example",
        title: "Procurement Manager",
      },
    ],
  });
  const technova = await company({
    name: "TechNova AB",
    email: "brand@technova.example",
    city: "Göteborg",
    tags: ["tech", "startup"],
    contacts: [
      {
        firstName: "Lova",
        lastName: "Ek",
        email: "lova@technova.example",
        title: "Head of Brand",
      },
    ],
  });
  const studio = await company({
    name: "Studio Nord Reklambyrå",
    email: "produktion@studionord.example",
    city: "Stockholm",
    tags: ["agency"],
    isReseller: true,
    contacts: [
      {
        firstName: "Oskar",
        lastName: "Palm",
        email: "oskar@studionord.example",
        title: "Production Director",
      },
    ],
  });
  const roda = await company({
    name: "Röda Korset Region Syd",
    email: "material@rodakorset.example",
    city: "Lund",
    tags: ["nonprofit"],
    contacts: [
      {
        firstName: "Ingrid",
        lastName: "Falk",
        email: "ingrid@rodakorset.example",
        title: "Campaign Coordinator",
      },
    ],
  });
  const eko = await company({
    name: "Eko Livs",
    email: "butik@ekolivs.example",
    city: "Jönköping",
    tags: ["retail", "new-customer"],
    contacts: [
      {
        firstName: "Adam",
        lastName: "Lund",
        email: "adam@ekolivs.example",
        title: "Store Owner",
      },
    ],
  });

  // ── Presses / vendors / inventory ──────────────────────────────
  let iridesse = await t.press.findFirst({ where: { name: "Xerox Iridesse" } });
  if (!iridesse) {
    iridesse = await t.press.create({
      data: { ...org, name: "Xerox Iridesse", kind: "digital" },
    });
  }
  const sm74 = await t.press.findFirst({ where: { name: "Heidelberg SM 74" } });

  for (const v of [
    { name: "Bokbinderi Väst", email: "order@bokbinderi.example", services: "binding, saddle stitch, perfect bind" },
    { name: "SignMaterial Nordic", email: "sales@signmaterial.example", services: "substrates, vinyl, display systems" },
  ]) {
    const exists = await t.vendor.findFirst({ where: { name: v.name } });
    if (!exists) await t.vendor.create({ data: { ...org, ...v } });
  }

  async function item(data: {
    name: string;
    type: "PAPER" | "INK" | "OTHER";
    unit: string;
    quantityOnHand: number;
    reorderThreshold: number;
    costPerUnit: number;
  }) {
    const exists = await t.inventoryItem.findFirst({
      where: { name: data.name },
    });
    return exists ?? t.inventoryItem.create({ data: { ...org, ...data } });
  }
  const uncoated = await item({
    name: "Uncoated 120gsm 640x900",
    type: "PAPER",
    unit: "sheet",
    quantityOnHand: 800, // below threshold — demos the low-stock warning
    reorderThreshold: 2000,
    costPerUnit: 0.31,
  });
  const vinyl = await item({
    name: "Vinyl roll matte 1370mm",
    type: "OTHER",
    unit: "m",
    quantityOnHand: 210,
    reorderThreshold: 80,
    costPerUnit: 18.5,
  });
  await item({
    name: "Laminate film gloss 330mm",
    type: "OTHER",
    unit: "m",
    quantityOnHand: 950,
    reorderThreshold: 300,
    costPerUnit: 2.1,
  });

  await t.stockMovement.createMany({
    data: [
      { ...org, inventoryItemId: uncoated.id, delta: 5000, reason: "PURCHASE", note: "Q2 replenishment" },
      { ...org, inventoryItemId: uncoated.id, delta: -4100, reason: "JOB_CONSUMPTION", note: "menu runs, spring" },
      { ...org, inventoryItemId: uncoated.id, delta: -100, reason: "WASTE", note: "makeready spoilage" },
      { ...org, inventoryItemId: vinyl.id, delta: 250, reason: "PURCHASE", note: "signage stock" },
      { ...org, inventoryItemId: vinyl.id, delta: -40, reason: "JOB_CONSUMPTION", note: "window graphics" },
    ],
  });

  // ── Jobs (time-shaped histories for /insights) ─────────────────
  let jobNo = 2100;
  async function job(data: {
    title: string;
    companyId: string;
    status: "DESIGN" | "PROOFING" | "PREPRESS" | "PRINTING" | "FINISHING" | "SHIPPING" | "DONE";
    createdDaysAgo: number;
    quantity: number;
    stock?: string;
    sizeName?: string;
    finish?: string;
    rush?: boolean;
    dueInDays?: number;
    pressId?: string | null;
  }) {
    jobNo += 1;
    return t.job.create({
      data: {
        ...org,
        jobNumber: jobNo,
        title: data.title,
        status: data.status,
        companyId: data.companyId,
        quantity: data.quantity,
        stock: data.stock ?? "Uncoated 120gsm",
        sizeName: data.sizeName ?? "A4",
        colorMode: "CMYK",
        finish: data.finish,
        rush: data.rush ?? false,
        bleedMm: 3,
        dueDate:
          data.status === "DONE"
            ? daysAgo(data.createdDaysAgo - 10)
            : daysAhead(data.dueInDays ?? 10),
        createdAt: daysAgo(data.createdDaysAgo),
        pressId: data.pressId ?? undefined,
      },
    });
  }

  // Nordic Bistro — monthly menus, last one 50 days ago → reorder due
  for (const d of [290, 260, 230, 200, 170, 140, 110, 80, 50]) {
    await job({
      title: `Monthly menus — ${d} days ago`,
      companyId: bistro.c.id,
      status: "DONE",
      createdDaysAgo: d,
      quantity: 400,
      finish: "matte laminate",
    });
  }

  // Grand Hotell — regular, then 430 days of silence → churned
  for (const d of [580, 550, 520, 490, 460, 430]) {
    await job({
      title: `Room directory + breakfast cards`,
      companyId: grand.c.id,
      status: "DONE",
      createdDaysAgo: d,
      quantity: 250,
    });
  }

  // Vasa — 4 orders in the prior window, 1 recent → declining
  for (const d of [340, 300, 250, 210]) {
    await job({
      title: `Tenant newsletters`,
      companyId: vasa.c.id,
      status: "DONE",
      createdDaysAgo: d,
      quantity: 1200,
    });
  }
  await job({
    title: "Tenant newsletters",
    companyId: vasa.c.id,
    status: "DONE",
    createdDaysAgo: 100,
    quantity: 1200,
  });

  // Kronan — quarterly, on rhythm → healthy
  for (const d of [380, 290, 200, 110, 20]) {
    await job({
      title: `Pharmacy leaflets + shelf labels`,
      companyId: kronan.c.id,
      status: d === 20 ? "SHIPPING" : "DONE",
      createdDaysAgo: d,
      quantity: 5000,
      sizeName: "A5",
    });
  }

  // TechNova — 60-day cadence, 75 days silent → mildly due
  for (const d of [255, 195, 135, 75]) {
    await job({
      title: `Event collateral drop ${Math.round(d / 60)}`,
      companyId: technova.c.id,
      status: "DONE",
      createdDaysAgo: d,
      quantity: 800,
    });
  }

  // Active production board coverage
  const boardJobs = [
    { title: "Eko Livs opening posters", companyId: eko.c.id, status: "DESIGN" as const, quantity: 60, sizeName: "70x100", dueInDays: 12 },
    { title: "Blood-drive campaign flyers", companyId: roda.c.id, status: "PROOFING" as const, quantity: 10000, sizeName: "A5", dueInDays: 8 },
    { title: "Client rebrand — stationery suite", companyId: studio.c.id, status: "PREPRESS" as const, quantity: 2500, dueInDays: 6 },
    // NOT bistro — an active job would reset their 50-day reorder story
    { title: "Compliance leaflets — 40k run", companyId: kronan.c.id, status: "PRINTING" as const, quantity: 40000, sizeName: "A5", dueInDays: 4, rush: true },
    { title: "Annual report — Vasa Fastigheter", companyId: vasa.c.id, status: "FINISHING" as const, quantity: 300, sizeName: "A4", finish: "perfect bind", dueInDays: 3 },
  ];
  const activeJobs = [];
  for (const b of boardJobs) {
    activeJobs.push(
      await job({
        ...b,
        createdDaysAgo: 5,
        pressId: b.status === "PRINTING" ? sm74?.id : iridesse.id,
      }),
    );
  }

  // Schedule blocks — this week, non-overlapping per press
  const printing = activeJobs.find((j) => j.status === "PRINTING");
  const prepress = activeJobs.find((j) => j.status === "PREPRESS");
  if (sm74 && printing) {
    await t.scheduleBlock.create({
      data: {
        ...org,
        pressId: sm74.id,
        jobId: printing.id,
        startsAt: daysAhead(1),
        endsAt: new Date(now + 1.3 * 86_400_000),
        note: "Summer menu run",
      },
    });
  }
  if (prepress) {
    await t.scheduleBlock.create({
      data: {
        ...org,
        pressId: iridesse.id,
        jobId: prepress.id,
        startsAt: daysAhead(2),
        endsAt: new Date(now + 2.4 * 86_400_000),
        note: "Stationery suite digital run",
      },
    });
  }

  // ── Kanban leads across every stage ────────────────────────────
  await t.lead.createMany({
    data: [
      { ...org, title: "Trade-fair booth graphics", stage: "QUOTE_REQUESTED", companyId: technova.c.id, contactId: technova.contacts[0].id, value: 45000, source: "referral" },
      { ...org, title: "Loyalty punch cards", stage: "QUOTE_REQUESTED", companyId: bistro.c.id, contactId: bistro.contacts[0].id, value: 9500, source: "email" },
      { ...org, title: "Window graphics — 4 storefronts", stage: "QUOTED", companyId: eko.c.id, contactId: eko.contacts[0].id, value: 38000, source: "walk-in" },
      { ...org, title: "Fundraising direct mail", stage: "QUOTED", companyId: roda.c.id, contactId: roda.contacts[0].id, value: 72000, source: "repeat-client" },
      { ...org, title: "Compliance leaflet reprint", stage: "APPROVED", companyId: kronan.c.id, contactId: kronan.contacts[0].id, value: 54000, source: "email" },
      { ...org, title: "Client campaign — outdoor 6-sheet", stage: "IN_PRODUCTION", companyId: studio.c.id, contactId: studio.contacts[0].id, value: 120000, source: "reseller" },
      { ...org, title: "Autumn menu print", stage: "DELIVERED", companyId: bistro.c.id, contactId: bistro.contacts[0].id, value: 16000, source: "repeat-client" },
      { ...org, title: "Tenant newsletter Q1", stage: "REPEAT", companyId: vasa.c.id, contactId: vasa.contacts[0].id, value: 22000, source: "repeat-client" },
    ],
  });

  // ── Quotes / invoices / payments ───────────────────────────────
  const quoteSent = await t.quote.create({
    data: {
      ...org,
      quoteNumber: 1101,
      companyId: eko.c.id,
      status: "SENT",
      priceTierId: standardTier?.id,
      subtotal: 30400,
      taxRate: 0.25,
      taxAmount: 7600,
      total: 38000,
      validUntil: daysAhead(21),
      lineItems: {
        create: [
          { ...org, description: "Window graphics, printed + laminated vinyl", quantity: 4, unitPrice: 6200, total: 24800, sortOrder: 1 },
          { ...org, description: "On-site installation", quantity: 4, unitPrice: 1400, total: 5600, sortOrder: 2 },
        ],
      },
    },
  });
  await t.quote.create({
    data: {
      ...org,
      quoteNumber: 1102,
      companyId: roda.c.id,
      status: "DRAFT",
      priceTierId: standardTier?.id,
      subtotal: 57600,
      taxRate: 0.25,
      taxAmount: 14400,
      total: 72000,
      lineItems: {
        create: [
          { ...org, description: "DM package: envelope + letter + response card, 24k sets", quantity: 24000, unitPrice: 2.4, total: 57600, sortOrder: 1 },
        ],
      },
    },
  });
  const quoteAccepted = await t.quote.create({
    data: {
      ...org,
      quoteNumber: 1103,
      companyId: kronan.c.id,
      status: "ACCEPTED",
      priceTierId: standardTier?.id,
      subtotal: 43200,
      taxRate: 0.25,
      taxAmount: 10800,
      total: 54000,
      lineItems: {
        create: [
          { ...org, description: "Pharmacy compliance leaflets, A5, 4/4", quantity: 40000, unitPrice: 0.95, total: 38000, sortOrder: 1 },
          { ...org, description: "Shelf-edge labels", quantity: 5200, unitPrice: 1, total: 5200, sortOrder: 2 },
        ],
      },
    },
  });

  const paidInvoice = await t.invoice.create({
    data: {
      ...org,
      invoiceNumber: 3101,
      companyId: bistro.c.id,
      status: "PAID",
      subtotal: 12800,
      taxAmount: 3200,
      total: 16000,
      issuedAt: daysAgo(45),
      dueDate: daysAgo(15),
    },
  });
  await t.payment.create({
    data: { ...org, invoiceId: paidInvoice.id, amount: 16000, method: "BANK_TRANSFER", reference: "Autumn menus" },
  });
  await t.invoice.create({
    data: {
      ...org,
      invoiceNumber: 3102,
      companyId: vasa.c.id,
      status: "OVERDUE",
      subtotal: 17600,
      taxAmount: 4400,
      total: 22000,
      issuedAt: daysAgo(50),
      dueDate: daysAgo(20),
    },
  });
  await t.invoice.create({
    data: {
      ...org,
      invoiceNumber: 3103,
      companyId: kronan.c.id,
      quoteId: quoteAccepted.id,
      status: "SENT",
      subtotal: 43200,
      taxAmount: 10800,
      total: 54000,
      depositAmount: 27000,
      issuedAt: daysAgo(3),
      dueDate: daysAhead(27),
    },
  });

  // ── Activity trail ─────────────────────────────────────────────
  await t.activityLog.createMany({
    data: [
      { ...org, type: "QUOTE_SENT", summary: "Quote #1101 sent to Eko Livs", contactId: eko.contacts[0].id },
      { ...org, type: "CALL", summary: "Call with Samir — compliance leaflet specs confirmed", contactId: kronan.contacts[0].id },
      { ...org, type: "MEETING", summary: "Production sync with Studio Nord on outdoor campaign", contactId: studio.contacts[0].id },
      { ...org, type: "EMAIL", summary: "Reminder sent for overdue invoice #3102", contactId: vasa.contacts[0].id },
      { ...org, type: "NOTE", summary: "Maja hinted at loyalty-card program for all bistros", contactId: bistro.contacts[0].id },
    ],
  });

  console.log(
    `Rich demo data seeded for ${ORG_ID}: 8 companies, ${jobNo - 2100} jobs, 8 kanban leads, 3 quotes (${quoteSent.quoteNumber}–1103), 3 invoices.`,
  );
  console.log(`Portal link (Maja): /portal/demo-portal-${orgTail}-maja`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => getDb().$disconnect());
