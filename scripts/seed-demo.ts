/**
 * Rich demo dataset — market-aware and self-sufficient (tiers, rules,
 * presses, prospects and prospecting config included). Run on an empty
 * org (fresh, or after scripts/reset-org.ts). Guarded by the market's
 * marker company: if it exists, the script assumes it already ran.
 *
 *   SEED_ORG_ID=org_x SEED_MARKET=se pnpm exec tsx scripts/seed-demo.ts
 *   SEED_ORG_ID=org_x SEED_MARKET=us USE_NEON=1 pnpm exec tsx scripts/seed-demo.ts
 *
 * The job histories are deliberately time-shaped so /insights fires:
 *  - monthly customer, 50 days silent            → DUE TO REORDER
 *  - monthly for 6 months, then 430 days silent  → CHURNED
 *  - 4 orders prior half-year, 1 recent          → DECLINING
 *  - quarterly, last order 20 days ago           → healthy control
 *  - 60-day cadence, 75 days silent              → mildly due
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

if (process.env.USE_NEON && process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
  process.env.DIRECT_URL = process.env.NEON_DATABASE_URL;
}

import type { Currency } from "../lib/format/money";

const ORG_ID = process.env.SEED_ORG_ID ?? "org_demo_fluent";
const MARKET = (process.env.SEED_MARKET ?? "se") as "se" | "us";
const org = { organizationId: ORG_ID };
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000);
const daysAhead = (d: number) => new Date(now + d * 86_400_000);

type CompanySpec = {
  name: string;
  email: string;
  city: string;
  tags: string[];
  isReseller?: boolean;
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    title: string;
  };
};

type MarketData = {
  currency: Currency;
  country: string;
  /** SE: 25% VAT; US: 8.25% TX sales tax */
  taxRate: number;
  prospecting: { city: string; queries: string[] };
  monthly: CompanySpec; // reorder-due story (+ portal token)
  lapsed: CompanySpec;
  declining: CompanySpec;
  quarterly: CompanySpec;
  sixtyDay: CompanySpec;
  agency: CompanySpec;
  nonprofit: CompanySpec;
  newCustomer: CompanySpec;
  jobTitles: {
    monthly: string;
    lapsed: string;
    declining: string;
    quarterly: string;
    sixtyDay: (n: number) => string;
    boardNew: string;
    boardNonprofit: string;
    boardAgency: string;
    boardQuarterlyRush: string;
    boardDeclining: string;
  };
  vendors: Array<{ name: string; email: string; services: string }>;
  permitProspect: { businessName: string; category: string; address: string; city: string; postal: string };
};

const SE: MarketData = {
  currency: "SEK",
  country: "SE",
  taxRate: 0.25,
  prospecting: {
    city: "Jönköping",
    queries: ["nytt bageri Jönköping", "ny restaurang Jönköping", "nyöppnad butik Jönköping"],
  },
  monthly: {
    name: "Nordic Bistro Group",
    email: "print@nordicbistro.example",
    city: "Jönköping",
    tags: ["restaurant", "recurring"],
    contact: { firstName: "Maja", lastName: "Berg", email: "maja@nordicbistro.example", title: "Operations Manager" },
  },
  lapsed: {
    name: "Grand Hotell Jönköping",
    email: "info@grandhotell.example",
    city: "Jönköping",
    tags: ["hospitality"],
    contact: { firstName: "Henrik", lastName: "Ström", email: "henrik@grandhotell.example", title: "F&B Director" },
  },
  declining: {
    name: "Vasa Fastigheter",
    email: "kontor@vasafastigheter.example",
    city: "Stockholm",
    tags: ["property"],
    contact: { firstName: "Elin", lastName: "Vasa", email: "elin@vasafastigheter.example", title: "Communications Lead" },
  },
  quarterly: {
    name: "Kronan Apotek Syd",
    email: "inkop@kronanapotek.example",
    city: "Malmö",
    tags: ["pharma", "compliance"],
    contact: { firstName: "Samir", lastName: "Haddad", email: "samir@kronanapotek.example", title: "Procurement Manager" },
  },
  sixtyDay: {
    name: "TechNova AB",
    email: "brand@technova.example",
    city: "Göteborg",
    tags: ["tech", "startup"],
    contact: { firstName: "Lova", lastName: "Ek", email: "lova@technova.example", title: "Head of Brand" },
  },
  agency: {
    name: "Studio Nord Reklambyrå",
    email: "produktion@studionord.example",
    city: "Stockholm",
    tags: ["agency"],
    isReseller: true,
    contact: { firstName: "Oskar", lastName: "Palm", email: "oskar@studionord.example", title: "Production Director" },
  },
  nonprofit: {
    name: "Röda Korset Region Syd",
    email: "material@rodakorset.example",
    city: "Lund",
    tags: ["nonprofit"],
    contact: { firstName: "Ingrid", lastName: "Falk", email: "ingrid@rodakorset.example", title: "Campaign Coordinator" },
  },
  newCustomer: {
    name: "Eko Livs",
    email: "butik@ekolivs.example",
    city: "Jönköping",
    tags: ["retail", "new-customer"],
    contact: { firstName: "Adam", lastName: "Lund", email: "adam@ekolivs.example", title: "Store Owner" },
  },
  jobTitles: {
    monthly: "Månadsmenyer",
    lapsed: "Rumskatalog + frukostkort",
    declining: "Hyresgästnyhetsbrev",
    quarterly: "Apoteksbroschyrer + hyllkantsetiketter",
    sixtyDay: (n) => `Eventmaterial leverans ${n}`,
    boardNew: "Öppningsaffischer Eko Livs",
    boardNonprofit: "Blodgivarkampanj — flygblad",
    boardAgency: "Kundrebrand — kontorstryck",
    boardQuarterlyRush: "Bipacksedlar — 40k upplaga",
    boardDeclining: "Årsredovisning — Vasa Fastigheter",
  },
  vendors: [
    { name: "Bokbinderi Väst", email: "order@bokbinderi.example", services: "binding, saddle stitch, perfect bind" },
    { name: "SignMaterial Nordic", email: "sales@signmaterial.example", services: "substrates, vinyl, display systems" },
  ],
  permitProspect: {
    businessName: "Kaffeverket AB",
    category: "cafe",
    address: "Västra Storgatan 8",
    city: "Jönköping",
    postal: "55315",
  },
};

const US: MarketData = {
  currency: "USD",
  country: "US",
  taxRate: 0.0825,
  prospecting: {
    city: "Austin",
    queries: ["new restaurant Austin", "new bakery Austin", "grand opening retail Austin"],
  },
  monthly: {
    name: "Blue Ridge Bistro Group",
    email: "print@blueridgebistro.example",
    city: "Austin",
    tags: ["restaurant", "recurring"],
    contact: { firstName: "Maya", lastName: "Brooks", email: "maya@blueridgebistro.example", title: "Operations Manager" },
  },
  lapsed: {
    name: "Grand Hotel Lakeside",
    email: "info@grandlakeside.example",
    city: "Austin",
    tags: ["hospitality"],
    contact: { firstName: "Henry", lastName: "Stone", email: "henry@grandlakeside.example", title: "F&B Director" },
  },
  declining: {
    name: "Lone Star Properties",
    email: "office@lonestarprop.example",
    city: "Dallas",
    tags: ["property"],
    contact: { firstName: "Ellen", lastName: "Vance", email: "ellen@lonestarprop.example", title: "Communications Lead" },
  },
  quarterly: {
    name: "Hill Country Pharmacy Group",
    email: "purchasing@hillcountryrx.example",
    city: "Houston",
    tags: ["pharma", "compliance"],
    contact: { firstName: "Sam", lastName: "Reyes", email: "sam@hillcountryrx.example", title: "Procurement Manager" },
  },
  sixtyDay: {
    name: "BrightWave Tech Inc",
    email: "brand@brightwave.example",
    city: "Austin",
    tags: ["tech", "startup"],
    contact: { firstName: "Lola", lastName: "Eckert", email: "lola@brightwave.example", title: "Head of Brand" },
  },
  agency: {
    name: "North Star Creative Agency",
    email: "production@northstarcreative.example",
    city: "Dallas",
    tags: ["agency"],
    isReseller: true,
    contact: { firstName: "Oscar", lastName: "Palmer", email: "oscar@northstarcreative.example", title: "Production Director" },
  },
  nonprofit: {
    name: "Austin Community Food Bank",
    email: "materials@austinfoodbank.example",
    city: "Austin",
    tags: ["nonprofit"],
    contact: { firstName: "Iris", lastName: "Fowler", email: "iris@austinfoodbank.example", title: "Campaign Coordinator" },
  },
  newCustomer: {
    name: "Green Grocer Market",
    email: "store@greengrocer.example",
    city: "Austin",
    tags: ["retail", "new-customer"],
    contact: { firstName: "Aaron", lastName: "Long", email: "aaron@greengrocer.example", title: "Store Owner" },
  },
  jobTitles: {
    monthly: "Monthly menus",
    lapsed: "Room directory + breakfast cards",
    declining: "Tenant newsletters",
    quarterly: "Pharmacy leaflets + shelf labels",
    sixtyDay: (n) => `Event collateral drop ${n}`,
    boardNew: "Grand-opening posters",
    boardNonprofit: "Food-drive campaign flyers",
    boardAgency: "Client rebrand — stationery suite",
    boardQuarterlyRush: "Compliance leaflets — 40k run",
    boardDeclining: "Annual report — Lone Star Properties",
  },
  vendors: [
    { name: "Hill Country Bindery", email: "orders@hcbindery.example", services: "binding, saddle stitch, perfect bind" },
    { name: "SignSupply USA", email: "sales@signsupplyusa.example", services: "substrates, vinyl, display systems" },
  ],
  permitProspect: {
    businessName: "Daily Grind Coffee LLC",
    category: "cafe",
    address: "412 Congress Ave",
    city: "Austin",
    postal: "78701",
  },
};

const M = MARKET === "us" ? US : SE;

async function main() {
  const { getDb } = await import("../lib/db/client");
  const { tenantDb } = await import("../lib/db/tenant");
  const { writeGeneralConfig, writeProspectingConfig, readProspectingConfig } =
    await import("../lib/db/org-settings");

  const orgName =
    process.env.SEED_ORG_NAME ??
    (ORG_ID === "org_demo_fluent" ? "Demo Print Co" : undefined);
  await getDb().organization.upsert({
    where: { id: ORG_ID },
    create: { id: ORG_ID, name: orgName ?? ORG_ID },
    update: orgName ? { name: orgName } : {},
  });

  const t = tenantDb(ORG_ID);

  const marker = await t.company.findFirst({ where: { name: M.monthly.name } });
  if (marker) {
    console.log(`Rich demo data (${MARKET}) already present for ${ORG_ID} — skipping.`);
    return;
  }

  // ── Org-level settings: currency + prospecting market ──────────
  await writeGeneralConfig(ORG_ID, { currency: M.currency });
  const prospecting = await readProspectingConfig(ORG_ID);
  await writeProspectingConfig(ORG_ID, {
    ...prospecting,
    enabled: true,
    market: { country: M.country, city: M.prospecting.city },
    placesQueries: M.prospecting.queries,
  });

  // ── Tiers + pricing rules (idempotent) ─────────────────────────
  const standardTier = await t.priceTier.upsert({
    where: { organizationId_name: { organizationId: ORG_ID, name: "Standard" } },
    create: { ...org, name: "Standard", multiplier: 1 },
    update: {},
  });
  const resellerTier = await t.priceTier.upsert({
    where: { organizationId_name: { organizationId: ORG_ID, name: "Reseller" } },
    create: { ...org, name: "Reseller", multiplier: 0.8, isResellerTier: true },
    update: {},
  });
  if ((await t.pricingRule.count()) === 0) {
    await t.pricingRule.createMany({
      data: [
        { ...org, name: "Flyer quantity breaks", type: "QUANTITY_TIER", config: { tiers: [{ minQty: 0, unitPrice: 4 }, { minQty: 1000, unitPrice: 2.5 }, { minQty: 5000, unitPrice: 1.8 }] } },
        { ...org, name: "Silk stock surcharge", type: "STOCK", config: { stock: "silk", surchargePerUnit: 0.3 } },
        { ...org, name: "Laminate finishing", type: "FINISHING", config: { finish: "laminate", perUnit: 0.5, flat: 200 } },
        { ...org, name: "Rush surcharge 25%", type: "RUSH_FEE", config: { percent: 25, flat: 0 } },
        { ...org, name: "Press setup", type: "SETUP_FEE", config: { flat: 500 } },
      ],
    });
  }

  // ── Companies + contacts ───────────────────────────────────────
  const orgTail = ORG_ID.slice(-12);
  async function company(spec: CompanySpec, portalToken?: string) {
    const c = await t.company.create({
      data: {
        ...org,
        name: spec.name,
        email: spec.email,
        city: spec.city,
        country: M.country,
        tags: spec.tags,
        isReseller: spec.isReseller ?? false,
        priceTierId: spec.isReseller ? resellerTier.id : standardTier.id,
      },
    });
    const contact = await t.contact.create({
      data: { ...org, companyId: c.id, ...spec.contact, portalToken },
    });
    return { c, contact };
  }

  const monthly = await company(M.monthly, `demo-portal-${orgTail}-${M.monthly.contact.firstName.toLowerCase()}`);
  const lapsed = await company(M.lapsed);
  const declining = await company(M.declining);
  const quarterly = await company(M.quarterly);
  const sixtyDay = await company(M.sixtyDay);
  const agency = await company(M.agency);
  const nonprofit = await company(M.nonprofit);
  const newCustomer = await company(M.newCustomer);

  // ── Presses / vendors / inventory ──────────────────────────────
  const sm74 = await t.press.create({ data: { ...org, name: "Heidelberg SM 74", kind: "offset" } });
  const iridesse = await t.press.create({ data: { ...org, name: "Xerox Iridesse", kind: "digital" } });

  for (const v of M.vendors) {
    await t.vendor.create({ data: { ...org, ...v } });
  }

  const silk = await t.inventoryItem.create({
    data: { ...org, name: "Silk 170gsm 720x1020", type: "PAPER", unit: "sheet", quantityOnHand: 14000, reorderThreshold: 5000, costPerUnit: 0.42 },
  });
  const uncoated = await t.inventoryItem.create({
    data: { ...org, name: "Uncoated 120gsm 640x900", type: "PAPER", unit: "sheet", quantityOnHand: 800, reorderThreshold: 2000, costPerUnit: 0.31 }, // low stock on purpose
  });
  const vinyl = await t.inventoryItem.create({
    data: { ...org, name: "Vinyl roll matte 1370mm", type: "OTHER", unit: "m", quantityOnHand: 210, reorderThreshold: 80, costPerUnit: 18.5 },
  });
  await t.inventoryItem.create({
    data: { ...org, name: "Process ink CMYK set", type: "INK", unit: "kg", quantityOnHand: 36, reorderThreshold: 12, costPerUnit: 210 },
  });

  await t.stockMovement.createMany({
    data: [
      { ...org, inventoryItemId: uncoated.id, delta: 5000, reason: "PURCHASE", note: "Q2 replenishment" },
      { ...org, inventoryItemId: uncoated.id, delta: -4100, reason: "JOB_CONSUMPTION", note: "menu runs" },
      { ...org, inventoryItemId: uncoated.id, delta: -100, reason: "WASTE", note: "makeready spoilage" },
      { ...org, inventoryItemId: vinyl.id, delta: 250, reason: "PURCHASE", note: "signage stock" },
      { ...org, inventoryItemId: silk.id, delta: -1600, reason: "JOB_CONSUMPTION", note: "board runs" },
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
        stock: "Uncoated 120gsm",
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

  // monthly cadence, last one 50 days ago → reorder due
  for (const d of [290, 260, 230, 200, 170, 140, 110, 80, 50]) {
    await job({ title: M.jobTitles.monthly, companyId: monthly.c.id, status: "DONE", createdDaysAgo: d, quantity: 400, finish: "matte laminate" });
  }
  // regular, then 430 days of silence → churned
  for (const d of [580, 550, 520, 490, 460, 430]) {
    await job({ title: M.jobTitles.lapsed, companyId: lapsed.c.id, status: "DONE", createdDaysAgo: d, quantity: 250 });
  }
  // 4 orders in the prior window, 1 recent → declining
  for (const d of [340, 300, 250, 210, 100]) {
    await job({ title: M.jobTitles.declining, companyId: declining.c.id, status: "DONE", createdDaysAgo: d, quantity: 1200 });
  }
  // quarterly, on rhythm → healthy
  for (const d of [380, 290, 200, 110, 20]) {
    await job({ title: M.jobTitles.quarterly, companyId: quarterly.c.id, status: d === 20 ? "SHIPPING" : "DONE", createdDaysAgo: d, quantity: 5000, sizeName: "A5" });
  }
  // 60-day cadence, 75 days silent → mildly due
  for (const d of [255, 195, 135, 75]) {
    await job({ title: M.jobTitles.sixtyDay(Math.round(d / 60)), companyId: sixtyDay.c.id, status: "DONE", createdDaysAgo: d, quantity: 800 });
  }

  // Active production board coverage (NOT the monthly customer — an
  // active job would reset their 50-day reorder story)
  const boardJobs = [
    { title: M.jobTitles.boardNew, companyId: newCustomer.c.id, status: "DESIGN" as const, quantity: 60, sizeName: "70x100", dueInDays: 12 },
    { title: M.jobTitles.boardNonprofit, companyId: nonprofit.c.id, status: "PROOFING" as const, quantity: 10000, sizeName: "A5", dueInDays: 8 },
    { title: M.jobTitles.boardAgency, companyId: agency.c.id, status: "PREPRESS" as const, quantity: 2500, dueInDays: 6 },
    { title: M.jobTitles.boardQuarterlyRush, companyId: quarterly.c.id, status: "PRINTING" as const, quantity: 40000, sizeName: "A5", dueInDays: 4, rush: true },
    { title: M.jobTitles.boardDeclining, companyId: declining.c.id, status: "FINISHING" as const, quantity: 300, finish: "perfect bind", dueInDays: 3 },
  ];
  const activeJobs = [];
  for (const b of boardJobs) {
    activeJobs.push(
      await job({ ...b, createdDaysAgo: 5, pressId: b.status === "PRINTING" ? sm74.id : iridesse.id }),
    );
  }

  // Schedule blocks — this week, non-overlapping per press
  const printing = activeJobs.find((j) => j.status === "PRINTING");
  const prepress = activeJobs.find((j) => j.status === "PREPRESS");
  if (printing) {
    await t.scheduleBlock.create({
      data: { ...org, pressId: sm74.id, jobId: printing.id, startsAt: daysAhead(1), endsAt: new Date(now + 1.3 * 86_400_000), note: "Rush leaflet run" },
    });
  }
  if (prepress) {
    await t.scheduleBlock.create({
      data: { ...org, pressId: iridesse.id, jobId: prepress.id, startsAt: daysAhead(2), endsAt: new Date(now + 2.4 * 86_400_000), note: "Stationery suite digital run" },
    });
  }

  // ── Kanban leads across every stage ────────────────────────────
  await t.lead.createMany({
    data: [
      { ...org, title: "Trade-fair booth graphics", stage: "QUOTE_REQUESTED", companyId: sixtyDay.c.id, contactId: sixtyDay.contact.id, value: 45000, source: "referral" },
      { ...org, title: "Loyalty punch cards", stage: "QUOTE_REQUESTED", companyId: monthly.c.id, contactId: monthly.contact.id, value: 9500, source: "email" },
      { ...org, title: "Window graphics — 4 storefronts", stage: "QUOTED", companyId: newCustomer.c.id, contactId: newCustomer.contact.id, value: 38000, source: "walk-in" },
      { ...org, title: "Fundraising direct mail", stage: "QUOTED", companyId: nonprofit.c.id, contactId: nonprofit.contact.id, value: 72000, source: "repeat-client" },
      { ...org, title: "Compliance leaflet reprint", stage: "APPROVED", companyId: quarterly.c.id, contactId: quarterly.contact.id, value: 54000, source: "email" },
      { ...org, title: "Client campaign — outdoor 6-sheet", stage: "IN_PRODUCTION", companyId: agency.c.id, contactId: agency.contact.id, value: 120000, source: "reseller" },
      { ...org, title: "Seasonal menu print", stage: "DELIVERED", companyId: monthly.c.id, contactId: monthly.contact.id, value: 16000, source: "repeat-client" },
      { ...org, title: "Tenant newsletter Q1", stage: "REPEAT", companyId: declining.c.id, contactId: declining.contact.id, value: 22000, source: "repeat-client" },
    ],
  });

  // ── Quotes / invoices / payments ───────────────────────────────
  const tax = (sub: number) => Math.round(sub * M.taxRate);
  const gross = (sub: number) => sub + tax(sub);
  await t.quote.create({
    data: {
      ...org, quoteNumber: 1101, companyId: newCustomer.c.id, status: "SENT", priceTierId: standardTier.id,
      subtotal: 30400, taxRate: M.taxRate, taxAmount: tax(30400), total: gross(30400), validUntil: daysAhead(21),
      lineItems: { create: [
        { ...org, description: "Window graphics, printed + laminated vinyl", quantity: 4, unitPrice: 6200, total: 24800, sortOrder: 1 },
        { ...org, description: "On-site installation", quantity: 4, unitPrice: 1400, total: 5600, sortOrder: 2 },
      ] },
    },
  });
  await t.quote.create({
    data: {
      ...org, quoteNumber: 1102, companyId: nonprofit.c.id, status: "DRAFT", priceTierId: standardTier.id,
      subtotal: 57600, taxRate: M.taxRate, taxAmount: tax(57600), total: gross(57600),
      lineItems: { create: [
        { ...org, description: "DM package: envelope + letter + response card, 24k sets", quantity: 24000, unitPrice: 2.4, total: 57600, sortOrder: 1 },
      ] },
    },
  });
  const quoteAccepted = await t.quote.create({
    data: {
      ...org, quoteNumber: 1103, companyId: quarterly.c.id, status: "ACCEPTED", priceTierId: standardTier.id,
      subtotal: 43200, taxRate: M.taxRate, taxAmount: tax(43200), total: gross(43200),
      lineItems: { create: [
        { ...org, description: "Pharmacy compliance leaflets, A5, 4/4", quantity: 40000, unitPrice: 0.95, total: 38000, sortOrder: 1 },
        { ...org, description: "Shelf-edge labels", quantity: 5200, unitPrice: 1, total: 5200, sortOrder: 2 },
      ] },
    },
  });

  const paidInvoice = await t.invoice.create({
    data: { ...org, invoiceNumber: 3101, companyId: monthly.c.id, status: "PAID", subtotal: 12800, taxAmount: tax(12800), total: gross(12800), issuedAt: daysAgo(45), dueDate: daysAgo(15) },
  });
  await t.payment.create({
    data: { ...org, invoiceId: paidInvoice.id, amount: gross(12800), method: "BANK_TRANSFER", reference: "Seasonal menus" },
  });
  await t.invoice.create({
    data: { ...org, invoiceNumber: 3102, companyId: declining.c.id, status: "OVERDUE", subtotal: 17600, taxAmount: tax(17600), total: gross(17600), issuedAt: daysAgo(50), dueDate: daysAgo(20) },
  });
  await t.invoice.create({
    data: { ...org, invoiceNumber: 3103, companyId: quarterly.c.id, quoteId: quoteAccepted.id, status: "SENT", subtotal: 43200, taxAmount: tax(43200), total: gross(43200), depositAmount: Math.round(gross(43200) / 2), issuedAt: daysAgo(3), dueDate: daysAhead(27) },
  });

  // ── Prospects + source run ─────────────────────────────────────
  const p = M.permitProspect;
  await t.lead.createMany({
    data: [
      {
        ...org,
        title: `New business licence — ${p.businessName}`,
        stage: "PROSPECT",
        prospectSource: "PERMIT",
        triggerReason: `New business licence — ${p.category}`,
        category: p.category,
        externalId: `seed-permit-${MARKET}-0001`,
        normalizedName: p.businessName.toLowerCase().replace(/ (ab|llc)$/, ""),
        locationKey: `${p.businessName.toLowerCase()}|${p.address.toLowerCase()}|${p.postal}`,
        addressLine1: p.address,
        city: p.city,
        postalCode: p.postal,
        country: M.country,
        notes: p.businessName,
        enrichmentStatus: "PENDING",
        score: 78,
        scoreBreakdown: [
          { factor: "recency", points: 40, detail: "16d old, half-life 30d" },
          { factor: "category-fit", points: 35, detail: "fit 100%" },
          { factor: "repeat-signal", points: 3, detail: "signal strength 60%" },
        ],
        rationale: "recency: +40 (16d old); category-fit: +35; repeat-signal: +3",
        signal: { permitNo: `2026-${MARKET}-0001`, kind: "food service" },
        triggeredAt: daysAgo(16),
        discoveredAt: new Date(),
      },
      {
        ...org,
        title: "FDA approval — Lumivex (tablet)",
        stage: "PROSPECT",
        prospectSource: "FDA",
        triggerReason: "FDA approval — Lumivex (tablet)",
        category: "pharma",
        externalId: "NDA099999:ORIG1",
        normalizedName: "helix therapeutics",
        notes: "Helix Therapeutics Inc",
        enrichmentStatus: "SKIPPED",
        score: 62,
        scoreBreakdown: [
          { factor: "recency", points: 25, detail: "21d old, half-life 45d" },
          { factor: "category-fit", points: 45, detail: "fit 100%" },
          { factor: "repeat-signal", points: 20, detail: "ORIG approval" },
        ],
        rationale: "recency: +25; category-fit: +45; repeat-signal: +20 (ORIG approval)",
        signal: { applicationNumber: "NDA099999", brandName: "Lumivex", dosageForm: "TABLET", marketingStatus: "Prescription", isOriginal: true },
        triggeredAt: daysAgo(21),
        discoveredAt: new Date(),
      },
    ],
  });
  await t.sourceRun.create({
    data: { ...org, source: "FDA", status: "SUCCEEDED", cursor: "20260730", fetched: 2, created: 2, duplicates: 0, screenedOut: 0, enriched: 0, finishedAt: new Date() },
  });

  // ── Activity trail ─────────────────────────────────────────────
  await t.activityLog.createMany({
    data: [
      { ...org, type: "QUOTE_SENT", summary: `Quote #1101 sent to ${M.newCustomer.name}`, contactId: newCustomer.contact.id },
      { ...org, type: "CALL", summary: `Call with ${M.quarterly.contact.firstName} — compliance leaflet specs confirmed`, contactId: quarterly.contact.id },
      { ...org, type: "MEETING", summary: `Production sync with ${M.agency.name} on outdoor campaign`, contactId: agency.contact.id },
      { ...org, type: "EMAIL", summary: "Reminder sent for overdue invoice #3102", contactId: declining.contact.id },
      { ...org, type: "NOTE", summary: `${M.monthly.contact.firstName} hinted at a loyalty-card program`, contactId: monthly.contact.id },
    ],
  });

  console.log(
    `Rich demo data (${MARKET.toUpperCase()}, ${M.currency}) seeded for ${ORG_ID}: 8 companies, ${jobNo - 2100} jobs, 8 kanban leads, 2 prospects.`,
  );
  console.log(
    `Portal link: /portal/demo-portal-${orgTail}-${M.monthly.contact.firstName.toLowerCase()}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { getDb } = await import("../lib/db/client");
    await getDb().$disconnect();
  });
