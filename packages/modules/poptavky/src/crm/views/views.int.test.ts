import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline } from "@rebar/core/config-data";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  queryRecords,
  registerEntityPolicies,
  resolveEntity,
  setPhaseHooks,
  type EntityRegistry,
  type ResolvedEntity,
} from "@rebar/core/entities";
import type { DashboardMetricInput, ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, addMonthsIso, todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job } from "@rebar/zakazky/schema";
import { jobEntity, server as zakazkyServer } from "@rebar/zakazky/server";
import { manifest } from "../../index";
import { crmActivity, crmActivityType, inquiry } from "../../schema";
import { inquiryEntity } from "../../server";
import { loseDeal, winDeal, archiveDeal } from "../deals/transitions";
import { recomputeJobCrm } from "../deals/recompute";
import { crmHooks } from "../hooks";
import { ensureCrmDefaults } from "../seed";
import { todayCommand } from "../today/today";
import { archiveListCommand } from "./archive";
import { forecastCommand } from "./forecast";
import { currentMonth, shiftMonth } from "./logic";
import { crmDashboardMetrics } from "./metrics";
import { dealAttention, dealTiles, inboxAttention } from "./overview";
import { CRM_VIEWS } from "./seed-views";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let jobE: ResolvedEntity;
let inquiryE: ResolvedEntity;
let stages: { id: string; name: string }[];
const settings = createSettings(
  createCipher(parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") })),
);
const deps = () => ({ registry, settings, baseURL: "http://localhost" }) as unknown as ModuleDeps;
const DAY = 86_400_000;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, inquiryEntity, jobEntity]);
  registerEntityPolicies(registry);
  for (const m of [manifest, zakazkyManifest]) {
    for (const p of m.seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    if ("series" in m.seed) await ensureSeries(app.db, m.seed.series);
  }
  await ensureCrmDefaults(app.db);
  jobE = await resolveEntity(app.db, jobEntity);
  inquiryE = await resolveEntity(app.db, inquiryEntity);
  const { getPipeline } = await import("@rebar/core/config-data");
  stages = (await getPipeline(app.db, "job", "default"))!.stages;
});
beforeEach(() => setPhaseHooks([...(zakazkyServer.phaseHooks ?? []), ...crmHooks]));

const stage = (name: string) => stages.find((s) => s.name === name)!;
const PERMS: [string, "all" | "own"][] = [
  ["zakazky.read", "all"],
  ["zakazky.write", "all"],
  ["kontakty.read", "all"],
  ["kontakty.write", "all"],
  ["poptavky.read", "all"],
  ["poptavky.write", "all"],
  ["poptavky.convert", "all"],
];
const boss = (name?: string) =>
  makeUser(app.db, [...PERMS, ["zakazky.economics", "all"], ["settings.manage", "all"]], { name });
/** Obchodník bez práva na peníze. */
const foreman = () => makeUser(app.db, [...PERMS]);
type User = Awaited<ReturnType<typeof boss>>;

async function mkJob(owner: User, by: User, extra: Record<string, unknown> = {}) {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${randomBytes(3).toString("hex")}` })
    .returning();
  const r = await createRecord(by.ctx, registry, jobE, {
    title: `Zakázka ${randomBytes(3).toString("hex")}`,
    company: c!.id,
    value: 1_000_000_00,
    manager: owner.id,
    ...extra,
  });
  return r.row;
}
const input = (over: Partial<DashboardMetricInput> = {}): DashboardMetricInput => ({
  from: null,
  to: null,
  jobId: null,
  userId: null,
  bucket: null,
  limit: 10,
  params: {},
  today: todayIso(),
  ...over,
});
async function mkActivity(
  u: User,
  jobId: string,
  extra: Partial<typeof crmActivity.$inferInsert> = {},
) {
  const [t] = await app.db.select().from(crmActivityType).limit(1);
  const [a] = await app.db
    .insert(crmActivity)
    .values({
      typeId: t!.id,
      subject: "Zavolat",
      jobId,
      assigneeId: u.id,
      createdBy: u.id,
      ...extra,
    })
    .returning();
  return a!;
}
const forecast = (u: User, i: Record<string, unknown>) =>
  forecastCommand.handler(u.ctx, forecastCommand.input.parse(i), deps());

describe("crm.forecast", () => {
  it("sečte otevřené, vyhrané, celkem a váženou hodnotu po měsících a oddělí dřívější a bez data", async () => {
    const u = await boss();
    const today = todayIso();
    const month = currentMonth();
    const next = shiftMonth(month, 1);
    // Nabídka odeslána 65 %, Jednání 80 %, Nová poptávka 10 %
    const a = await mkJob(u, u, {
      stage: stage("Nabídka odeslána").id,
      address: "Nová 1",
      expectedCloseDate: today,
    });
    const b = await mkJob(u, u, {
      stage: stage("Jednání").id,
      address: "Nová 2",
      value: 500_000_00,
      expectedCloseDate: `${next}-15`,
    });
    const earlier = await mkJob(u, u, { expectedCloseDate: `${shiftMonth(month, -2)}-10` });
    const undated = await mkJob(u, u);
    const won = await mkJob(u, u, { value: 200_000_00, expectedCloseDate: today });
    await winDeal(u.ctx, won.id, deps());
    const lost = await mkJob(u, u, { expectedCloseDate: today });
    await loseDeal(u.ctx, lost.id, { reasonKey: "price" }, deps());
    const archived = await mkJob(u, u, { expectedCloseDate: today });
    await archiveDeal(u.ctx, archived.id);

    const r = await forecast(u, { owner: u.id, months: 3 });
    expect(r.money).toBe(true);
    expect(r.columns.map((c) => c.key)).toEqual([
      "earlier",
      month,
      next,
      shiftMonth(month, 2),
      "none",
    ]);
    const col = (k: string) => r.columns.find((c) => c.key === k)!;

    expect(col(month).open).toEqual({
      count: 1,
      valueMinor: 1_000_000_00,
      weightedMinor: 650_000_00,
    });
    expect(col(month).won).toEqual({ count: 1, valueMinor: 200_000_00, weightedMinor: 200_000_00 });
    expect(col(month).total).toEqual({
      count: 2,
      valueMinor: 1_200_000_00,
      weightedMinor: 850_000_00,
    });
    expect(col(month).deals.map((d) => d.id)).toEqual([a.id, won.id]);
    expect(col(next).open).toEqual({ count: 1, valueMinor: 500_000_00, weightedMinor: 400_000_00 });
    expect(col(next).deals[0]).toMatchObject({ id: b.id, probabilityPct: 80, won: false });
    expect(col("earlier").deals.map((d) => d.id)).toEqual([earlier.id]);
    expect(col("none").deals.map((d) => d.id)).toEqual([undated.id]);
    // prohraný ani archivovaný obchod v prognóze není
    const all = r.columns.flatMap((c) => c.deals.map((d) => d.id));
    expect(all).not.toContain(lost.id);
    expect(all).not.toContain(archived.id);
    // stavy otevřených fází pro pruh pozice na kartě
    expect(r.stages.map((s) => s.name)).toEqual([
      "Nová poptávka",
      "Kontaktováno",
      "Obhlídka",
      "Nabídka v přípravě",
      "Nabídka odeslána",
      "Jednání",
    ]);
  });

  it("filtr vlastníka zužuje na mé obchody a na konkrétního uživatele", async () => {
    const me = await boss();
    const other = await boss();
    const mine = await mkJob(me, me, { expectedCloseDate: todayIso() });
    const theirs = await mkJob(other, me, { expectedCloseDate: todayIso() });
    const ids = async (owner: string, who: User = me) =>
      (await forecast(who, { owner })).columns.flatMap((c) => c.deals.map((d) => d.id));
    expect(await ids("me")).toContain(mine.id);
    expect(await ids("me")).not.toContain(theirs.id);
    expect(await ids(other.id)).toEqual([theirs.id]);
    expect(await ids("all")).toEqual(expect.arrayContaining([mine.id, theirs.id]));
    await expect(forecast(me, { owner: "nesmysl" })).rejects.toThrow(/Neplatný filtr vlastníka/);
    await expect(forecast(me, { owner: "all", from: "2026-13" })).rejects.toThrow(/RRRR-MM/);
  });

  it("bez oprávnění k ekonomice nevrací žádné částky (jen počty), s rozsahem „jen moje“ jen vlastní obchody", async () => {
    const u = await boss();
    const f = await foreman();
    const a = await mkJob(u, f, { expectedCloseDate: todayIso(), value: 900_000_00 });
    const b = await mkJob(u, u, { expectedCloseDate: todayIso() });
    const r = await forecast(f, { owner: u.id });
    expect(r.money).toBe(false);
    const c = r.columns.find((x) => x.key === currentMonth())!;
    expect(c.open.valueMinor).toBeNull();
    expect(c.open.weightedMinor).toBeNull();
    expect(c.total.valueMinor).toBeNull();
    for (const d of r.columns.flatMap((x) => x.deals)) {
      expect(d.valueMinor).toBeNull();
      expect(d.weightedMinor).toBeNull();
    }
    expect(c.open.count).toBe(2);
    expect(JSON.stringify(r)).not.toContain("900000");
    expect([a.id, b.id]).toContain(c.deals[0]!.id);

    const own = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["kontakty.read", "all"],
    ]);
    const mineOnly = await mkJob(own, u, { expectedCloseDate: todayIso() });
    const seen = (await forecast(own, { owner: "all" })).columns.flatMap((x) =>
      x.deals.map((d) => d.id),
    );
    expect(seen).toEqual([mineOnly.id]);
    // bez práva číst zakázky příkaz neprojde
    const nobody = await makeUser(app.db, [["poptavky.read", "all"]]);
    await expect(forecast(nobody, { owner: "all" })).rejects.toThrow();
  });
});

describe("crm.archive.list", () => {
  it("rozliší archivované, prohrané a vyhrané a ukáže důvod ztráty; rozsah řídí scope", async () => {
    const u = await boss();
    const open = await mkJob(u, u);
    const lost = await mkJob(u, u, { value: 300_000_00 });
    await loseDeal(u.ctx, lost.id, { reasonKey: "price", note: "Konkurence levnější" }, deps());
    const arch = await mkJob(u, u);
    await archiveDeal(u.ctx, arch.id);
    const won = await mkJob(u, u);
    await winDeal(u.ctx, won.id, deps());
    const run = (scope: string, extra: Record<string, unknown> = {}) =>
      archiveListCommand.handler(
        u.ctx,
        archiveListCommand.input.parse({ owner: u.id, scope, ...extra }),
        deps(),
      );
    const ids = async (scope: string) => (await run(scope)).rows.map((r) => r.id).sort();

    expect(await ids("closed")).toEqual([lost.id, arch.id].sort());
    expect(await ids("lost")).toEqual([lost.id]);
    expect(await ids("archived")).toEqual([arch.id]);
    expect(await ids("won")).toEqual([won.id]);
    expect(await ids("all")).toEqual([lost.id, arch.id, won.id].sort());
    expect(await ids("all")).not.toContain(open.id);

    const row = (await run("lost")).rows[0]!;
    expect(row).toMatchObject({
      phase: "lost",
      lostReason: "Cena",
      lostNote: "Konkurence levnější",
      valueMinor: 300_000_00,
      managerName: u.name,
    });
    expect(row.closedAt).not.toBeNull();
    expect((await run("archived")).rows[0]!.archivedAt).not.toBeNull();
    // hledání a stránkování
    expect((await run("all", { q: lost.title as string })).rows.map((r) => r.id)).toEqual([
      lost.id,
    ]);
    const page = await run("all", { limit: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(3);
  });

  it("filtr vlastníka, rozsah aktéra a peníze jen s oprávněním ekonomiky", async () => {
    const u = await boss();
    const f = await foreman();
    const j = await mkJob(f, f);
    await loseDeal(f.ctx, j.id, { reasonKey: "timing" }, deps());
    const other = await mkJob(u, u);
    await loseDeal(u.ctx, other.id, { reasonKey: "timing" }, deps());
    const call = (who: User, owner: string) =>
      archiveListCommand.handler(
        who.ctx,
        archiveListCommand.input.parse({ owner, scope: "lost" }),
        deps(),
      );
    expect((await call(u, f.id)).rows.map((r) => r.id)).toEqual([j.id]);
    expect((await call(u, f.id)).rows[0]!.valueMinor).toBe(1_000_000_00);
    const asForeman = await call(f, "me");
    expect(asForeman.money).toBe(false);
    expect(asForeman.rows.map((r) => r.id)).toEqual([j.id]);
    expect(asForeman.rows[0]!.valueMinor).toBeNull();
  });
});

describe("crm.today", () => {
  it("ukáže moje otevřené obchody bez další aktivity, zhnilé první, a nové poptávky ve schránce", async () => {
    const me = await boss();
    const other = await boss();
    const noAct = await mkJob(me, me);
    const withAct = await mkJob(me, me);
    await mkActivity(me, withAct.id, { dueAt: new Date(Date.now() + DAY) });
    await recomputeJobCrm(me.ctx, withAct.id);
    const rotten = await mkJob(me, me);
    await app.db
      .update(job)
      .set({ crmRotting: true, crmStageEnteredAt: new Date(Date.now() - 9 * DAY) })
      .where(eq(job.id, rotten.id));
    const foreign = await mkJob(other, other);
    const archived = await mkJob(me, me);
    await archiveDeal(me.ctx, archived.id);
    const lost = await mkJob(me, me);
    await loseDeal(me.ctx, lost.id, { reasonKey: "price" }, deps());

    const inq = await createRecord(me.ctx, registry, inquiryE, {
      title: "Poptávka střechy",
      contactName: "Jan Novák",
      source: "web",
      message: "Dobrý den, poptávám střechu.",
    });

    const r = await todayCommand.handler(me.ctx, {}, deps());
    const ids = r.noActivity!.rows.map((d) => d.id);
    expect(ids).toContain(noAct.id);
    expect(ids).toContain(rotten.id);
    expect(ids.indexOf(rotten.id)).toBeLessThan(ids.indexOf(noAct.id)); // zhnilé první
    for (const x of [withAct.id, foreign.id, archived.id, lost.id]) expect(ids).not.toContain(x);
    expect(r.noActivity!.rows.find((d) => d.id === noAct.id)).toMatchObject({
      valueMinor: 1_000_000_00,
      phase: "inquiry",
    });
    expect(r.noActivity!.total).toBeGreaterThanOrEqual(2);

    const row = r.inbox!.rows.find((i) => i.id === inq.row.id)!;
    expect(row).toMatchObject({
      title: "Poptávka střechy",
      contactName: "Jan Novák",
      source: "Web",
    });
    expect(r.inbox!.canConvert).toBe(true);
    expect(r.inbox!.lostReasons.map((x) => x.value)).toContain("price");

    // kvalifikovaná poptávka (už z ní vznikla zakázka) ve schránce není
    await app.db
      .update(inquiry)
      .set({ convertedJobId: noAct.id })
      .where(eq(inquiry.id, inq.row.id));
    const after = await todayCommand.handler(me.ctx, {}, deps());
    expect(after.inbox!.rows.map((i) => i.id)).not.toContain(inq.row.id);
  });

  it("bez práva číst zakázky chybí sekce obchodů, bez ekonomiky chybí cena", async () => {
    const f = await foreman();
    const j = await mkJob(f, f);
    const r = await todayCommand.handler(f.ctx, {}, deps());
    expect(r.noActivity!.rows.find((d) => d.id === j.id)!.valueMinor).toBeNull();
    const onlyInbox = await makeUser(app.db, [["poptavky.read", "all"]]);
    const x = await todayCommand.handler(onlyInbox.ctx, {}, deps());
    expect(x.noActivity).toBeNull();
    expect(x.inbox).not.toBeNull();
    expect(x.inbox!.canConvert).toBe(false);
  });
});

describe("přehled: pozornost, dlaždice", () => {
  it("jeden obchod je v pozornosti nejvýš jednou a podle nejvyšší priority; cizí obchody v ní nejsou", async () => {
    const me = await boss();
    const other = await boss();
    const overdue = await mkJob(me, me);
    await mkActivity(me, overdue.id, { dueAt: new Date(Date.now() - 3 * DAY) });
    await recomputeJobCrm(me.ctx, overdue.id);
    await app.db.update(job).set({ crmRotting: true }).where(eq(job.id, overdue.id)); // i hnije, ale vyhrává aktivita po termínu
    const rotting = await mkJob(me, me);
    await mkActivity(me, rotting.id, { dueAt: new Date(Date.now() + 3 * DAY) });
    await recomputeJobCrm(me.ctx, rotting.id);
    await app.db.update(job).set({ crmRotting: true }).where(eq(job.id, rotting.id));
    const none = await mkJob(me, me);
    const passed = await mkJob(me, me, { expectedCloseDate: addDaysIso(todayIso(), -3) });
    await mkActivity(me, passed.id, { dueAt: new Date(Date.now() + 3 * DAY) });
    await recomputeJobCrm(me.ctx, passed.id);
    const fine = await mkJob(me, me, { expectedCloseDate: addDaysIso(todayIso(), 10) });
    await mkActivity(me, fine.id, { dueAt: new Date(Date.now() + 3 * DAY) });
    await recomputeJobCrm(me.ctx, fine.id);
    const foreign = await mkJob(other, other);

    const items = await dealAttention(me.ctx, deps());
    const byJob = (id: string) => items.filter((i) => i.id.endsWith(id));
    expect(byJob(overdue.id).map((i) => i.id)).toEqual([`crm-overdue_activity-${overdue.id}`]);
    expect(byJob(overdue.id)[0]!.severity).toBe("danger");
    expect(byJob(rotting.id).map((i) => i.id)).toEqual([`crm-rotting-${rotting.id}`]);
    expect(byJob(none.id).map((i) => i.id)).toEqual([`crm-no_activity-${none.id}`]);
    expect(byJob(passed.id).map((i) => i.id)).toEqual([`crm-close_passed-${passed.id}`]);
    expect(byJob(fine.id)).toEqual([]);
    expect(byJob(foreign.id)).toEqual([]);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) expect(i.href).toMatch(/^\/crm(\?record=|$)/);
  });

  it("nabídku bez odpovědi déle než 14 dní hlásí už Zakázky, tady se nezdvojí", async () => {
    const me = await boss();
    const j = await mkJob(me, me, {
      stage: stage("Nabídka odeslána").id,
      address: "Nová 3",
    });
    await app.db
      .update(job)
      .set({ phaseChangedAt: new Date(Date.now() - 20 * DAY), crmRotting: true })
      .where(eq(job.id, j.id));
    await mkActivity(me, j.id, { dueAt: new Date(Date.now() + DAY) });
    await recomputeJobCrm(me.ctx, j.id);
    await app.db.update(job).set({ crmRotting: true }).where(eq(job.id, j.id));
    const items = await dealAttention(me.ctx, deps());
    expect(items.filter((i) => i.id.endsWith(j.id))).toEqual([]);
  });

  it("schránka poptávek: jedna položka na poptávku (termín kroku, nebo čeká na zpracování)", async () => {
    const me = await boss();
    const stepOverdue = await createRecord(me.ctx, registry, inquiryE, {
      title: "Krok po termínu",
      nextStepAt: addDaysIso(todayIso(), -2),
    });
    const waiting = await createRecord(me.ctx, registry, inquiryE, { title: "Čeká dlouho" });
    const fresh = await createRecord(me.ctx, registry, inquiryE, { title: "Čerstvá" });
    const old = new Date(Date.now() - 3 * DAY);
    await app.db.update(inquiry).set({ createdAt: old }).where(eq(inquiry.id, waiting.row.id));
    // i stará, i s prošlým krokem: jen jedna položka
    await app.db.update(inquiry).set({ createdAt: old }).where(eq(inquiry.id, stepOverdue.row.id));
    const items = await inboxAttention(me.ctx, deps());
    const of = (id: string) => items.filter((i) => i.id.endsWith(id));
    expect(of(stepOverdue.row.id).map((i) => i.id)).toEqual([
      `inquiry-overdue-${stepOverdue.row.id}`,
    ]);
    expect(of(waiting.row.id).map((i) => i.id)).toEqual([`inquiry-waiting-${waiting.row.id}`]);
    expect(of(fresh.row.id)).toEqual([]);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    const nobody = await makeUser(app.db, []);
    expect(await inboxAttention(nobody.ctx, deps())).toEqual([]);
    expect(await dealAttention(nobody.ctx, deps())).toEqual([]);
  });

  it("dlaždice: otevřená a vážená hodnota s ekonomikou, jinak počet", async () => {
    const u = await boss();
    const f = await foreman();
    await mkJob(u, u);
    const withMoney = await dealTiles(u.ctx, deps());
    expect(withMoney.map((t) => t.id)).toEqual(["crm-open-value", "crm-weighted-value"]);
    const without = await dealTiles(f.ctx, deps());
    expect(without.map((t) => t.id)).toEqual(["crm-open-deals"]);
    expect(Number(without[0]!.value)).toBeGreaterThan(0);
    expect(JSON.stringify(without)).not.toMatch(/Kč/);
  });
});

describe("metriky nástěnek", () => {
  const metric = (key: string) => crmDashboardMetrics.find((m) => m.key === key)!;

  it("hodnota pipeline, vážená hodnota, zhnilé a bez další aktivity (jen otevřené, nearchivované)", async () => {
    const u = await boss();
    const a = await mkJob(u, u, { value: 1_000_000_00 }); // Nová poptávka 10 %
    const b = await mkJob(u, u, {
      value: 400_000_00,
      stage: stage("Jednání").id,
      address: "Nová 5",
    }); // 80 %
    await mkActivity(u, b.id, { dueAt: new Date(Date.now() + DAY) });
    await recomputeJobCrm(u.ctx, b.id);
    await app.db.update(job).set({ crmRotting: true }).where(eq(job.id, a.id));
    const lost = await mkJob(u, u);
    await loseDeal(u.ctx, lost.id, { reasonKey: "price" }, deps());
    const arch = await mkJob(u, u);
    await archiveDeal(u.ctx, arch.id);

    const run = (key: string, over: Partial<DashboardMetricInput> = {}) =>
      metric(key).compute(u.ctx, input({ userId: u.id, ...over }), deps());
    expect(await run("poptavky.pipeline_value")).toEqual({ kind: "scalar", value: 1_400_000_00 });
    expect(await run("poptavky.pipeline_weighted")).toEqual({
      kind: "scalar",
      value: 100_000_00 + 320_000_00,
    });
    expect(await run("poptavky.rotting")).toEqual({ kind: "scalar", value: 1 });
    expect(await run("poptavky.no_next_activity")).toEqual({ kind: "scalar", value: 1 });
    // parametr fáze
    expect(await run("poptavky.pipeline_value", { params: { phase: "offer" } })).toEqual({
      kind: "scalar",
      value: 400_000_00,
    });
    expect(await run("poptavky.pipeline_value", { params: { phase: "nesmysl" } })).toEqual({
      kind: "scalar",
      value: 1_400_000_00,
    });
    // bez filtru osoby se čtou všichni v rozsahu aktéra
    const all = await metric("poptavky.rotting").compute(u.ctx, input(), deps());
    expect((all as { value: number }).value).toBeGreaterThanOrEqual(1);
  });

  it("peněžní metriky vyžadují zakazky.economics a nikdy nevrátí víc, než smí aktér", async () => {
    const f = await foreman();
    await mkJob(f, f);
    for (const k of ["poptavky.pipeline_value", "poptavky.pipeline_weighted"]) {
      expect(metric(k).permissions).toContain("zakazky.economics");
      await expect(metric(k).compute(f.ctx, input(), deps())).rejects.toThrow(/oprávnění/);
    }
    // počty peníze nepotřebují a čtou jen obchody v rozsahu aktéra (jen moje)
    const own = await makeUser(app.db, [
      ["zakazky.read", "own"],
      ["kontakty.read", "all"],
    ]);
    await mkJob(own, f);
    await mkJob(f, f);
    expect(metric("poptavky.no_next_activity").permissions).not.toContain("zakazky.economics");
    const r = await metric("poptavky.no_next_activity").compute(own.ctx, input(), deps());
    expect(r).toEqual({ kind: "scalar", value: 1 });
  });

  it("klíče metrik začínají id modulu", () => {
    for (const m of crmDashboardMetrics) expect(m.key.startsWith("poptavky.")).toBe(true);
  });
});

describe("relativní operátory data ve filtru", () => {
  const query = (u: User, conditions: object[]) =>
    queryRecords(u.ctx, registry, jobE, {
      filters: { op: "and", conditions: conditions as never },
      limit: 100,
    });

  it("older_than_days, in_this_week a in_this_month", async () => {
    const u = await boss();
    const owner = { attr: "manager", op: "is", value: u.id };
    const old = await mkJob(u, u, { expectedCloseDate: `${currentMonth()}-01` });
    const fresh = await mkJob(u, u, { expectedCloseDate: `${shiftMonth(currentMonth(), 1)}-01` });
    await app.db
      .update(job)
      .set({ updatedAt: new Date(Date.now() - 120 * DAY) })
      .where(eq(job.id, old.id));

    const stale = await query(u, [owner, { attr: "updatedAt", op: "older_than_days", value: 90 }]);
    expect(stale.rows.map((r) => r.id)).toEqual([old.id]);
    const notStale = await query(u, [
      owner,
      { attr: "updatedAt", op: "older_than_days", value: 200 },
    ]);
    expect(notStale.rows).toEqual([]);

    const month = await query(u, [owner, { attr: "expectedCloseDate", op: "in_this_month" }]);
    expect(month.rows.map((r) => r.id)).toEqual([old.id]);
    expect(month.rows.map((r) => r.id)).not.toContain(fresh.id);

    // tento týden: vytvořeno dnes ano, před dvěma týdny ne
    const created = await query(u, [owner, { attr: "createdAt", op: "in_this_week" }]);
    expect(created.rows.map((r) => r.id).sort()).toEqual([old.id, fresh.id].sort());
    await app.db
      .update(job)
      .set({ createdAt: new Date(Date.now() - 15 * DAY) })
      .where(eq(job.id, fresh.id));
    const created2 = await query(u, [owner, { attr: "createdAt", op: "in_this_week" }]);
    expect(created2.rows.map((r) => r.id)).toEqual([old.id]);
    // chybějící hodnota u operátoru, který ji chce, je česká chyba
    await expect(query(u, [{ attr: "updatedAt", op: "older_than_days" }])).rejects.toThrow(
      /počet dnů/,
    );
  });

  it("měsíc a týden se počítají podle dnešního dne v Praze (hranice měsíce)", async () => {
    const u = await boss();
    const owner = { attr: "manager", op: "is", value: u.id };
    const today = todayIso();
    const monthStart = `${today.slice(0, 7)}-01`;
    const lastMonth = addDaysIso(monthStart, -1);
    const nextMonth = addMonthsIso(monthStart, 1);
    const a = await mkJob(u, u, { expectedCloseDate: monthStart });
    const b = await mkJob(u, u, { expectedCloseDate: lastMonth });
    const c = await mkJob(u, u, { expectedCloseDate: nextMonth });
    const r = await query(u, [owner, { attr: "expectedCloseDate", op: "in_this_month" }]);
    expect(r.rows.map((x) => x.id)).toEqual([a.id]);
    expect(r.rows.map((x) => x.id)).not.toContain(b.id);
    expect(r.rows.map((x) => x.id)).not.toContain(c.id);
  });
});

describe("výchozí pohledy CRM nad skutečnými daty", () => {
  const view = (name: string) => CRM_VIEWS.find((v) => v.name === name)!;
  const run = async (u: User, name: string) => {
    const v = view(name);
    const mine = { attr: "manager", op: "is", value: u.id };
    const r = await queryRecords(u.ctx, registry, jobE, {
      filters: { op: "and", conditions: [mine, v.config.filters!] },
      sort: v.config.sort ?? [],
      limit: 100,
    });
    return r.rows.map((x) => x.id);
  };

  it("každý pohled jde provést a vrací to, co má", async () => {
    const u = await boss();
    const plain = await mkJob(u, u); // bez aktivity
    const planned = await mkJob(u, u, { expectedCloseDate: todayIso() });
    await mkActivity(u, planned.id, { dueAt: new Date(Date.now() + DAY) });
    await recomputeJobCrm(u.ctx, planned.id);
    const rotten = await mkJob(u, u);
    await app.db.update(job).set({ crmRotting: true }).where(eq(job.id, rotten.id));
    const ancient = await mkJob(u, u);
    await app.db
      .update(job)
      .set({
        updatedAt: new Date(Date.now() - 100 * DAY),
        crmStageEnteredAt: new Date(Date.now() - 40 * DAY),
      })
      .where(eq(job.id, ancient.id));
    const lostNow = await mkJob(u, u);
    await loseDeal(u.ctx, lostNow.id, { reasonKey: "price" }, deps());
    const lostOld = await mkJob(u, u);
    await loseDeal(u.ctx, lostOld.id, { reasonKey: "price" }, deps());
    await app.db
      .update(job)
      .set({ phaseChangedAt: new Date(Date.now() - 120 * DAY) })
      .where(eq(job.id, lostOld.id));
    const arch = await mkJob(u, u);
    await archiveDeal(u.ctx, arch.id);

    // žádný pohled nespadne (platné atributy i operátory)
    for (const v of CRM_VIEWS) await run(u, v.name);

    const mineOpen = await run(u, "Moje otevřené");
    expect(mineOpen).toEqual(expect.arrayContaining([plain.id, planned.id, rotten.id, ancient.id]));
    for (const x of [lostNow.id, lostOld.id, arch.id]) expect(mineOpen).not.toContain(x);

    const noNext = await run(u, "Bez další aktivity");
    expect(noNext).toContain(plain.id);
    expect(noNext).not.toContain(planned.id);
    expect(noNext).not.toContain(arch.id);

    expect(await run(u, "Zhnilé")).toEqual([rotten.id]);
    expect(await run(u, "Uzavření tento měsíc")).toEqual([planned.id]);
    const lostQuarter = await run(u, "Prohrané za čtvrtletí");
    expect(lostQuarter).toEqual([lostNow.id]);

    expect(await run(u, "Čištění: bez úpravy 90 dní")).toEqual([ancient.id]);
    expect(await run(u, "Čištění: v první fázi déle než 30 dní")).toEqual([ancient.id]);
    const noActivityAtAll = await run(u, "Čištění: otevřené bez aktivit");
    expect(noActivityAtAll).toEqual(expect.arrayContaining([plain.id, rotten.id, ancient.id]));
    expect(noActivityAtAll).not.toContain(planned.id);
  });

  it("filtr vlastníka (id uživatele) platí i s uloženým pohledem a cizí obchody nepropustí", async () => {
    const me = await boss();
    const other = await boss();
    const theirs = await mkJob(other, other);
    expect(await run(me, "Bez další aktivity")).not.toContain(theirs.id);
  });
});
