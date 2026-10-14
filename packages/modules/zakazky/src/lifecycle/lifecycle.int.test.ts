import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  describeEntity,
  getRecord,
  queryRecords,
  registerEntityPolicies,
  resolveEntity,
  setPhaseHooks,
  updateRecord,
  type EntityRegistry,
  type PhaseTransitionHook,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { addDaysIso, todayIso } from "@rebar/core/time";
import { ensureSeedViews, viewConfigSchema } from "@rebar/core/views";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest } from "../index";
import { job } from "../schema";
import { jobEntity } from "../server";
import { area } from "./index";
import { lifecycleHooks } from "./hooks";
import { JOB_VIEWS } from "./views";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let jobE: ResolvedEntity;
let stages: { id: string; name: string; phase: string | null }[];
const deps = () => ({ registry, baseURL: "http://localhost" }) as unknown as ModuleDeps;
const cmd = (name: string) => area.commands!.find((c) => c.name === name)!;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const p of manifest.seed.pipelines) await ensurePipeline(app.db, p);
  for (const l of manifest.seed.lookups) await ensureLookup(app.db, l);
  await ensureSeries(app.db, manifest.seed.series);
  jobE = await resolveEntity(app.db, jobEntity);
  stages = (await getPipeline(app.db, "job", "default"))!.stages;
});
beforeEach(() => setPhaseHooks(lifecycleHooks));

const stage = (name: string) => stages.find((s) => s.name === name)!;
const boss = () =>
  makeUser(app.db, [
    ["zakazky.read", "all"],
    ["zakazky.write", "all"],
    ["zakazky.finance", "all"],
    ["kontakty.read", "all"],
    ["kontakty.write", "all"],
  ]);
type User = Awaited<ReturnType<typeof boss>>;

async function mkJob(u: User, extra: Record<string, unknown> = {}) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const r = await createRecord(u.ctx, registry, jobE, {
    title: `Zakázka ${randomBytes(3).toString("hex")}`,
    company: c!.id,
    ...extra,
  });
  return r.row;
}
const to = (u: User, id: string, phase: string, extra: Record<string, unknown> = {}) =>
  cmd("zakazky.transition").handler(u.ctx, { jobId: id, to: phase, ...extra }, deps());
const raw = async (id: string) => (await app.db.select().from(job).where(eq(job.id, id)))[0]!;

describe("založení zakázky", () => {
  it("ve výchozím stavu vzniká ve fázi poptávka; stav určuje fázi i při ručním založení jinde", async () => {
    const u = await boss();
    const a = await mkJob(u);
    expect(a).toMatchObject({ phase: "inquiry", stage: stage("Nová poptávka").id });
    expect((await raw(a.id)).phaseChangedAt).toBeInstanceOf(Date);

    const b = await mkJob(u, { stage: stage("Realizace").id });
    expect(b.phase).toBe("execution");
    await expect(mkJob(u, { stage: stage("Pozastaveno").id })).rejects.toThrow(/pozastavenou/);
  });

  it("řada čísel zaostává za existujícími zakázkami (import, ruční zápis): číslo se přeskočí, založení nespadne", async () => {
    const u = await boss();
    const year = new Date().getFullYear();
    const [c] = await app.db
      .insert(company)
      .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
      .returning();
    const [stageRow] = await app.db.select().from(schema.pipelineStage).limit(1);
    // zakázka s číslem, které řada ještě nepřidělila (jako ručně vložená data)
    const [ahead] = await app.db
      .select({ last: schema.numberSeries.lastValue })
      .from(schema.numberSeries)
      .where(eq(schema.numberSeries.key, "zakazky.cislo"));
    const clash = `Z-${year}-${String((ahead?.last ?? 0) + 1).padStart(3, "0")}`;
    await app.db.insert(job).values({
      number: clash,
      title: "Vložená mimo řadu",
      companyId: c!.id,
      stageId: stageRow!.id,
    });
    const created = await mkJob(u);
    expect(created.number).not.toBe(clash);
    expect(String(created.number)).toMatch(new RegExp(`^Z-${year}-\\d{3}$`));
  });

  it("při založení se volají jen after hooky s from prázdným; kontroly se nepouští", async () => {
    const seen: string[] = [];
    setPhaseHooks([
      {
        id: "t.exec",
        entity: "job",
        to: ["execution"],
        check: async () => "NESMÍ SE ZAVOLAT",
        after: async (_c, row, t) => void seen.push(`${t.from}>${t.to}:${row.phase}`),
      },
    ]);
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Realizace").id });
    expect(j.phase).toBe("execution");
    expect(seen).toEqual([">execution:execution"]);
  });
});

describe("přechody fází", () => {
  it("celý cyklus: poptávka → nabídka → příprava → realizace → předání → záruka → uzavřeno", async () => {
    const u = await boss();
    const j = await mkJob(u, {
      address: "Plzeň, Nádražní 1",
      manager: u.id,
      startDate: "2026-11-01",
    });
    await to(u, j.id, "offer");
    await to(u, j.id, "preparation");
    expect(await raw(j.id)).toMatchObject({ phase: "preparation", wonAt: todayIso() });
    await to(u, j.id, "execution");
    await to(u, j.id, "handover");
    expect(await raw(j.id)).toMatchObject({ phase: "handover", handoverAt: todayIso() });

    await updateRecord(u.ctx, registry, jobE, j.id, { warrantyMonths: 24 });
    await to(u, j.id, "warranty");
    const w = await raw(j.id);
    expect(w.phase).toBe("warranty");
    const until = new Date(`${todayIso()}T12:00:00Z`);
    until.setUTCFullYear(until.getUTCFullYear() + 2);
    expect(w.warrantyUntil).toBe(until.toISOString().slice(0, 10));
    // úkol odpovědnému na kontrolu záruky
    const tasks = await app.db
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.entityType, "job"), eq(schema.task.entityId, j.id)));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ assigneeId: u.id });
    expect(tasks[0]!.dueDate).toBe(addDaysIso(w.warrantyUntil!, -30));

    await to(u, j.id, "closed");
    expect(await raw(j.id)).toMatchObject({ phase: "closed", closedAt: todayIso() });
    // fáze se zapisují do aktivity zakázky
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityId, j.id), eq(schema.auditLog.action, "phase")));
    expect(audit.map((a) => a.summary)).toContain("Fáze: Záruka → Uzavřeno");
    expect(audit).toHaveLength(6);
  });

  it("přeskočit fázi nejde a věta řekne, kam se dá jít; kanban a inline změna stavu mají stejnou ochranu", async () => {
    const u = await boss();
    const j = await mkJob(u);
    await expect(to(u, j.id, "execution")).rejects.toThrow(
      /Z fáze „Poptávka“ nejde přejít do fáze „Realizace“\. Možné další fáze/,
    );
    // stejná chyba přes inline úpravu stavu (to dělá i kanban při přetažení karty)
    await expect(
      updateRecord(u.ctx, registry, jobE, j.id, { stage: stage("Realizace").id }),
    ).rejects.toThrow(/nejde přejít/);
    expect((await raw(j.id)).phase).toBe("inquiry");
  });

  it("do nabídky bez zákazníkovy adresy nejde, příprava → realizace chce datum zahájení a odpovědného", async () => {
    const u = await boss();
    const j = await mkJob(u);
    await expect(to(u, j.id, "offer")).rejects.toThrow(/adresu stavby/);
    await updateRecord(u.ctx, registry, jobE, j.id, { address: "Rokycany" });
    await to(u, j.id, "offer");
    await to(u, j.id, "preparation");
    await expect(to(u, j.id, "execution")).rejects.toThrow(/datum zahájení/);
    await updateRecord(u.ctx, registry, jobE, j.id, { startDate: "2026-12-01" });
    await expect(to(u, j.id, "execution")).rejects.toThrow(/odpovědnou osobu/);
    await updateRecord(u.ctx, registry, jobE, j.id, { manager: u.id });
    await to(u, j.id, "execution");
    expect((await raw(j.id)).phase).toBe("execution");
  });

  it("kontroly se doplní i ve stejné změně: stav + datum v jednom zápisu", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Příprava").id, manager: u.id });
    const r = await updateRecord(u.ctx, registry, jobE, j.id, {
      stage: stage("Realizace").id,
      startDate: "2026-12-01",
    });
    expect(r.row.phase).toBe("execution");
  });

  it("prohráno vyžaduje důvod, uloží ho a při obnovení poptávky ho smaže", async () => {
    const u = await boss();
    const j = await mkJob(u);
    await expect(to(u, j.id, "lost")).rejects.toThrow(/Vyplňte důvod prohry/);
    await expect(to(u, j.id, "lost", { reason: "neexistuje" })).rejects.toThrow(/Důvod prohry/);
    await to(u, j.id, "lost", { reason: "price" });
    expect(await raw(j.id)).toMatchObject({ phase: "lost", lostReason: "price" });
    await to(u, j.id, "inquiry");
    expect(await raw(j.id)).toMatchObject({ phase: "inquiry", lostReason: null });
  });

  it("pozastavení si pamatuje fázi a obnovit jde jen do ní", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Realizace").id });
    await to(u, j.id, "paused");
    expect(await raw(j.id)).toMatchObject({ phase: "paused", pausedFrom: "execution" });
    await expect(to(u, j.id, "preparation")).rejects.toThrow(/nejde přejít/);
    await to(u, j.id, "execution");
    expect(await raw(j.id)).toMatchObject({ phase: "execution", pausedFrom: null });
  });

  it("záruka: bez délky záruky nejde zahájit; zakázku se sjednanou zárukou nejde uzavřít přeskočením", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Předání").id });
    await expect(to(u, j.id, "warranty")).rejects.toThrow(/délku záruky/);
    await updateRecord(u.ctx, registry, jobE, j.id, { warrantyMonths: 12 });
    await expect(to(u, j.id, "closed")).rejects.toThrow(/Nejdřív ji zahajte/);
    const k = await mkJob(u, { stage: stage("Předání").id });
    await to(u, k.id, "closed");
    expect((await raw(k.id)).phase).toBe("closed");
  });

  it("uzavřená zakázka je zamčená; znovu otevřít jde do záruky", async () => {
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Záruka").id, warrantyMonths: 12 });
    await to(u, j.id, "closed");
    await expect(updateRecord(u.ctx, registry, jobE, j.id, { title: "Jiný" })).rejects.toThrow(
      /uzavřená a zamčená/,
    );
    await to(u, j.id, "warranty");
    expect((await raw(j.id)).closedAt).toBeNull();
    await updateRecord(u.ctx, registry, jobE, j.id, { title: "Jiný název" });
  });

  it("původní smluvní cena se od realizace nemění", async () => {
    const u = await boss();
    const j = await mkJob(u, { value: 100_000_00 });
    await updateRecord(u.ctx, registry, jobE, j.id, { value: 120_000_00 }); // poptávka: jde
    const k = await mkJob(u, { stage: stage("Realizace").id, value: 100_000_00 });
    await expect(updateRecord(u.ctx, registry, jobE, k.id, { value: 1 })).rejects.toThrow(
      /Původní smluvní cena je od zahájení realizace zamčená/,
    );
    await updateRecord(u.ctx, registry, jobE, k.id, { title: "Ostatní úpravy jdou" });
  });
});

describe("hooky přechodu z jiných oblastí", () => {
  const hook = (over: Partial<PhaseTransitionHook>): PhaseTransitionHook => ({
    id: "t.hook",
    entity: "job",
    to: ["closed"],
    ...over,
  });

  it("check cizího hooku zablokuje přechod jeho větou, run běží před zápisem a after po něm", async () => {
    const order: string[] = [];
    let blocked = true;
    setPhaseHooks([
      ...lifecycleHooks,
      hook({
        id: "t.retention",
        check: async () => (blocked ? "Nejdřív uvolněte zádržné." : null),
        run: async (_c, row) => void order.push(`run:${row.phase}`),
        after: async (_c, row, t) => void order.push(`after:${row.phase}:${t.from}>${t.to}`),
      }),
    ]);
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Záruka").id, warrantyMonths: 1 });
    await expect(to(u, j.id, "closed")).rejects.toThrow("Nejdřív uvolněte zádržné.");
    expect(order).toEqual([]);
    expect((await raw(j.id)).phase).toBe("warranty");
    blocked = false;
    await to(u, j.id, "closed");
    expect(order).toEqual(["run:warranty", "after:closed:warranty>closed"]);
  });

  it("selhání after hooku vrátí celý přechod (jedna transakce)", async () => {
    setPhaseHooks([
      hook({
        to: ["warranty"],
        after: async () => {
          throw new Error("selhalo");
        },
      }),
    ]);
    const u = await boss();
    const j = await mkJob(u, { stage: stage("Předání").id });
    await expect(to(u, j.id, "warranty")).rejects.toThrow("selhalo");
    expect((await raw(j.id)).phase).toBe("handover");
  });

  it("náhled přechodů vypíše nesplněné kontroly pro každou další fázi", async () => {
    setPhaseHooks([
      ...lifecycleHooks,
      hook({ to: ["offer"], check: async () => "Cizí kontrola." }),
    ]);
    const u = await boss();
    const j = await mkJob(u);
    const res = (await cmd("zakazky.phase.preview").handler(u.ctx, { jobId: j.id }, deps())) as {
      phase: string;
      options: { to: string; allowed: boolean; problems: string[]; needsReason: boolean }[];
      lostReasons: { value: string }[];
    };
    expect(res.phase).toBe("inquiry");
    const offer = res.options.find((o) => o.to === "offer")!;
    expect(offer.allowed).toBe(false);
    expect(offer.problems).toEqual(
      expect.arrayContaining([expect.stringContaining("adresu stavby"), "Cizí kontrola."]),
    );
    expect(res.options.find((o) => o.to === "preparation")!.allowed).toBe(true);
    expect(res.options.find((o) => o.to === "lost")).toMatchObject({ needsReason: true });
    expect(res.lostReasons.map((r) => r.value)).toContain("price");
  });
});

describe("oprávnění a viditelnost sloupců", () => {
  it("bez zakazky.finance nejsou v popisu, řádcích, součtech, filtrech ani zápisu hodnoty zakázky", async () => {
    const u = await boss();
    const j = await mkJob(u, { value: 90_000_00 });
    const worker = await makeUser(app.db, [
      ["zakazky.read", "all"],
      ["zakazky.write", "all"],
      ["kontakty.read", "all"],
    ]);
    const d = await describeEntity(worker.ctx, app.db, jobE, registry);
    const keys = d.attributes.map((a) => a.key);
    expect(keys).toContain("phase");
    expect(keys).not.toContain("value");

    const { row } = await getRecord(worker.ctx, registry, jobE, j.id);
    expect(row).not.toHaveProperty("value");
    const page = await queryRecords(worker.ctx, registry, jobE, {
      filters: { op: "and", conditions: [{ attr: "title", op: "equals", value: String(j.title) }] },
    });
    expect(page.totals).toEqual({});
    await expect(
      queryRecords(worker.ctx, registry, jobE, {
        filters: { op: "and", conditions: [{ attr: "value", op: "gt", value: 1 }] },
      }),
    ).rejects.toThrow(/nejde filtrovat/);
    await expect(
      queryRecords(worker.ctx, registry, jobE, { sort: [{ attr: "value", dir: "asc" }] }),
    ).rejects.toThrow();
    await expect(updateRecord(worker.ctx, registry, jobE, j.id, { value: 1 })).rejects.toThrow(
      /Neznámý atribut/,
    );
    // majitel ceny vidí
    expect((await getRecord(u.ctx, registry, jobE, j.id)).row.value).toBe(90_000_00);
  });
});

describe("přehled a kalendář", () => {
  it("upozornění: nabídka bez odpovědi 14 dní, záruka končí do 60 dní", async () => {
    const u = await boss();
    const offer = await mkJob(u, { stage: stage("Nabídka v přípravě").id });
    const warranty = await mkJob(u, {
      stage: stage("Záruka").id,
      warrantyUntil: addDaysIso(todayIso(), 20),
    });
    const fresh = await mkJob(u, { stage: stage("Nabídka v přípravě").id });
    await app.db
      .update(job)
      .set({ phaseChangedAt: sql`now() - interval '20 days'` })
      .where(eq(job.id, offer.id));

    const items = (await area.attention![0]!(u.ctx, deps())).map((i) => i.id);
    expect(items).toContain(`job-offer-stale-${offer.id}`);
    expect(items).not.toContain(`job-offer-stale-${fresh.id}`);
    expect(items).toContain(`job-warranty-ends-${warranty.id}`);

    const layer = area.calendarLayers![0]!;
    const cal = await layer.items(
      u.ctx,
      { from: todayIso(), to: addDaysIso(todayIso(), 30) },
      deps(),
    );
    expect(cal.map((c) => c.id)).toContain(`warranty-end-${warranty.id}`);
  });
});

describe("výchozí pohledy a migrace", () => {
  it("pohledy se založí jednou, jsou sdílené a odpovídají atributům entity", async () => {
    await makeUser(app.db, [["zakazky.read", "all"]]); // aspoň jeden uživatel jako vlastník
    await ensureSeedViews(app.db, JOB_VIEWS);
    await ensureSeedViews(app.db, JOB_VIEWS);
    const rows = await app.db
      .select()
      .from(schema.savedView)
      .where(and(eq(schema.savedView.entityType, "job"), eq(schema.savedView.shared, true)));
    for (const v of JOB_VIEWS) expect(rows.filter((r) => r.name === v.name)).toHaveLength(1);
    const known = new Set(jobE.attributes.map((a) => a.key));
    for (const v of JOB_VIEWS) {
      viewConfigSchema.parse(v.config);
      for (const k of [
        ...(v.config.columns ?? []),
        ...(v.config.cardAttributes ?? []),
        ...(v.config.group ? [v.config.group] : []),
      ])
        expect(known.has(k), `${v.name}: ${k}`).toBe(true);
    }
    // filtry pohledů projdou dotazem
    const u = await boss();
    for (const v of JOB_VIEWS)
      await queryRecords(u.ctx, registry, jobE, {
        filters: v.config.filters as never,
        limit: 1,
      });
  });
});
