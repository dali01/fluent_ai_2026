import { describe, expect, it } from "vitest";
import {
  GLOBAL_MODELS,
  scopeTenantArgs,
  TENANT_MODELS,
  TenantIsolationError,
} from "@/lib/db/tenant-scope";

const ORG = "org_mine";
const OTHER_ORG = "org_theirs";

describe("scopeTenantArgs — reads", () => {
  it("scopes findMany with no where to the org", () => {
    const out = scopeTenantArgs("Contact", "findMany", undefined, ORG);
    expect(out.where).toEqual({ organizationId: ORG });
  });

  it("ANDs the org filter with the caller's where (caller cannot widen it)", () => {
    const out = scopeTenantArgs(
      "Contact",
      "findMany",
      { where: { OR: [{ email: "a@b.c" }, { organizationId: undefined }] } },
      ORG,
    );
    expect(out.where).toEqual({
      AND: [
        { organizationId: ORG },
        { OR: [{ email: "a@b.c" }, { organizationId: undefined }] },
      ],
    });
  });

  it("throws when where names a different organizationId", () => {
    expect(() =>
      scopeTenantArgs(
        "Contact",
        "findMany",
        { where: { organizationId: OTHER_ORG } },
        ORG,
      ),
    ).toThrow(TenantIsolationError);
  });

  it("allows where naming the SAME organizationId", () => {
    const out = scopeTenantArgs(
      "Contact",
      "findMany",
      { where: { organizationId: ORG } },
      ORG,
    );
    expect(out.where).toEqual({
      AND: [{ organizationId: ORG }, { organizationId: ORG }],
    });
  });

  it("extends findUnique's unique where with the org (extended where unique)", () => {
    const out = scopeTenantArgs(
      "Job",
      "findUnique",
      { where: { id: "job_1" } },
      ORG,
    );
    expect(out.where).toEqual({ id: "job_1", organizationId: ORG });
  });

  it("scopes count/aggregate/groupBy", () => {
    for (const op of ["count", "aggregate", "groupBy"]) {
      const out = scopeTenantArgs("Invoice", op, {}, ORG);
      expect(out.where).toEqual({ organizationId: ORG });
    }
  });
});

describe("scopeTenantArgs — creates", () => {
  it("stamps organizationId on create data", () => {
    const out = scopeTenantArgs(
      "Company",
      "create",
      { data: { name: "Acme Print" } },
      ORG,
    );
    expect(out.data).toEqual({ name: "Acme Print", organizationId: ORG });
  });

  it("throws when create data names a different organizationId", () => {
    expect(() =>
      scopeTenantArgs(
        "Company",
        "create",
        { data: { name: "Sneaky", organizationId: OTHER_ORG } },
        ORG,
      ),
    ).toThrow(TenantIsolationError);
  });

  it("throws when create data sets the organization relation directly", () => {
    expect(() =>
      scopeTenantArgs(
        "Company",
        "create",
        {
          data: {
            name: "Sneaky",
            organization: { connect: { id: OTHER_ORG } },
          },
        },
        ORG,
      ),
    ).toThrow(TenantIsolationError);
  });

  it("stamps every row of createMany", () => {
    const out = scopeTenantArgs(
      "Contact",
      "createMany",
      {
        data: [
          { firstName: "A", lastName: "B" },
          { firstName: "C", lastName: "D" },
        ],
      },
      ORG,
    );
    expect(out.data).toEqual([
      { firstName: "A", lastName: "B", organizationId: ORG },
      { firstName: "C", lastName: "D", organizationId: ORG },
    ]);
  });

  it("rejects createMany when any row names another org", () => {
    expect(() =>
      scopeTenantArgs(
        "Contact",
        "createMany",
        {
          data: [
            { firstName: "A", lastName: "B" },
            { firstName: "C", lastName: "D", organizationId: OTHER_ORG },
          ],
        },
        ORG,
      ),
    ).toThrow(TenantIsolationError);
  });
});

describe("scopeTenantArgs — updates & deletes", () => {
  it("update by raw id cannot reach another org's row (org added to unique where)", () => {
    const out = scopeTenantArgs(
      "Job",
      "update",
      { where: { id: "job_belonging_to_other_org" }, data: { title: "x" } },
      ORG,
    );
    expect(out.where).toEqual({
      id: "job_belonging_to_other_org",
      organizationId: ORG,
    });
  });

  it("update cannot move a row to another tenant", () => {
    expect(() =>
      scopeTenantArgs(
        "Job",
        "update",
        { where: { id: "job_1" }, data: { organizationId: OTHER_ORG } },
        ORG,
      ),
    ).toThrow(TenantIsolationError);
    expect(() =>
      scopeTenantArgs(
        "Job",
        "update",
        {
          where: { id: "job_1" },
          data: { organizationId: { set: OTHER_ORG } },
        },
        ORG,
      ),
    ).toThrow(TenantIsolationError);
  });

  it("updateMany/deleteMany are scoped", () => {
    const upd = scopeTenantArgs(
      "Lead",
      "updateMany",
      { where: { stage: "QUOTED" }, data: { stage: "APPROVED" } },
      ORG,
    );
    expect(upd.where).toEqual({
      AND: [{ organizationId: ORG }, { stage: "QUOTED" }],
    });

    const del = scopeTenantArgs("Lead", "deleteMany", {}, ORG);
    expect(del.where).toEqual({ organizationId: ORG });
  });

  it("delete by raw id is org-fenced", () => {
    const out = scopeTenantArgs(
      "Invoice",
      "delete",
      { where: { id: "inv_1" } },
      ORG,
    );
    expect(out.where).toEqual({ id: "inv_1", organizationId: ORG });
  });

  it("upsert fences where and stamps create data", () => {
    const out = scopeTenantArgs(
      "LeadScore",
      "upsert",
      {
        where: {
          organizationId_companyId: { organizationId: ORG, companyId: "c1" },
        },
        create: { companyId: "c1", churnRisk: 0.2 },
        update: { churnRisk: 0.2 },
      },
      ORG,
    );
    expect(out.where).toEqual({
      organizationId_companyId: { organizationId: ORG, companyId: "c1" },
      organizationId: ORG,
    });
    expect(out.create).toEqual({
      companyId: "c1",
      churnRisk: 0.2,
      organizationId: ORG,
    });
  });
});

describe("scopeTenantArgs — fail-closed guarantees", () => {
  it("refuses global models (User)", () => {
    for (const model of GLOBAL_MODELS) {
      expect(() => scopeTenantArgs(model, "findMany", {}, ORG)).toThrow(
        TenantIsolationError,
      );
    }
  });

  it("refuses the Organization model", () => {
    expect(() => scopeTenantArgs("Organization", "findMany", {}, ORG)).toThrow(
      TenantIsolationError,
    );
  });

  it("refuses models it does not know", () => {
    expect(() => scopeTenantArgs("BrandNewModel", "findMany", {}, ORG)).toThrow(
      TenantIsolationError,
    );
  });

  it("refuses unknown operations (fail closed for future Prisma ops / raw)", () => {
    expect(() => scopeTenantArgs("Contact", "$queryRaw", {}, ORG)).toThrow(
      TenantIsolationError,
    );
    expect(() =>
      scopeTenantArgs("Contact", "someFutureOperation", {}, ORG),
    ).toThrow(TenantIsolationError);
  });

  it("covers every tenant model", () => {
    // Every model in the set scopes cleanly — no model silently bypasses.
    for (const model of TENANT_MODELS) {
      const out = scopeTenantArgs(model, "findMany", undefined, ORG);
      expect(out.where).toEqual({ organizationId: ORG });
    }
  });
});
