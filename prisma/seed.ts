/**
 * Seed: one demo organization with realistic print-shop data.
 *
 * Run: pnpm db:seed   (needs DATABASE_URL; optionally SEED_ORG_ID /
 * SEED_ORG_NAME to seed into a real Clerk org instead of the demo one)
 *
 * Goes through tenantDb() for all tenant data, so every seed run also
 * exercises the isolation layer end-to-end. Note: generated Prisma types
 * still require organizationId in create inputs (the extension can't
 * change input types), so we pass ORG_ID explicitly — the tenant layer
 * throws if it ever differs from the active org.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import { getDb } from "../lib/db/client";
import { tenantDb } from "../lib/db/tenant";

const ORG_ID = process.env.SEED_ORG_ID ?? "org_demo_fluent";
const ORG_NAME = process.env.SEED_ORG_NAME ?? "Demo Print Co";
const org = { organizationId: ORG_ID };

async function main() {
  const db = getDb();

  // ── Organization + users (global models — raw client) ─────────
  await db.organization.upsert({
    where: { id: ORG_ID },
    create: {
      id: ORG_ID,
      name: ORG_NAME,
      slug: ORG_ID === "org_demo_fluent" ? "demo-print-co" : null,
    },
    update: { name: ORG_NAME },
  });

  const owner = await db.user.upsert({
    where: { email: "owner@demoprint.example" },
    create: {
      id: "user_demo_owner",
      email: "owner@demoprint.example",
      name: "Olivia Owner",
    },
    update: {},
  });
  const csr = await db.user.upsert({
    where: { email: "csr@demoprint.example" },
    create: {
      id: "user_demo_csr",
      email: "csr@demoprint.example",
      name: "Casey Csr",
    },
    update: {},
  });

  // ── Everything below is tenant-scoped ──────────────────────────
  const t = tenantDb(ORG_ID);

  await t.membership.upsert({
    where: {
      organizationId_userId: { organizationId: ORG_ID, userId: owner.id },
    },
    create: { ...org, userId: owner.id, role: "OWNER" },
    update: { role: "OWNER" },
  });
  await t.membership.upsert({
    where: {
      organizationId_userId: { organizationId: ORG_ID, userId: csr.id },
    },
    create: { ...org, userId: csr.id, role: "CSR" },
    update: { role: "CSR" },
  });

  // Price tiers
  const standardTier = await t.priceTier.upsert({
    where: {
      organizationId_name: { organizationId: ORG_ID, name: "Standard" },
    },
    create: { ...org, name: "Standard", multiplier: 1 },
    update: {},
  });
  const resellerTier = await t.priceTier.upsert({
    where: {
      organizationId_name: { organizationId: ORG_ID, name: "Reseller" },
    },
    create: { ...org, name: "Reseller", multiplier: 0.8, isResellerTier: true },
    update: {},
  });

  // Pricing rules (skip if any exist)
  const existingRules = await t.pricingRule.count();
  if (existingRules === 0) {
    await t.pricingRule.createMany({
      data: [
        {
          ...org,
          name: "Flyer quantity breaks",
          type: "QUANTITY_TIER",
          config: {
            tiers: [
              { minQty: 0, unitPrice: 4 },
              { minQty: 1000, unitPrice: 2.5 },
              { minQty: 5000, unitPrice: 1.8 },
            ],
          },
        },
        {
          ...org,
          name: "Silk stock surcharge",
          type: "STOCK",
          config: { stock: "silk", surchargePerUnit: 0.3 },
        },
        {
          ...org,
          name: "Laminate finishing",
          type: "FINISHING",
          config: { finish: "laminate", perUnit: 0.5, flat: 200 },
        },
        {
          ...org,
          name: "Rush surcharge 25%",
          type: "RUSH_FEE",
          config: { percent: 25, flat: 0 },
        },
        {
          ...org,
          name: "Press setup",
          type: "SETUP_FEE",
          config: { flat: 500 },
        },
      ],
    });
  }

  // Demo portal access for Clara (City Festival has jobs to show)
  async function ensurePortalToken() {
    const clara = await t.contact.findFirst({
      where: { email: "clara@cityfest.example" },
    });
    const token = `demo-portal-${ORG_ID.slice(-12)}-clara`;
    if (clara && clara.portalToken !== token) {
      await t.contact.update({
        where: { id: clara.id },
        data: { portalToken: token },
      });
      console.log(`Portal link: /portal/${token}`);
    }
  }

  // Companies (idempotent-ish: skip if any exist)
  const existingCompanies = await t.company.count();
  if (existingCompanies > 0) {
    await ensurePortalToken();
    console.log("Seed: companies already present, skipping business data.");
    return;
  }

  const nordic = await t.company.create({
    data: {
      ...org,
      name: "Nordic Coffee Roasters",
      email: "hello@nordicroasters.example",
      city: "Jönköping",
      country: "SE",
      tags: ["retail", "packaging"],
      priceTierId: standardTier.id,
    },
  });
  const brandhouse = await t.company.create({
    data: {
      ...org,
      name: "Brandhouse Agency",
      email: "print@brandhouse.example",
      city: "Göteborg",
      country: "SE",
      isReseller: true,
      tags: ["agency"],
      priceTierId: resellerTier.id,
    },
  });
  const cityFest = await t.company.create({
    data: {
      ...org,
      name: "City Festival AB",
      email: "info@cityfest.example",
      city: "Stockholm",
      country: "SE",
      tags: ["events", "seasonal"],
      priceTierId: standardTier.id,
    },
  });

  const [anna, bjorn, clara] = await Promise.all([
    t.contact.create({
      data: {
        ...org,
        companyId: nordic.id,
        firstName: "Anna",
        lastName: "Lindqvist",
        email: "anna@nordicroasters.example",
        title: "Marketing Manager",
        tags: ["decision-maker"],
      },
    }),
    t.contact.create({
      data: {
        ...org,
        companyId: brandhouse.id,
        firstName: "Björn",
        lastName: "Ek",
        email: "bjorn@brandhouse.example",
        title: "Production Buyer",
      },
    }),
    t.contact.create({
      data: {
        ...org,
        companyId: cityFest.id,
        firstName: "Clara",
        lastName: "Nilsson",
        email: "clara@cityfest.example",
        title: "Event Coordinator",
      },
    }),
  ]);

  // Pipeline
  await t.lead.createMany({
    data: [
      {
        ...org,
        title: "Coffee bag labels — spring blend",
        stage: "QUOTE_REQUESTED",
        companyId: nordic.id,
        contactId: anna.id,
        value: 18500,
        source: "email",
      },
      {
        ...org,
        title: "Client rebrand collateral (via Brandhouse)",
        stage: "QUOTED",
        companyId: brandhouse.id,
        contactId: bjorn.id,
        value: 64000,
        source: "reseller",
      },
      {
        ...org,
        title: "Festival wayfinding signage",
        stage: "IN_PRODUCTION",
        companyId: cityFest.id,
        contactId: clara.id,
        value: 92000,
        source: "repeat-client",
      },
    ],
  });

  // Presses & inventory
  const sm74 = await t.press.create({
    data: { ...org, name: "Heidelberg SM 74", kind: "offset" },
  });
  await t.press.create({
    data: { ...org, name: "HP Indigo 7900", kind: "digital" },
  });
  const silk170 = await t.inventoryItem.create({
    data: {
      ...org,
      name: "Silk 170gsm 720x1020",
      type: "PAPER",
      unit: "sheet",
      quantityOnHand: 14000,
      reorderThreshold: 5000,
      costPerUnit: 0.42,
    },
  });
  await t.inventoryItem.create({
    data: {
      ...org,
      name: "Process ink CMYK set",
      type: "INK",
      unit: "kg",
      quantityOnHand: 36,
      reorderThreshold: 12,
      costPerUnit: 210,
    },
  });

  // A quote with line items → job in production
  const quote = await t.quote.create({
    data: {
      ...org,
      quoteNumber: 1001,
      companyId: cityFest.id,
      status: "ACCEPTED",
      priceTierId: standardTier.id,
      subtotal: 73600,
      taxRate: 0.25,
      taxAmount: 18400,
      total: 92000,
      lineItems: {
        create: [
          {
            ...org,
            description: "A0 wayfinding boards, 4/0, laminated",
            quantity: 40,
            unitPrice: 1450,
            total: 58000,
            sortOrder: 1,
          },
          {
            ...org,
            description: "Site map A1 posters",
            quantity: 120,
            unitPrice: 130,
            total: 15600,
            sortOrder: 2,
          },
        ],
      },
    },
  });

  const job = await t.job.create({
    data: {
      ...org,
      jobNumber: 2001,
      title: "City Festival wayfinding signage",
      status: "PRINTING",
      companyId: cityFest.id,
      quoteId: quote.id,
      pressId: sm74.id,
      stock: "Silk 170gsm",
      sizeName: "A0",
      colorMode: "CMYK",
      finish: "matte laminate",
      quantity: 40,
      bleedMm: 3,
      dueDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    },
  });

  await t.scheduleBlock.create({
    data: {
      ...org,
      pressId: sm74.id,
      jobId: job.id,
      startsAt: new Date(Date.now() + 24 * 3600 * 1000),
      endsAt: new Date(Date.now() + 32 * 3600 * 1000),
      note: "Festival signage run",
    },
  });

  await t.stockMovement.create({
    data: {
      ...org,
      inventoryItemId: silk170.id,
      jobId: job.id,
      delta: -1600,
      reason: "JOB_CONSUMPTION",
      note: "Wayfinding boards run",
    },
  });
  await t.jobMaterial.create({
    data: {
      ...org,
      jobId: job.id,
      inventoryItemId: silk170.id,
      quantityPlanned: 1600,
    },
  });

  await t.vendor.create({
    data: {
      ...org,
      name: "FoilCraft AB",
      email: "orders@foilcraft.example",
      services: "foiling, embossing, die-cutting",
    },
  });

  // Invoice with 50% deposit paid
  const invoice = await t.invoice.create({
    data: {
      ...org,
      invoiceNumber: 3001,
      companyId: cityFest.id,
      quoteId: quote.id,
      jobId: job.id,
      status: "PARTIALLY_PAID",
      subtotal: 73600,
      taxAmount: 18400,
      total: 92000,
      depositAmount: 46000,
      issuedAt: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });
  await t.payment.create({
    data: {
      ...org,
      invoiceId: invoice.id,
      amount: 46000,
      method: "BANK_TRANSFER",
      isDeposit: true,
      reference: "Deposit 50%",
    },
  });

  await t.activityLog.createMany({
    data: [
      {
        ...org,
        type: "QUOTE_SENT",
        summary: "Quote #1001 sent to City Festival AB",
        contactId: clara.id,
        actorId: csr.id,
      },
      {
        ...org,
        type: "STATUS_CHANGE",
        summary: "Job #2001 moved to PRINTING",
        jobId: job.id,
        actorId: owner.id,
      },
      {
        ...org,
        type: "PAYMENT_RECEIVED",
        summary: "50% deposit received for invoice #3001",
        actorId: csr.id,
      },
    ],
  });

  await ensurePortalToken();
  console.log(`Seed complete for organization ${ORG_ID} (${ORG_NAME}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => getDb().$disconnect());
