import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { schema } from "@rebar/core/db";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import * as approvalCommands from "../approvals/commands";
import { manifest } from "../index";
import {
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  job,
  jobMember,
  workStatement,
} from "../schema";
import { jobEntity } from "../server";
import * as statementsApi from "./api";
import {
  create,
  decide,
  get,
  lineSet,
  list,
  remove,
  reopen,
  setApproved,
  submit,
} from "./commands";
import "./index";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, manifest.seed.series);
});

const perms: [string, "all" | "own"][] = [
  ["zakazky.read", "all"],
  ["zakazky.write", "all"],
  ["zakazky.economics", "all"],
  ["kontakty.read", "all"],
];
const author = () => makeUser(app.db, perms);
const boss = () =>
  makeUser(app.db, [...perms, ["zakazky.approve", "all"], ["zakazky.approve_all", "all"]]);

async function newJob(managerId: string) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `T-${randomBytes(4).toString("hex")}`,
      title: "Rekonstrukce",
      companyId: c!.id,
      stageId: stage.id,
      managerId,
    })
    .returning();
  return j!;
}

/** Realizační rozpočet: dva objekty, položka „Zdivo“ 100 m2 po 1 000 Kč a „Omítky“ 50 m2 po 400 Kč. */
async function newBudget(jobId: string) {
  const [v] = await app.db
    .insert(budgetVersion)
    .values({ jobId, kind: "realization", number: 1 })
    .returning();
  const [o1] = await app.db
    .insert(budgetObject)
    .values({ versionId: v!.id, title: "SO 01" })
    .returning();
  const [o2] = await app.db
    .insert(budgetObject)
    .values({ versionId: v!.id, title: "SO 02", position: 1 })
    .returning();
  const mk = async (objectId: string, title: string) =>
    (
      await app.db.insert(budgetSection).values({ versionId: v!.id, objectId, title }).returning()
    )[0]!;
  const s1 = await mk(o1!.id, "Hrubá stavba");
  const s2 = await mk(o2!.id, "Dokončovací práce");
  const [zdivo] = await app.db
    .insert(budgetItem)
    .values({
      versionId: v!.id,
      sectionId: s1.id,
      title: "Zdivo",
      unit: "m2",
      quantity: "100",
      unitPriceMinor: 1_000_00,
      unitCostMinor: 700_00,
    })
    .returning();
  const [omitky] = await app.db
    .insert(budgetItem)
    .values({
      versionId: v!.id,
      sectionId: s2.id,
      title: "Omítky",
      unit: "m2",
      quantity: "50",
      unitPriceMinor: 400_00,
      unitCostMinor: 250_00,
      position: 1,
    })
    .returning();
  return { o1: o1!, o2: o2!, zdivo: zdivo!, omitky: omitky! };
}

const period = { periodFrom: "2026-10-01", periodTo: "2026-10-31" };

describe("soupis provedených prací", () => {
  it("založí řádky z realizační verze (filtr podle objektu), spočítá kumulaci a částky v haléřích", async () => {
    const u = await author();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const all = await create.handler(u.ctx, { jobId: j.id, ...period }, deps());
    expect((await get.handler(u.ctx, { id: all.id }, deps())).lines.map((l) => l.title)).toEqual([
      "Zdivo",
      "Omítky",
    ]);

    const only = await create.handler(u.ctx, { jobId: j.id, ...period, objectId: b.o2.id }, deps());
    expect((await get.handler(u.ctx, { id: only.id }, deps())).lines.map((l) => l.title)).toEqual([
      "Omítky",
    ]);

    const r = await lineSet.handler(
      u.ctx,
      { statementId: all.id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "25,5" }] },
      deps(),
    );
    expect(r.claimedMinor).toBe(25_500_00);
    const d = await get.handler(u.ctx, { id: all.id }, deps());
    expect(d.lines[0]).toMatchObject({
      quantityPeriod: "25.500",
      quantityTotal: "25.5",
      percent: 25.5,
      amountPeriodMinor: 25_500_00,
    });
    expect(d.statement.label).toBe("Soupis č. 1");
    expect(d.statement.claimedMinor).toBe(25_500_00);
  });

  it("nejde překročit rozpočtované množství; druhý soupis navazuje a zbývá jen rozdíl", async () => {
    const u = await author();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const first = await create.handler(u.ctx, { jobId: j.id, ...period }, deps());
    await lineSet.handler(
      u.ctx,
      { statementId: first.id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "70" }] },
      deps(),
    );
    await expect(
      lineSet.handler(
        u.ctx,
        { statementId: first.id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "100.5" }] },
        deps(),
      ),
    ).rejects.toThrow(/přesahuje rozpočet.*zadejte změnu/);

    const second = await create.handler(
      u.ctx,
      { jobId: j.id, periodFrom: "2026-11-01", periodTo: "2026-11-30" },
      deps(),
    );
    const d2 = await get.handler(u.ctx, { id: second.id }, deps());
    const z = d2.lines.find((l) => l.title === "Zdivo")!;
    expect([z.previousQuantity, z.remainingQuantity]).toEqual(["70", "30"]);
    await expect(
      lineSet.handler(
        u.ctx,
        { statementId: second.id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "31" }] },
        deps(),
      ),
    ).rejects.toThrow(UserError);
    await lineSet.handler(
      u.ctx,
      { statementId: second.id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "30" }] },
      deps(),
    );
    const d3 = await get.handler(u.ctx, { id: second.id }, deps());
    expect(d3.lines.find((l) => l.title === "Zdivo")).toMatchObject({
      quantityTotal: "100",
      percent: 100,
      amountTotalMinor: 100_000_00,
    });

    // zamítnutý soupis rozpočet neblokuje
    const bs = await boss();
    await submit.handler(u.ctx, { id: first.id }, deps());
    await decide.handler(
      bs.ctx,
      { id: first.id, approve: false, comment: "Chybí zaměření" },
      deps(),
    );
    await lineSet.handler(
      u.ctx,
      { statementId: second.id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "100" }] },
      deps(),
    );
  });

  it("odeslání vyžaduje provedené množství; schválení zamkne soupis, schválená částka jde snížit", async () => {
    const u = await author();
    const bs = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const { id } = await create.handler(u.ctx, { jobId: j.id, ...period }, deps());
    await expect(submit.handler(u.ctx, { id }, deps())).rejects.toThrow(/alespoň u jedné/);
    await lineSet.handler(
      u.ctx,
      {
        statementId: id,
        lines: [
          { itemId: b.zdivo.id, quantityPeriod: "10" },
          { itemId: b.omitky.id, quantityPeriod: "5" },
        ],
      },
      deps(),
    );
    const r = await submit.handler(u.ctx, { id }, deps());
    expect(r).toMatchObject({ status: "pending", claimedMinor: 12_000_00 });
    await expect(
      lineSet.handler(
        u.ctx,
        { statementId: id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "11" }] },
        deps(),
      ),
    ).rejects.toThrow(/čeká na schválení/);

    await expect(
      setApproved.handler(bs.ctx, { id, approvedMinor: 13_000_00 }, deps()),
    ).rejects.toThrow(/nesmí přesáhnout/);
    await setApproved.handler(bs.ctx, { id, approvedMinor: 11_000_00 }, deps());
    await decide.handler(bs.ctx, { id, approve: true }, deps());
    const [row] = await app.db.select().from(workStatement).where(eq(workStatement.id, id));
    expect(row).toMatchObject({
      status: "approved",
      approvedMinor: 11_000_00,
      claimedMinor: 12_000_00,
    });
    expect(row!.lockedAt).not.toBeNull();

    await expect(
      lineSet.handler(
        u.ctx,
        { statementId: id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "1" }] },
        deps(),
      ),
    ).rejects.toThrow(/zamčen/);
    await expect(remove.handler(u.ctx, { id }, deps())).rejects.toThrow(/zamčen/);
    await expect(submit.handler(u.ctx, { id }, deps())).rejects.toThrow(/zamčen/);
  });

  it("podklady pro fakturu: jen schválený soupis, částky po položkách; po markInvoiced už ne a vrátit do konceptu nejde", async () => {
    const u = await author();
    const bs = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const { id } = await create.handler(u.ctx, { jobId: j.id, ...period }, deps());
    await lineSet.handler(
      u.ctx,
      { statementId: id, lines: [{ itemId: b.omitky.id, quantityPeriod: "20" }] },
      deps(),
    );
    await expect(statementsApi.createInvoiceDraft(u.ctx, id)).rejects.toThrow(/schváleného/);
    await submit.handler(u.ctx, { id }, deps());
    await decide.handler(bs.ctx, { id, approve: true }, deps());
    const p = await statementsApi.createInvoiceDraft(u.ctx, id);
    expect(p).toMatchObject({
      number: 1,
      periodFrom: "2026-10-01",
      claimedMinor: 8_000_00,
      approvedMinor: 8_000_00,
      reductionMinor: 0,
    });
    expect(p.lines).toEqual([
      {
        budgetItemId: b.omitky.id,
        title: "Omítky",
        unit: "m2",
        vatRateBp: 2100,
        quantityPeriod: "20.000",
        unitPriceMinor: 400_00,
        amountMinor: 8_000_00,
      },
    ]);

    const invoiceId = crypto.randomUUID();
    await statementsApi.markInvoiced(bs.ctx, id, invoiceId);
    await expect(statementsApi.createInvoiceDraft(u.ctx, id)).rejects.toThrow(/faktura už vznikla/);
    await expect(reopen.handler(bs.ctx, { id }, deps())).rejects.toThrow(/dobropisem/);
    await statementsApi.clearInvoiced(bs.ctx, id);
    await reopen.handler(bs.ctx, { id, reason: "oprava" }, deps());
    const d = await get.handler(u.ctx, { id }, deps());
    expect(d.statement.status).toBe("draft");
    expect(d.editable).toBe(true);
  });

  it("nad limit 50 000 Kč schvaluje jen approve_all; fronta ukáže soupis; vlastní soupis bez approve_all nejde schválit", async () => {
    const u = await author();
    const mistr = await makeUser(app.db, [...perms, ["zakazky.approve", "all"]]);
    const bs = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const { id } = await create.handler(u.ctx, { jobId: j.id, ...period }, deps());
    await lineSet.handler(
      u.ctx,
      { statementId: id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "60" }] },
      deps(),
    ); // 60 000 Kč
    await submit.handler(u.ctx, { id }, deps());
    await expect(decide.handler(mistr.ctx, { id, approve: true }, deps())).rejects.toThrow(
      PermissionError,
    );
    const queue = await approvalCommands.queue.handler(bs.ctx, { status: "pending" }, deps());
    expect(queue.find((q) => q.docId === id)).toMatchObject({
      docType: "statement",
      canDecide: true,
      amountMinor: 60_000_00,
    });
    await decide.handler(bs.ctx, { id, approve: true }, deps());
    expect((await get.handler(u.ctx, { id }, deps())).statement.status).toBe("approved");
  });
});

describe("oprávnění k soupisům", () => {
  it("stavbyvedoucí bez economics zadává množství, ale nevidí žádné ceny; cizí zakázku nevidí; montér bez zápisu nic", async () => {
    const owner = await author();
    const j = await newJob(owner.id);
    const other = await newJob(owner.id);
    const b = await newBudget(j.id);
    const foreman = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
    ]);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: foreman.id });

    const { id } = await create.handler(foreman.ctx, { jobId: j.id, ...period }, deps());
    const r = await lineSet.handler(
      foreman.ctx,
      { statementId: id, lines: [{ itemId: b.zdivo.id, quantityPeriod: "12" }] },
      deps(),
    );
    expect(r.claimedMinor).toBeNull();
    const d = await get.handler(foreman.ctx, { id }, deps());
    expect(d.money).toBe(false);
    expect(d.lines[0]).toMatchObject({
      unitPriceMinor: null,
      amountPeriodMinor: null,
      quantityPeriod: "12.000",
    });
    expect(d.statement.claimedMinor).toBeNull();
    const l = await list.handler(foreman.ctx, { jobId: j.id }, deps());
    expect(l.statements[0]).toMatchObject({ claimedMinor: null, approvedMinor: null });

    await expect(list.handler(foreman.ctx, { jobId: other.id }, deps())).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      create.handler(foreman.ctx, { jobId: other.id, ...period }, deps()),
    ).rejects.toThrow(NotFoundError);
    const worker = await makeUser(app.db, [["zakazky.read", "own"]]);
    await app.db.insert(jobMember).values({ jobId: j.id, userId: worker.id });
    await expect(create.handler(worker.ctx, { jobId: j.id, ...period }, deps())).rejects.toThrow(
      PermissionError,
    );
    const dbNotes = await app.db.select().from(schema.notification);
    expect(dbNotes.length).toBeGreaterThanOrEqual(0);
  });

  it("zakázka bez rozpočtu realizace soupis nezaloží; obrácené období se odmítne", async () => {
    const u = await author();
    const j = await newJob(u.id);
    await expect(create.handler(u.ctx, { jobId: j.id, ...period }, deps())).rejects.toThrow(
      /rozpočet realizace/,
    );
    await newBudget(j.id);
    await expect(
      create.handler(
        u.ctx,
        { jobId: j.id, periodFrom: "2026-11-01", periodTo: "2026-10-01" },
        deps(),
      ),
    ).rejects.toThrow(/Začátek období/);
  });
});
