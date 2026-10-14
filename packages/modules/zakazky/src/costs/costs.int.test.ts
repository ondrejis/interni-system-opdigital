import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { ZodType } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  registerEntityPolicies,
  type EntityRegistry,
} from "@rebar/core/entities";
import {
  setJobFinanceProviders,
  type CommandDef,
  type CostLine,
  type CostProvider,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest } from "../index";
import {
  budgetItem,
  budgetObject,
  budgetSection,
  budgetVersion,
  costAllocation,
  job,
  jobChange,
  jobCost,
  jobOrder,
} from "../schema";
import { jobEntity } from "../server";
import * as api from "./api";
import {
  costsAllocate,
  costsAutoAllocate,
  costsDelete,
  costsList,
  costsPlan,
  costsSave,
  costsTargets,
  summary,
} from "./commands";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
/** Poskytovatelé „ostatních modulů“: test je plní a `deps` je předává příkazům. */
const lines: CostLine[] = [];
let broken = false;
const providers: CostProvider[] = [
  { key: "test", costs: async () => lines },
  {
    key: "rozbity",
    costs: async () => {
      if (broken) throw new Error("modul spadl");
      return [];
    },
  },
];
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: providers,
    calendarLayers: [],
  }) as unknown as ModuleDeps;
const run = <S extends ZodType, R>(cmd: CommandDef<S, R>, ctx: Ctx, input: unknown) =>
  cmd.handler(ctx, cmd.input.parse(input) as never, deps());

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, manifest.seed.series);
});
beforeEach(() => {
  lines.length = 0;
  broken = false;
  setJobFinanceProviders({
    costProviders: providers,
    invoicing: [async () => ({ invoicedMinor: 300_000_00, paidMinor: 100_000_00 })],
  });
});

const perms: [string, "all" | "own"][] = [
  ["zakazky.read", "all"],
  ["zakazky.write", "all"],
  ["zakazky.economics", "all"],
  ["zakazky.budget", "all"],
  ["kontakty.read", "all"],
];
const boss = () => makeUser(app.db, perms);

async function newJob(managerId?: string, phase = "execution") {
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
      phase,
      valueMinor: 1_000_000_00,
      managerId: managerId ?? null,
    })
    .returning();
  return j!;
}

/**
 * Realizační rozpočet: Elektro (práce) 100 000 / 150 000, Materiál 50 000 / 70 000, dva oddíly „Ostatní“
 * (nejednoznačná kategorie) a Doprava bez kategorie.
 */
async function newBudget(jobId: string) {
  const [v] = await app.db
    .insert(budgetVersion)
    .values({ jobId, kind: "realization", number: 1, status: "draft" })
    .returning();
  const [o] = await app.db
    .insert(budgetObject)
    .values({ versionId: v!.id, title: "Celá zakázka", isDefault: true })
    .returning();
  const sec = async (title: string, costCategory: string | null, position: number) =>
    (
      await app.db
        .insert(budgetSection)
        .values({ versionId: v!.id, objectId: o!.id, title, costCategory, position })
        .returning()
    )[0]!;
  const elektro = await sec("Elektro", "labour", 0);
  const material = await sec("Materiál", "material", 1);
  const ostatniA = await sec("Ostatní A", "other", 2);
  const ostatniB = await sec("Ostatní B", "other", 3);
  const doprava = await sec("Doprava", null, 4);
  const item = async (sectionId: string, title: string, qty: string, cost: number, price: number) =>
    (
      await app.db
        .insert(budgetItem)
        .values({
          versionId: v!.id,
          sectionId,
          title,
          quantity: qty,
          unitCostMinor: cost,
          unitPriceMinor: price,
        })
        .returning()
    )[0]!;
  const iEl = await item(elektro.id, "Rozvody", "100", 1_000_00, 1_500_00);
  await item(material.id, "Kabely", "10", 5_000_00, 7_000_00);
  return { version: v!, elektro, material, ostatniA, ostatniB, doprava, iEl };
}

const labour = (ref: string, amountMinor: number, date = "2026-10-01"): CostLine => ({
  category: "labour",
  label: `Práce ${ref}`,
  amountMinor,
  source: "dochazka",
  ref,
  date,
});

describe("sjednocený seznam nákladů", () => {
  it("spojí ruční náklady a řádky poskytovatelů, chyba jednoho poskytovatele nic neshodí", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    lines.push(labour("t1", 40_000_00), {
      category: "material",
      label: "Výdejka V-1",
      amountMinor: 20_000_00,
      source: "sklad",
      ref: "d1",
      date: "2026-10-02",
    });
    // řádek přijaté faktury nese oddíl sám (párování ve faktuře)
    lines.push({
      category: "material",
      label: "FV1: kabely",
      amountMinor: 8_000_00,
      source: "faktura_prijata",
      ref: "l1",
      date: "2026-10-03",
      supplier: "Elektro s.r.o.",
      sectionId: b.material.id,
      href: "/fakturace/prijate/x",
    });
    await run(costsSave, u.ctx, {
      jobId: j.id,
      date: "2026-10-04",
      category: "subcontract",
      title: "Elektrikář",
      amountMinor: 5_000_00,
      supplierName: "Pan Novák",
      sectionId: b.elektro.id,
    });
    broken = true;
    const all = await run(costsList, u.ctx, { jobId: j.id });
    expect(all.rows.map((r) => [r.source, r.status])).toEqual([
      ["manual", "paired"], // 4. 10., podle data sestupně
      ["faktura_prijata", "paired"],
      ["sklad", "unpaired"],
      ["dochazka", "unpaired"],
    ]);
    expect(all.unpairedCount).toBe(2);
    expect(all.unpairedMinor).toBe(60_000_00);
    expect(all.allMinor).toBe(73_000_00);
    expect(all.sections.map((s) => s.label)).toContain("Elektro");
    expect(all.hasBudget).toBe(true);

    const unpaired = await run(costsList, u.ctx, { jobId: j.id, status: "unpaired" });
    expect(unpaired.rows).toHaveLength(2);
    const fromSklad = await run(costsList, u.ctx, { jobId: j.id, source: "sklad" });
    expect(fromSklad.rows.map((r) => r.label)).toEqual(["Výdejka V-1"]);
    const search = await run(costsList, u.ctx, { jobId: j.id, q: "novák" });
    expect(search.rows.map((r) => r.label)).toEqual(["Elektrikář"]);
  });

  it("zakázka bez rozpočtu: vše je nespárované a seznam funguje", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    lines.push(labour("t1", 1_000_00));
    const r = await run(costsList, u.ctx, { jobId: j.id });
    expect(r.hasBudget).toBe(false);
    expect(r.rows[0]!.status).toBe("unpaired");
    await expect(
      run(costsAllocate, u.ctx, {
        jobId: j.id,
        source: "dochazka",
        ref: "t1",
        parts: [{ sectionId: crypto.randomUUID() }],
      }),
    ).rejects.toThrow(UserError);
  });
});

describe("párování", () => {
  it("spáruje, přepáruje, rozpadne na víc oddílů a zruší; chybný součet a cizí položka se odmítnou", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    lines.push(labour("t1", 40_000_00));
    const alloc = (parts: unknown[]) =>
      run(costsAllocate, u.ctx, { jobId: j.id, source: "dochazka", ref: "t1", parts });
    const stateOf = async () => (await run(costsList, u.ctx, { jobId: j.id })).rows[0]!;

    await alloc([{ sectionId: b.elektro.id, itemId: b.iEl.id }]);
    expect(await stateOf()).toMatchObject({ status: "paired" });
    await alloc([{ sectionId: b.material.id }]);
    expect((await stateOf()).allocations).toEqual([
      { sectionId: b.material.id, itemId: null, amountMinor: null },
    ]);

    await alloc([
      { sectionId: b.elektro.id, amountMinor: 25_000_00 },
      { sectionId: b.material.id, amountMinor: 15_000_00 },
    ]);
    expect((await stateOf()).allocations).toHaveLength(2);
    await expect(
      alloc([
        { sectionId: b.elektro.id, amountMinor: 25_000_00 },
        { sectionId: b.material.id, amountMinor: 10_000_00 },
      ]),
    ).rejects.toThrow(/Součet částí/);
    await expect(alloc([{ sectionId: b.material.id, itemId: b.iEl.id }])).rejects.toThrow(
      /nepatří do vybraného oddílu/,
    );
    // po chybě zůstalo původní párování
    expect((await stateOf()).allocations).toHaveLength(2);

    const plan = await run(costsPlan, u.ctx, { jobId: j.id });
    const byTitle = Object.fromEntries(plan.objects[0]!.sections.map((s) => [s.title, s.metrics]));
    expect(byTitle["Elektro"]).toMatchObject({
      actualMinor: 25_000_00,
      plannedCostMinor: 100_000_00,
    });
    expect(byTitle["Materiál"]).toMatchObject({
      actualMinor: 15_000_00,
      plannedCostMinor: 50_000_00,
    });
    expect(plan.totals.actualMinor).toBe(40_000_00);
    expect(plan.unpairedActualMinor).toBe(0);

    await alloc([]);
    expect(await stateOf()).toMatchObject({ status: "unpaired", allocations: [] });
    const after = await run(costsPlan, u.ctx, { jobId: j.id });
    expect(after.unpairedActualMinor).toBe(40_000_00);
  });

  it("když se částka zdroje změní (oprava docházky), rozpad nechá zbytek nespárovaný", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    lines.push(labour("t1", 40_000_00));
    await run(costsAllocate, u.ctx, {
      jobId: j.id,
      source: "dochazka",
      ref: "t1",
      parts: [
        { sectionId: b.elektro.id, amountMinor: 25_000_00 },
        { sectionId: b.material.id, amountMinor: 15_000_00 },
      ],
    });
    lines[0]!.amountMinor = 48_000_00;
    const r = (await run(costsList, u.ctx, { jobId: j.id })).rows[0]!;
    expect(r).toMatchObject({ status: "partial", remainingMinor: 8_000_00 });
    const s = await run(summary, u.ctx, { jobId: j.id });
    expect(s.unpairedCount).toBe(1);
    // jediná část bez částky sleduje změnu sama
    await run(costsAllocate, u.ctx, {
      jobId: j.id,
      source: "dochazka",
      ref: "t1",
      parts: [{ sectionId: b.elektro.id }],
    });
    lines[0]!.amountMinor = 50_000_00;
    expect((await run(costsList, u.ctx, { jobId: j.id })).rows[0]!.status).toBe("paired");
  });

  it("automatické párování použije jen jednoznačný oddíl podle kategorie", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    lines.push(
      labour("t1", 10_000_00),
      { category: "material", label: "V1", amountMinor: 2_000_00, source: "sklad", ref: "d1" },
      { category: "other", label: "Kontejner", amountMinor: 3_000_00, source: "stroje", ref: "o1" },
      { category: "machines", label: "Jízda", amountMinor: 1_000_00, source: "stroje", ref: "o2" },
    );
    await run(costsSave, u.ctx, {
      jobId: j.id,
      date: "2026-10-05",
      category: "material",
      title: "Lepidlo",
      amountMinor: 500_00,
    });
    const r = await run(costsAutoAllocate, u.ctx, { jobId: j.id });
    expect(r).toEqual({ allocated: 3, left: 2 }); // práce, materiál (sklad) a ruční lepidlo; ostatní + doprava ne
    const after = await run(costsList, u.ctx, { jobId: j.id });
    const by = (label: string) => after.rows.find((x) => x.label === label)!;
    expect(by("Práce t1").allocations[0]!.sectionId).toBe(b.elektro.id);
    expect(by("V1").allocations[0]!.sectionId).toBe(b.material.id);
    expect(by("Lepidlo").allocations[0]!.sectionId).toBe(b.material.id);
    expect(by("Kontejner").status).toBe("unpaired");
    expect(by("Jízda").status).toBe("unpaired");
    expect(await run(costsAutoAllocate, u.ctx, { jobId: j.id })).toEqual({ allocated: 0, left: 2 });
  });

  it("souběžné párování téhož nákladu nezanechá duplicitní řádky", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    lines.push(labour("t1", 40_000_00));
    const call = (sectionId: string) =>
      run(costsAllocate, u.ctx, {
        jobId: j.id,
        source: "dochazka",
        ref: "t1",
        parts: [{ sectionId }],
      });
    await Promise.all([
      call(b.elektro.id),
      call(b.material.id),
      call(b.doprava.id),
      call(b.ostatniA.id),
    ]);
    const rows = await app.db.select().from(costAllocation).where(eq(costAllocation.jobId, j.id));
    expect(rows).toHaveLength(1);
  });
});

describe("ruční náklady a náklady z jiných oblastí", () => {
  it("úprava a přesun ručního nákladu zahodí rozpad, smazání uklidí párování", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const { id } = await run(costsSave, u.ctx, {
      jobId: j.id,
      date: "2026-10-05",
      category: "other",
      title: "Kontejner",
      amountMinor: 3_000_00,
    });
    await run(costsAllocate, u.ctx, {
      jobId: j.id,
      source: "manual",
      ref: id,
      parts: [
        { sectionId: b.ostatniA.id, amountMinor: 1_000_00 },
        { sectionId: b.ostatniB.id, amountMinor: 2_000_00 },
      ],
    });
    expect(
      await app.db.select().from(costAllocation).where(eq(costAllocation.sourceRef, id)),
    ).toHaveLength(2);
    await run(costsSave, u.ctx, {
      jobId: j.id,
      id,
      date: "2026-10-05",
      category: "other",
      title: "Kontejner",
      amountMinor: 3_000_00,
      sectionId: b.doprava.id,
    });
    expect(
      await app.db.select().from(costAllocation).where(eq(costAllocation.sourceRef, id)),
    ).toHaveLength(0);
    const row = (await run(costsList, u.ctx, { jobId: j.id })).rows[0]!;
    expect(row).toMatchObject({ status: "paired", editable: true });
    expect(row.allocations[0]!.sectionId).toBe(b.doprava.id);

    await run(costsDelete, u.ctx, { jobId: j.id, id });
    expect((await run(costsList, u.ctx, { jobId: j.id })).rows).toHaveLength(0);
  });

  it("createManualCost pamatuje zdroj; takový náklad se z UI nemění a deleteManualCostsBySource ho smaže", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    await newBudget(j.id);
    const a = await api.createManualCost(u.ctx, {
      jobId: j.id,
      date: "2026-10-06",
      category: "material",
      title: "Tmel (deník)",
      amountMinor: 700_00,
      source: "diary",
      sourceRef: "D1:r1",
    });
    await api.createManualCost(u.ctx, {
      jobId: j.id,
      date: "2026-10-06",
      category: "material",
      title: "Sádra (deník)",
      amountMinor: 300_00,
      source: "diary",
      sourceRef: "D2:r1",
    });
    const rows = (await run(costsList, u.ctx, { jobId: j.id })).rows;
    expect(rows.map((r) => [r.source, r.editable])).toEqual([
      ["diary", false],
      ["diary", false],
    ]);
    await expect(run(costsDelete, u.ctx, { jobId: j.id, id: a.id })).rejects.toThrow(
      /vznikl v jiné části/,
    );
    // přepočet souhrnu proběhl při vzniku
    const [jr] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(jr!.sumCostMinor).toBe(1_000_00);
    expect(await api.deleteManualCostsBySource(u.ctx, j.id, "diary", "D1:")).toBe(1);
    expect(await api.deleteManualCostsBySource(u.ctx, j.id, "diary")).toBe(1);
    expect(await api.deleteManualCostsBySource(u.ctx, j.id, "diary")).toBe(0);
    const [after] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(after!.sumCostMinor).toBe(0);
  });

  it("oddíl cizí zakázky se odmítne", async () => {
    const u = await boss();
    const j1 = await newJob(u.id);
    const j2 = await newJob(u.id);
    await newBudget(j1.id);
    const b2 = await newBudget(j2.id);
    await expect(
      run(costsSave, u.ctx, {
        jobId: j1.id,
        date: "2026-10-05",
        category: "other",
        title: "Cizí oddíl",
        amountMinor: 100,
        sectionId: b2.elektro.id,
      }),
    ).rejects.toThrow(/není v aktuálním rozpočtu/);
  });
});

describe("souhrn zakázky", () => {
  it("smluvní cena, plán, náklady, marže, čerpání, fakturace a semafor; přepočet je idempotentní", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    await app.db.insert(jobChange).values({
      jobId: j.id,
      number: 1,
      title: "VP",
      amountMinor: 100_000_00,
      status: "approved",
    });
    await app.db.insert(jobChange).values({
      jobId: j.id,
      number: 2,
      title: "Čekající",
      amountMinor: 999_00,
      status: "sent",
    });
    lines.push(labour("t1", 90_000_00), labour("t2", 5_000_00));
    await run(costsAllocate, u.ctx, {
      jobId: j.id,
      source: "dochazka",
      ref: "t1",
      parts: [{ sectionId: b.elektro.id }],
    });
    const s = await run(summary, u.ctx, { jobId: j.id });
    expect(s).toMatchObject({
      contractMinor: 1_100_000_00,
      originalContractMinor: 1_000_000_00,
      approvedChangesMinor: 100_000_00,
      plannedCostMinor: 150_000_00,
      costMinor: 95_000_00,
      drawdownPct: 63.3,
      marginMinor: 1_005_000_00,
      invoicedMinor: 300_000_00,
      paidMinor: 100_000_00,
      unpairedCount: 1,
      health: "ok",
    });
    const [row] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(row).toMatchObject({
      sumContractMinor: 1_100_000_00,
      sumPlannedCostMinor: 150_000_00,
      sumCostMinor: 95_000_00,
      sumInvoicedMinor: 300_000_00,
      sumPaidMinor: 100_000_00,
      sumHealth: "ok",
      sumUnpairedCount: 1,
    });
    expect(row!.sumDrawdownPct).toBe("63.3");
    const first = row!.sumAt;
    const again = await api.recomputeJobSummary(u.ctx, j.id);
    expect(again.costMinor).toBe(95_000_00);
    const [row2] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(row2!.sumAt!.getTime()).toBe(first!.getTime()); // beze změny se nezapisuje

    // čerpání nad 100 % plánu = problém
    lines.push(labour("t3", 60_000_00));
    expect((await run(summary, u.ctx, { jobId: j.id })).health).toBe("danger");
  });

  it("přepočet souhrnu neposouvá `updated_at` (jinak by první úprava po otevření detailu skončila kolizí)", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const [before] = await app.db.select().from(job).where(eq(job.id, j.id));
    await new Promise((r) => setTimeout(r, 15));
    lines.push(labour("t1", 5_000_00));
    const s = await api.recomputeJobSummary(u.ctx, j.id);
    expect(s.costMinor).toBe(5_000_00);
    const [after] = await app.db.select().from(job).where(eq(job.id, j.id));
    expect(after!.sumCostMinor).toBe(5_000_00); // souhrn se opravdu zapsal
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
  });

  it("zakázka v nabídce se nehodnotí, bez rozpočtu je plán nula", async () => {
    const u = await boss();
    const offer = await newJob(u.id, "offer");
    lines.push(labour("t1", 1_000_00));
    const s = await run(summary, u.ctx, { jobId: offer.id });
    expect(s.health).toBeNull();
    expect(s.plannedCostMinor).toBe(0);
    expect(s.drawdownPct).toBeNull();
  });
});

describe("cena zakázky v seznamu před výhrou", () => {
  /** Nabídka bez zadané ceny, rozpočet nabídky prodává za 2 500 000 Kč (100 × 25 000). */
  async function offerJob(phase: string, valueMinor = 0) {
    const u = await boss();
    const j = await newJob(u.id, phase);
    await app.db.update(job).set({ valueMinor }).where(eq(job.id, j.id));
    const [v] = await app.db
      .insert(budgetVersion)
      .values({ jobId: j.id, kind: "offer", number: 1, status: "draft" })
      .returning();
    const [o] = await app.db
      .insert(budgetObject)
      .values({ versionId: v!.id, title: "Celá zakázka", isDefault: true })
      .returning();
    const [sec] = await app.db
      .insert(budgetSection)
      .values({ versionId: v!.id, objectId: o!.id, title: "Hrubá stavba", position: 0 })
      .returning();
    await app.db.insert(budgetItem).values({
      versionId: v!.id,
      sectionId: sec!.id,
      title: "Zdivo",
      quantity: "100",
      unitCostMinor: 20_000_00,
      unitPriceMinor: 25_000_00,
    });
    return { u, j };
  }
  const sumOf = async (id: string) =>
    (await app.db.select().from(job).where(eq(job.id, id)))[0]!.sumContractMinor;

  it("nabídka bez ceny: sloupec seznamu nese cenu nabídky, příkaz smluvní cenu 0 a cenu nabídky (jako hlavička)", async () => {
    const { u, j } = await offerJob("offer");
    const s = await run(summary, u.ctx, { jobId: j.id });
    expect(s).toMatchObject({ contractMinor: 0, budgetSellMinor: 2_500_000_00 });
    expect(await sumOf(j.id)).toBe(2_500_000_00);
    // poptávka stejně
    const inquiry = await offerJob("inquiry");
    await run(summary, inquiry.u.ctx, { jobId: inquiry.j.id });
    expect(await sumOf(inquiry.j.id)).toBe(2_500_000_00);
  });

  it("se zadanou cenou nebo po výhře je to smluvní cena; zakázka s cenou nabídky 0 zůstává 0", async () => {
    const priced = await offerJob("offer", 2_400_000_00);
    await run(summary, priced.u.ctx, { jobId: priced.j.id });
    expect(await sumOf(priced.j.id)).toBe(2_400_000_00);

    const { u, j } = await offerJob("offer");
    await run(summary, u.ctx, { jobId: j.id });
    expect(await sumOf(j.id)).toBe(2_500_000_00);
    await app.db.update(job).set({ phase: "preparation" }).where(eq(job.id, j.id));
    await run(summary, u.ctx, { jobId: j.id });
    expect(await sumOf(j.id)).toBe(0); // po výhře je smluvní cena smluvní (tady nulová), ne cena nabídky
    const empty = await newJob(u.id, "offer");
    await app.db.update(job).set({ valueMinor: 0 }).where(eq(job.id, empty.id));
    await run(summary, u.ctx, { jobId: empty.id });
    expect(await sumOf(empty.id)).toBe(0);
  });
});

describe("plán vs skutečnost: závazky z objednávek", () => {
  it("schválená objednávka je závazek, náklad s vazbou na ni ho snižuje; koncept a zrušená se nepočítají", async () => {
    const u = await boss();
    const j = await newJob(u.id);
    const b = await newBudget(j.id);
    const order = (status: string, total: number, sectionId: string | null, n: string) =>
      app.db
        .insert(jobOrder)
        .values({ jobId: j.id, number: n, title: `Obj ${n}`, status, totalMinor: total, sectionId })
        .returning()
        .then((r) => r[0]!);
    const o1 = await order(
      "approved",
      30_000_00,
      b.material.id,
      `T${randomBytes(3).toString("hex")}`,
    );
    await order("draft", 99_000_00, b.material.id, `T${randomBytes(3).toString("hex")}`);
    await order("cancelled", 99_000_00, b.material.id, `T${randomBytes(3).toString("hex")}`);
    await order("received", 10_000_00, null, `T${randomBytes(3).toString("hex")}`);
    let plan = await run(costsPlan, u.ctx, { jobId: j.id });
    const mat = () => plan.objects[0]!.sections.find((s) => s.title === "Materiál")!.metrics;
    expect(mat().orderedMinor).toBe(30_000_00);
    expect(plan.unassignedOrderedMinor).toBe(10_000_00);
    expect(plan.totals.orderedMinor).toBe(40_000_00);

    await run(costsSave, u.ctx, {
      jobId: j.id,
      date: "2026-10-06",
      category: "material",
      title: "Dodávka k objednávce",
      amountMinor: 12_000_00,
      sectionId: b.material.id,
      orderId: o1.id,
    });
    plan = await run(costsPlan, u.ctx, { jobId: j.id });
    expect(mat()).toMatchObject({ orderedMinor: 18_000_00, actualMinor: 12_000_00 });
    // přefakturováno nad objednanou částku: závazek nikdy záporný
    await run(costsSave, u.ctx, {
      jobId: j.id,
      date: "2026-10-07",
      category: "material",
      title: "Doplatek",
      amountMinor: 25_000_00,
      sectionId: b.material.id,
      orderId: o1.id,
    });
    plan = await run(costsPlan, u.ctx, { jobId: j.id });
    expect(mat().orderedMinor).toBe(0);
  });

  it("objednávka jiné zakázky se k nákladu nepřipustí", async () => {
    const u = await boss();
    const j1 = await newJob(u.id);
    const j2 = await newJob(u.id);
    const [o] = await app.db
      .insert(jobOrder)
      .values({
        jobId: j2.id,
        number: `T${randomBytes(3).toString("hex")}`,
        title: "Cizí",
        status: "approved",
      })
      .returning();
    await expect(
      run(costsSave, u.ctx, {
        jobId: j1.id,
        date: "2026-10-05",
        category: "material",
        title: "Náklad cizí objednávky",
        amountMinor: 100,
        orderId: o!.id,
      }),
    ).rejects.toThrow(/nepatří k této zakázce/);
  });
});

describe("oprávnění", () => {
  it("mistr ani montér ceny nedostanou; kdo nemá zakazky.budget, nezapisuje; cizí zakázka neexistuje", async () => {
    const owner = await boss();
    const j = await newJob(owner.id);
    await newBudget(j.id);
    const foreman = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["zakazky.write", "own"],
    ]);
    // cizí zakázku nevidí vůbec
    await expect(run(costsList, foreman.ctx, { jobId: j.id })).rejects.toThrow(NotFoundError);
    // na své zakázce (vedoucí) ceny nedostane
    const own = await newJob(foreman.id);
    for (const cmd of [costsList, costsPlan, summary, costsTargets] as CommandDef[])
      await expect(
        cmd.handler(foreman.ctx, cmd.input.parse({ jobId: own.id }), deps()),
      ).rejects.toThrow(PermissionError);
    await expect(
      run(costsSave, foreman.ctx, {
        jobId: own.id,
        date: "2026-10-05",
        category: "other",
        title: "Nesmí",
        amountMinor: 100,
      }),
    ).rejects.toThrow(PermissionError);

    // vidí ekonomiku, ale nezapisuje
    const reader = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.economics", "all"],
    ]);
    expect((await run(costsList, reader.ctx, { jobId: j.id })).rows).toEqual([]);
    await expect(run(costsAutoAllocate, reader.ctx, { jobId: j.id })).rejects.toThrow(
      PermissionError,
    );
    const rows = await app.db
      .select()
      .from(jobCost)
      .where(and(eq(jobCost.jobId, own.id), isNull(jobCost.deletedAt)));
    expect(rows).toHaveLength(0);
  });
});
