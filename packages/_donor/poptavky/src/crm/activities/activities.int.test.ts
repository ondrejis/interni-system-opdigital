import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLookup, ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  queryRecords,
  registerEntityPolicies,
  resolveEntity,
  setPhaseHooks,
  updateRecord,
  type EntityRegistry,
} from "@rebar/core/entities";
import type { CommandDef, ModuleDeps } from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { PermissionError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, isWorkday, todayIso, zonedToUtc } from "@rebar/core/time";
import { company, person } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job } from "@rebar/zakazky/schema";
import { jobEntity, server as zakazkyServer } from "@rebar/zakazky/server";
import { manifest } from "../../index";
import { inquiryEntity } from "../../server";
import { crmActivity, crmNote } from "../../schema";
import { crmHooks } from "../hooks";
import { ensureCrmDefaults } from "../seed";
import { activitiesLayer, activityIcsEvents } from "./calendar";
import { activityCommands } from "./commands";
import { activityEntities, activityEntity } from "./entities";
import { notifyDealsWithoutActivity, refreshRotting, sendActivityDigests } from "./jobs";
import { listMine } from "./queries";
import { buildTimeline } from "./timeline";
import { createFirstActivity } from "../deals/first-activity";

/** Aktivity CRM proti PostgreSQL: příkazy, přepočet zakázky, rozsah „jen moje“, časová osa, upozornění, kalendář. */
const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    calendarLayers: [],
    diaryPrefill: [],
    emit: async () => {},
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([
    companyEntity,
    personEntity,
    inquiryEntity,
    jobEntity,
    ...activityEntities,
  ]);
  registerEntityPolicies(registry);
  for (const m of [manifest, zakazkyManifest]) {
    for (const p of m.seed.pipelines ?? []) await ensurePipeline(app.db, p);
    for (const l of "lookups" in m.seed ? m.seed.lookups : []) await ensureLookup(app.db, l);
    if ("series" in m.seed) await ensureSeries(app.db, m.seed.series);
  }
  await ensureCrmDefaults(app.db);
  setPhaseHooks([...(zakazkyServer.phaseHooks ?? []), ...crmHooks]);
});

const run = async (name: string, ctx: unknown, input: unknown) => {
  const c = activityCommands.find((x) => x.name === name) as CommandDef | undefined;
  if (!c) throw new Error(`Příkaz ${name} neexistuje.`);
  return c.handler(ctx as never, c.input.parse(input), deps()) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const office = (name?: string) =>
  makeUser(
    app.db,
    [
      ["poptavky.read", "all"],
      ["poptavky.write", "all"],
      ["zakazky.read", "all"],
      ["zakazky.write", "all"],
      ["zakazky.finance", "all"],
      ["kontakty.read", "all"],
      ["kontakty.write", "all"],
    ],
    name ? { name } : {},
  );
/** Obchodník s rozsahem „jen moje“. */
const seller = () =>
  makeUser(app.db, [
    ["poptavky.read", "own"],
    ["poptavky.write", "own"],
    ["zakazky.read", "own"],
    ["zakazky.write", "own"],
    ["kontakty.read", "all"],
  ]);
/** Montér: CRM nevidí, zakázky jen své, ceny ne. */
const worker = () =>
  makeUser(app.db, [
    ["zakazky.read", "own"],
    ["kontakty.read", "all"],
  ]);

const tag = () => randomBytes(3).toString("hex");
type User = Awaited<ReturnType<typeof office>>;

async function mkCompany() {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Firma ${tag()}` })
    .returning();
  return c!;
}
async function mkJob(manager: User | null, over: Partial<typeof job.$inferInsert> = {}) {
  const c = over.companyId ? { id: over.companyId } : await mkCompany();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages.find(
    (s) => s.name === "Nová poptávka",
  )!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `T-${tag()}${tag()}`,
      title: `Zakázka ${tag()}`,
      companyId: c.id,
      stageId: stage.id,
      phase: "inquiry",
      ...(manager ? { managerId: manager.id } : {}),
      ...over,
    })
    .returning();
  return j!;
}
const rawJob = async (id: string) => (await app.db.select().from(job).where(eq(job.id, id)))[0]!;

/** Dnešek, nebo nejbližší pracovní den (plánované úlohy o víkendu nic neposílají). */
function nextWorkday() {
  let day = todayIso();
  while (!isWorkday(day)) day = addDaysIso(day, 1);
  return day;
}

const inDays = (n: number, time = "10:00") =>
  zonedToUtc(addDaysIso(todayIso(), n), time).toISOString();

describe("příkazy aktivit a přepočet zakázky", () => {
  it("založení aktivity přepočte zakázku; dokončení vrátí návrh další a zakázka přijde o otevřenou aktivitu", async () => {
    const u = await office();
    const j = await mkJob(u);
    const created = await run("crm.activity.create", u.ctx, {
      typeKey: "call",
      subject: "Zavolat investorovi",
      dueAt: inDays(1),
      jobId: j.id,
    });
    expect(created).toMatchObject({
      typeKey: "call",
      subject: "Zavolat investorovi",
      state: "future",
      assigneeId: u.id,
      jobId: j.id,
      companyId: j.companyId,
      durationMin: 15,
    });
    let row = await rawJob(j.id);
    expect(row.crmOpenActivities).toBe(1);
    expect(row.crmNextActivityAt?.toISOString()).toBe(created.dueAt);

    const done = await run("crm.activity.complete", u.ctx, {
      id: created.id,
      outcome: "Dovolal jsem se, pošle podklady",
    });
    expect(done.activity).toMatchObject({
      state: "done",
      outcome: "Dovolal jsem se, pošle podklady",
      doneById: u.id,
    });
    expect(done.next).toBeNull();
    expect(done.suggestion).toMatchObject({
      typeKey: "call",
      subject: "Zavolat investorovi",
      jobId: j.id,
      assigneeId: u.id,
    });
    expect(new Date(done.suggestion.dueAt).getTime()).toBeGreaterThan(Date.now());
    row = await rawJob(j.id);
    expect(row.crmOpenActivities).toBe(0);
    expect(row.crmNextActivityAt).toBeNull();
    expect(row.crmLastActivityAt).not.toBeNull();

    // opakované dokončení nic nemění a nehlásí chybu
    const again = await run("crm.activity.complete", u.ctx, { id: created.id });
    expect(again.activity.doneAt).toBe(done.activity.doneAt);
  });

  it("dokončení s další aktivitou ji rovnou založí a zakázka ukazuje tu nejbližší", async () => {
    const u = await office();
    const j = await mkJob(u);
    const a = await run("crm.activity.create", u.ctx, {
      typeKey: "meeting",
      subject: "Schůzka na stavbě",
      dueAt: inDays(0, "23:30"),
      jobId: j.id,
    });
    const r = await run("crm.activity.complete", u.ctx, {
      id: a.id,
      next: { typeKey: "email", subject: "Poslat nabídku", dueAt: inDays(3), jobId: j.id },
    });
    expect(r.next).toMatchObject({ typeKey: "email", subject: "Poslat nabídku", state: "future" });
    const row = await rawJob(j.id);
    expect(row.crmOpenActivities).toBe(1);
    expect(row.crmNextActivityAt?.toISOString()).toBe(r.next.dueAt);
  });

  it("aktivita po termínu se počítá, celodenní je po termínu až od dalšího dne; odložení a znovuotevření", async () => {
    const u = await office();
    const j = await mkJob(u);
    const late = await run("crm.activity.create", u.ctx, {
      typeKey: "task",
      subject: "Zpožděný úkol",
      dueAt: inDays(-2),
      jobId: j.id,
    });
    const today = await run("crm.activity.create", u.ctx, {
      typeKey: "deadline",
      subject: "Termín dnes",
      dueAt: inDays(0, "15:00"),
      allDay: true,
      jobId: j.id,
    });
    expect(late.state).toBe("overdue");
    expect(today).toMatchObject({ state: "today", allDay: true, durationMin: null });
    expect(new Date(today.dueAt).toISOString()).toBe(zonedToUtc(todayIso(), "00:00").toISOString());
    expect((await rawJob(j.id)).crmOverdueActivities).toBe(1);

    const snoozed = await run("crm.activity.snooze", u.ctx, { id: late.id, days: 2 });
    expect(snoozed.state).toBe("future");
    expect(snoozed.dueAt).toBe(zonedToUtc(addDaysIso(todayIso(), 2), "10:00").toISOString());
    expect((await rawJob(j.id)).crmOverdueActivities).toBe(0);

    await run("crm.activity.complete", u.ctx, { id: late.id });
    await expect(run("crm.activity.snooze", u.ctx, { id: late.id, days: 1 })).rejects.toThrow(
      /nejdřív ji otevřete/,
    );
    const reopened = await run("crm.activity.reopen", u.ctx, { id: late.id });
    expect(reopened.state).not.toBe("done");
    expect((await rawJob(j.id)).crmOpenActivities).toBe(2);

    await run("crm.activity.delete", u.ctx, { id: late.id });
    await run("crm.activity.delete", u.ctx, { id: today.id });
    expect((await rawJob(j.id)).crmOpenActivities).toBe(0);
    const list = await run("crm.activity.listForDeal", u.ctx, { jobId: j.id });
    expect(list).toEqual([]);
  });

  it("úprava termínu, typu, vazeb a přiřazení; změna zakázky přepočte starou i novou", async () => {
    const u = await office();
    const other = await office();
    const j1 = await mkJob(u);
    const j2 = await mkJob(u);
    const a = await run("crm.activity.create", u.ctx, {
      typeKey: "call",
      subject: "Hovor",
      dueAt: inDays(1),
      jobId: j1.id,
    });
    const upd = await run("crm.activity.update", u.ctx, {
      id: a.id,
      typeKey: "site_visit",
      subject: "Obhlídka",
      dueAt: inDays(4, "08:00"),
      jobId: j2.id,
      assigneeId: other.id,
      location: "Husova 12, Plzeň",
      priority: "high",
    });
    expect(upd).toMatchObject({
      typeKey: "site_visit",
      subject: "Obhlídka",
      jobId: j2.id,
      assigneeId: other.id,
      location: "Husova 12, Plzeň",
      priority: "high",
    });
    expect((await rawJob(j1.id)).crmOpenActivities).toBe(0);
    expect((await rawJob(j2.id)).crmOpenActivities).toBe(1);
    // zrušení termínu a vazby
    const cleared = await run("crm.activity.update", u.ctx, {
      id: a.id,
      dueAt: null,
      jobId: null,
      companyId: null,
      personId: null,
      location: "",
    });
    expect(cleared).toMatchObject({ dueAt: null, state: "nodate", jobId: null, location: null });
    expect((await rawJob(j2.id)).crmOpenActivities).toBe(0);
    // audit změn
    const log = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(eq(schema.auditLog.entityType, "crm_activity"), eq(schema.auditLog.entityId, a.id)),
      );
    expect(log.map((l) => l.action).sort()).toEqual(["create", "update", "update"]);
  });

  it("neznámý typ, vypnutý typ, cizí uživatel a neexistující zakázka končí českou větou", async () => {
    const u = await office();
    await expect(
      run("crm.activity.create", u.ctx, { typeKey: "nevim", subject: "x" }),
    ).rejects.toThrow(/Typ aktivity neexistuje/);
    await expect(run("crm.activity.create", u.ctx, { subject: "x" })).rejects.toThrow(
      /Vyberte typ aktivity/,
    );
    await expect(
      run("crm.activity.create", u.ctx, {
        typeKey: "call",
        subject: "x",
        jobId: crypto.randomUUID(),
      }),
    ).rejects.toThrow();
    await app.db.update(schema.user).set({ active: false }).where(eq(schema.user.id, u.id));
    const ghost = await office();
    await expect(
      run("crm.activity.create", ghost.ctx, { typeKey: "call", subject: "x", assigneeId: u.id }),
    ).rejects.toThrow(/neexistuje nebo je deaktivovaný/);
    await app.db.update(schema.user).set({ active: true }).where(eq(schema.user.id, u.id));
    await expect(
      run("crm.activity.create", u.ctx, { typeKey: "call", subject: "   " }),
    ).rejects.toThrow();
  });

  it("zalogovaný hovor vznikne rovnou jako hotový a započítá se do poslední aktivity", async () => {
    const u = await office();
    const j = await mkJob(u);
    const a = await run("crm.activity.create", u.ctx, {
      typeKey: "call",
      subject: "Telefonát s klientem",
      jobId: j.id,
      done: true,
      outcome: "Chce nabídku do pátku",
    });
    expect(a).toMatchObject({ state: "done", outcome: "Chce nabídku do pátku" });
    const row = await rawJob(j.id);
    expect(row.crmOpenActivities).toBe(0);
    expect(row.crmLastActivityAt).not.toBeNull();
  });
});

describe("rozsah „jen moje“ a oprávnění", () => {
  it("obchodník vidí aktivity přiřazené sobě a na svých zakázkách, cizí ne a upravit je nesmí", async () => {
    const boss = await office();
    const me = await seller();
    const stranger = await seller();
    const myJob = await mkJob(me);
    const foreignJob = await mkJob(boss);
    const mineAssigned = await run("crm.activity.create", boss.ctx, {
      typeKey: "call",
      subject: `Přiřazená ${tag()}`,
      dueAt: inDays(1),
      jobId: foreignJob.id,
      assigneeId: me.id,
    });
    const onMyJob = await run("crm.activity.create", boss.ctx, {
      typeKey: "task",
      subject: `Na mé zakázce ${tag()}`,
      dueAt: inDays(1),
      jobId: myJob.id,
      assigneeId: boss.id,
    });
    const foreign = await run("crm.activity.create", boss.ctx, {
      typeKey: "task",
      subject: `Cizí ${tag()}`,
      dueAt: inDays(1),
      jobId: foreignJob.id,
      assigneeId: boss.id,
    });

    const visible = async (u: User) =>
      (await run("crm.activity.listMine", u.ctx, { scope: "all", range: "open" })).rows.map(
        (r: { id: string }) => r.id,
      );
    const seen = await visible(me);
    expect(seen).toContain(mineAssigned.id);
    expect(seen).toContain(onMyJob.id);
    expect(seen).not.toContain(foreign.id);
    expect(await visible(stranger)).toEqual([]);
    expect(await visible(boss)).toEqual(
      expect.arrayContaining([mineAssigned.id, onMyJob.id, foreign.id]),
    );

    // „moje“ = jen přiřazené mně (vedoucí zakázky ji uvidí v „všech“, ne v „mých“)
    const mine = await run("crm.activity.listMine", me.ctx, { scope: "mine", range: "open" });
    expect(mine.rows.map((r: { id: string }) => r.id)).toEqual([mineAssigned.id]);

    await expect(run("crm.activity.complete", me.ctx, { id: foreign.id })).rejects.toThrow(
      /nenalezena/,
    );
    await expect(run("crm.activity.get", stranger.ctx, { id: onMyJob.id })).rejects.toThrow(
      /nenalezena/,
    );
    await expect(
      run("crm.activity.delete", stranger.ctx, { id: mineAssigned.id }),
    ).rejects.toThrow();
    // vedoucí zakázky smí aktivitu na své zakázce dokončit, i když je přiřazená jinému
    await run("crm.activity.complete", me.ctx, { id: onMyJob.id });
    // listForDeal cizí zakázky se tváří jako neexistující
    await expect(
      run("crm.activity.listForDeal", me.ctx, { jobId: foreignJob.id }),
    ).rejects.toThrow();
  });

  it("rozsah „jen moje“ zakládá aktivity jen sobě nebo na svou zakázku", async () => {
    const boss = await office();
    const me = await seller();
    const foreignJob = await mkJob(boss);
    const myJob = await mkJob(me);
    await expect(
      run("crm.activity.create", me.ctx, { typeKey: "call", subject: "x", assigneeId: boss.id }),
    ).rejects.toThrow(PermissionError);
    await expect(
      run("crm.activity.create", me.ctx, { typeKey: "call", subject: "x", jobId: foreignJob.id }),
    ).rejects.toThrow(); // cizí zakázku nevidí
    await run("crm.activity.create", me.ctx, {
      typeKey: "call",
      subject: "ok",
      assigneeId: boss.id,
      jobId: myJob.id,
    });
    await run("crm.activity.create", me.ctx, { typeKey: "call", subject: "sobě" });
  });

  it("bez oprávnění ke CRM (montér) se aktivity nevrátí vůbec", async () => {
    const boss = await office();
    const w = await worker();
    const j = await mkJob(boss);
    await run("crm.activity.create", boss.ctx, { typeKey: "call", subject: "Tajné", jobId: j.id });
    await expect(listMine(w.ctx, registry, { scope: "all" })).rejects.toThrow(PermissionError);
    await expect(buildTimeline(w.ctx, registry, { jobId: j.id })).rejects.toThrow();
  });

  it("entita crm_activity v registru respektuje rozsah a nedovolí obejít příkazy", async () => {
    const boss = await office();
    const me = await seller();
    const stranger = await seller();
    const j = await mkJob(boss);
    const a = await run("crm.activity.create", boss.ctx, {
      typeKey: "task",
      subject: `Tabulka ${tag()}`,
      jobId: j.id,
      assigneeId: me.id,
    });
    const e = await resolveEntity(app.db, activityEntity);
    const mineRows = await queryRecords(me.ctx, registry, e, { q: a.subject });
    expect(mineRows.rows.map((r) => r.id)).toEqual([a.id]);
    expect((await queryRecords(stranger.ctx, registry, e, { q: a.subject })).total).toBe(0);
    // změna zakázky přímo v tabulce přepočte obě zakázky
    const j2 = await mkJob(boss);
    await updateRecord(boss.ctx, registry, e, a.id, { job: j2.id });
    expect((await rawJob(j.id)).crmOpenActivities).toBe(0);
    expect((await rawJob(j2.id)).crmOpenActivities).toBe(1);
    await expect(
      updateRecord(boss.ctx, registry, e, a.id, { dueAt: "2026-12-01" }),
    ).rejects.toThrow();
  });

  it("typy aktivit: čte každý s CRM, mění jen správce nastavení; typ se nemaže a vypnutý se nenabízí", async () => {
    const boss = await office();
    const admin = await makeUser(app.db, [
      ["poptavky.read", "all"],
      ["settings.manage", "all"],
    ]);
    const types = await resolveEntity(app.db, activityEntities[2]!);
    const before = await run("crm.activity.types", boss.ctx, {});
    expect(before.map((t: { key: string }) => t.key)).toEqual(
      expect.arrayContaining(["call", "meeting", "task", "deadline", "email", "site_visit"]),
    );
    const { createRecord, deleteRecord } = await import("@rebar/core/entities");
    await expect(
      createRecord(boss.ctx, registry, types, { name: "Revize", icon: "eye" }),
    ).rejects.toThrow();
    const t = await createRecord(admin.ctx, registry, types, {
      name: `Revize ${tag()}`,
      icon: "eye",
    });
    expect(t.row.key).toMatch(/^revize_/);
    expect(t.row.active).toBe(true);
    await expect(deleteRecord(admin.ctx, types, t.row.id)).rejects.toThrow(/vypněte/);
    await updateRecord(admin.ctx, registry, types, t.row.id, { active: false });
    const after = await run("crm.activity.types", boss.ctx, {});
    expect(after.map((x: { id: string }) => x.id)).not.toContain(t.row.id);
    await expect(
      run("crm.activity.create", boss.ctx, { typeId: t.row.id, subject: "x" }),
    ).rejects.toThrow(/je vypnutý/);
  });
});

describe("další kroky, poznámky a časová osa", () => {
  it("Další kroky: nadcházející aktivity a připnuté poznámky; poznámku upravuje autor, připíná kdokoli s právem", async () => {
    const boss = await office();
    const me = await seller();
    const j = await mkJob(me);
    const n1 = await run("crm.note.create", me.ctx, {
      entityType: "job",
      entityId: j.id,
      body: "Klient chce pergolu",
      pinned: true,
    });
    const n2 = await run("crm.note.create", me.ctx, {
      entityType: "job",
      entityId: j.id,
      body: "Volal sousedovi",
    });
    await run("crm.activity.create", me.ctx, {
      typeKey: "call",
      subject: "Později",
      dueAt: inDays(5),
      jobId: j.id,
    });
    await run("crm.activity.create", me.ctx, {
      typeKey: "call",
      subject: "Dřív",
      dueAt: inDays(1),
      jobId: j.id,
    });
    await run("crm.activity.create", me.ctx, {
      typeKey: "call",
      subject: "Bez termínu",
      jobId: j.id,
    });
    const up = await run("crm.activity.listUpcoming", me.ctx, { jobId: j.id });
    expect(up.activities.map((a: { subject: string }) => a.subject)).toEqual([
      "Dřív",
      "Později",
      "Bez termínu",
    ]);
    expect(up.notes.map((n: { id: string }) => n.id)).toEqual([n1.id]);

    await run("crm.note.pin", boss.ctx, { id: n2.id, pinned: true });
    expect((await run("crm.activity.listUpcoming", me.ctx, { jobId: j.id })).notes).toHaveLength(2);
    // cizí obchodník se vlastní rozsahem nedostane ani k cizí poznámce
    const stranger = await seller();
    await expect(run("crm.note.pin", stranger.ctx, { id: n1.id, pinned: false })).rejects.toThrow();
    await expect(run("crm.note.update", stranger.ctx, { id: n1.id, body: "x" })).rejects.toThrow();
    // správce s rozsahem „vše“ smí opravit cizí poznámku, autor vlastní
    expect(
      (await run("crm.note.update", me.ctx, { id: n1.id, body: "Pergola, ne altán" })).body,
    ).toBe("Pergola, ne altán");
    await run("crm.note.update", boss.ctx, { id: n1.id, body: "Pergola, ne altán (potvrzeno)" });
    await run("crm.note.delete", me.ctx, { id: n2.id });
    expect(
      (await app.db.select().from(crmNote).where(eq(crmNote.id, n2.id)))[0]?.deletedAt,
    ).not.toBeNull();
  });

  it("časová osa zakázky skládá hotové aktivity, poznámky s komentáři, komentáře a protokol změn", async () => {
    const boss = await office();
    const j = await mkJob(boss);
    const a = await run("crm.activity.create", boss.ctx, {
      typeKey: "call",
      subject: "Hotový hovor",
      jobId: j.id,
      done: true,
    });
    await run("crm.activity.create", boss.ctx, {
      typeKey: "call",
      subject: "Otevřený hovor",
      dueAt: inDays(2),
      jobId: j.id,
    });
    const note = await run("crm.note.create", boss.ctx, {
      entityType: "job",
      entityId: j.id,
      body: "Poznámka k zakázce",
    });
    const { addComment } = await import("@rebar/core/collab");
    await addComment(boss.ctx, {
      entityType: "crm_note",
      entityId: note.id,
      body: "Komentář k poznámce",
    });
    await addComment(boss.ctx, { entityType: "job", entityId: j.id, body: "Komentář k zakázce" });
    const jobE = await resolveEntity(app.db, jobEntity);
    await updateRecord(boss.ctx, registry, jobE, j.id, { title: `Přejmenováno ${tag()}` });

    const t = await run("crm.timeline.get", boss.ctx, { jobId: j.id });
    const kinds = t.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["activity", "note", "comment", "audit"]));
    const activities = t.items.filter((i: { kind: string }) => i.kind === "activity");
    expect(activities.map((i: { activity: { id: string } }) => i.activity.id)).toEqual([a.id]);
    const n = t.items.find((i: { kind: string }) => i.kind === "note");
    expect(n.comments.map((c: { body: string }) => c.body)).toEqual(["Komentář k poznámce"]);
    // od nejnovějšího
    const ats = t.items.map((i: { at: string }) => i.at);
    expect([...ats].sort().reverse()).toEqual(ats);
    expect(t.labels.job[j.id]).toBeTruthy();
  });

  it("souhrnná osa firmy sbírá dění ze všech jejích zakázek a osob, osoba z jejích zakázek", async () => {
    const boss = await office();
    const stranger = await seller();
    const c = await mkCompany();
    const [p] = await app.db
      .insert(person)
      .values({ name: `Osoba ${tag()}`, companyId: c.id })
      .returning();
    const j1 = await mkJob(boss, { companyId: c.id, personId: p!.id });
    const j2 = await mkJob(boss, { companyId: c.id });
    const note1 = await run("crm.note.create", boss.ctx, {
      entityType: "job",
      entityId: j1.id,
      body: "Z první zakázky",
    });
    await run("crm.note.create", boss.ctx, {
      entityType: "job",
      entityId: j2.id,
      body: "Z druhé zakázky",
    });
    await run("crm.note.create", boss.ctx, {
      entityType: "person",
      entityId: p!.id,
      body: "K osobě",
    });
    await run("crm.activity.create", boss.ctx, {
      typeKey: "meeting",
      subject: "Schůzka u firmy",
      jobId: j2.id,
      done: true,
    });

    const bodies = (r: { items: { kind: string; note?: { body: string } }[] }) =>
      r.items
        .filter((i) => i.kind === "note")
        .map((i) => i.note!.body)
        .sort();
    const direct = await run("crm.timeline.get", boss.ctx, { companyId: c.id });
    expect(bodies(direct)).toEqual([]);
    const all = await run("crm.timeline.get", boss.ctx, { companyId: c.id, aggregate: true });
    expect(bodies(all)).toEqual(["K osobě", "Z druhé zakázky", "Z první zakázky"]);
    expect(all.items.some((i: { kind: string }) => i.kind === "activity")).toBe(true);
    const ofPerson = await run("crm.timeline.get", boss.ctx, { personId: p!.id, aggregate: true });
    expect(bodies(ofPerson)).toEqual(["K osobě", "Z první zakázky"]);

    // obchodník, který zakázky nevede, souhrn firmy nevidí (poznámky ani aktivity zakázek)
    const seen = await run("crm.timeline.get", stranger.ctx, { companyId: c.id, aggregate: true });
    expect(
      seen.items.filter((i: { kind: string }) => i.kind === "note" || i.kind === "activity"),
    ).toEqual([]);
    expect(note1.id).toBeTruthy();
  });

  it("v časové ose zakázky se bez oprávnění k cenám nezobrazí změna částky", async () => {
    const boss = await office();
    const me = await seller(); // bez zakazky.finance
    const j = await mkJob(me);
    const jobE = await resolveEntity(app.db, jobEntity);
    await updateRecord(boss.ctx, registry, jobE, j.id, { value: 987_654_00 });
    const forBoss = await run("crm.timeline.get", boss.ctx, { jobId: j.id });
    expect(JSON.stringify(forBoss)).toMatch(/987/);
    const forMe = await run("crm.timeline.get", me.ctx, { jobId: j.id });
    expect(JSON.stringify(forMe)).not.toMatch(/987/);
  });
});

describe("první aktivita při kvalifikaci", () => {
  it("createFirstActivity založí aktivitu s vazbami na zakázku, firmu i osobu a přepočte zakázku", async () => {
    const boss = await office();
    const c = await mkCompany();
    const [p] = await app.db
      .insert(person)
      .values({ name: `Kontakt ${tag()}`, companyId: c.id })
      .returning();
    const j = await mkJob(boss, { companyId: c.id, personId: p!.id });
    const r = await createFirstActivity(
      boss.ctx,
      { jobId: j.id, companyId: c.id, personId: p!.id },
      {
        typeKey: "site_visit",
        subject: "Obhlídka na místě",
        dueAt: inDays(2),
        allDay: false,
        durationMin: undefined,
        note: undefined,
        assigneeId: undefined,
      },
    );
    const [row] = await app.db.select().from(crmActivity).where(eq(crmActivity.id, r!.id));
    expect(row).toMatchObject({
      jobId: j.id,
      companyId: c.id,
      personId: p!.id,
      assigneeId: boss.id,
      durationMin: 90,
    });
    expect((await rawJob(j.id)).crmOpenActivities).toBe(1);
  });
});

describe("upozornění", () => {
  const notesOf = (userId: string, kind: string) =>
    app.db
      .select()
      .from(schema.notification)
      .where(and(eq(schema.notification.userId, userId), eq(schema.notification.kind, kind)));

  it("přidělená aktivita upozorní přiřazeného, sobě upozornění nevzniká; změna přiřazení upozorní nového", async () => {
    const boss = await office();
    const colleague = await office();
    const j = await mkJob(boss);
    const mine = await run("crm.activity.create", boss.ctx, {
      typeKey: "call",
      subject: "Sobě",
      jobId: j.id,
    });
    expect(mine.assigneeId).toBe(boss.id);
    expect(await notesOf(boss.id, "crm.activity_assigned")).toEqual([]);
    const a = await run("crm.activity.create", boss.ctx, {
      typeKey: "meeting",
      subject: "Schůzka s Novákem",
      dueAt: inDays(1),
      jobId: j.id,
      assigneeId: colleague.id,
    });
    const got = await notesOf(colleague.id, "crm.activity_assigned");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ entityType: "crm_activity", entityId: a.id });
    expect(got[0]!.title).toBe("Schůzka: Schůzka s Novákem");
    expect(got[0]!.url).toBe(`/crm?record=${j.id}`);
    // předání dál
    const third = await office();
    await run("crm.activity.update", boss.ctx, { id: a.id, assigneeId: third.id });
    expect(await notesOf(third.id, "crm.activity_assigned")).toHaveLength(1);
    // úprava bez změny přiřazeného nic nepošle
    await run("crm.activity.update", boss.ctx, { id: a.id, subject: "Jiný předmět" });
    expect(await notesOf(third.id, "crm.activity_assigned")).toHaveLength(1);
  });

  it("příjemce bez práva číst aktivitu upozornění nedostane", async () => {
    const boss = await office();
    const w = await worker();
    await run("crm.activity.create", boss.ctx, {
      typeKey: "call",
      subject: "Pro montéra",
      assigneeId: w.id,
    }).catch(() => {});
    expect(await notesOf(w.id, "crm.activity_assigned")).toEqual([]);
  });

  it("ranní přehled: jedno upozornění na člověka, idempotentní, o víkendu nic", async () => {
    // pracovní den: středa 14. 10. 2026 (termíny pro ranní přehled se zakládají přímo, aby nezávisely na dnešku)
    const wednesday = zonedToUtc("2026-10-14", "07:10");
    const u2 = await office();
    const w1 = zonedToUtc("2026-10-13", "09:00").toISOString();
    const w2 = zonedToUtc("2026-10-14", "16:00").toISOString();
    const w3 = zonedToUtc("2026-10-15", "09:00").toISOString();
    for (const [subject, dueAt] of [
      ["Včera", w1],
      ["Dnes", w2],
      ["Zítra", w3],
    ] as const)
      await app.db.insert(crmActivity).values({
        typeId: (await run("crm.activity.types", u2.ctx, {})).find(
          (t: { key: string }) => t.key === "call",
        ).id,
        subject,
        dueAt: new Date(dueAt),
        assigneeId: u2.id,
      });
    const r1 = await sendActivityDigests(app.db, wednesday);
    expect(r1.created).toBeGreaterThanOrEqual(1);
    const got = await notesOf(u2.id, "crm.activities_today");
    expect(got).toHaveLength(1);
    expect(got[0]!.title).toBe("Dnes: 1 aktivita na dnes, 1 po termínu");
    expect(got[0]!.body).toContain("Včera");
    expect(got[0]!.body).toContain("Dnes");
    expect(got[0]!.body).not.toContain("Zítra");
    await sendActivityDigests(app.db, wednesday);
    expect(await notesOf(u2.id, "crm.activities_today")).toHaveLength(1);
    // sobota: nic
    const saturday = zonedToUtc("2026-10-17", "07:10");
    expect(await sendActivityDigests(app.db, saturday)).toEqual({ users: 0, created: 0 });
  });

  it("zakázky bez další aktivity: jen otevřené, nearchivované a starší než dnes; idempotentní", async () => {
    const owner = await office();
    const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
    const old = new Date(Date.now() - 3 * 86_400_000);
    const noActivity = await mkJob(owner, { createdAt: old, title: `Bez aktivity ${tag()}` });
    const withActivity = await mkJob(owner, { createdAt: old, title: `S aktivitou ${tag()}` });
    const archived = await mkJob(owner, {
      createdAt: old,
      title: `Archiv ${tag()}`,
      crmArchivedAt: new Date(),
    });
    const won = await mkJob(owner, {
      createdAt: old,
      title: `Vyhraná ${tag()}`,
      phase: "execution",
      stageId: stage.id,
    });
    const fresh = await mkJob(owner, { title: `Dnešní ${tag()}` });
    await run("crm.activity.create", owner.ctx, {
      typeKey: "call",
      subject: "Něco",
      dueAt: inDays(2),
      jobId: withActivity.id,
    });
    const at = zonedToUtc(nextWorkday(), "07:15");
    const r = await notifyDealsWithoutActivity(app.db, at);
    expect(r.deals).toBeGreaterThanOrEqual(1);
    const [n] = await notesOf(owner.id, "crm.deals_without_activity");
    expect(n).toBeTruthy();
    expect(n!.body).toContain(noActivity.title);
    expect(n!.body).not.toContain(withActivity.title);
    expect(n!.body).not.toContain(archived.title);
    expect(n!.body).not.toContain(won.title);
    expect(n!.body).not.toContain(fresh.title);
    await notifyDealsWithoutActivity(app.db, at);
    expect(await notesOf(owner.id, "crm.deals_without_activity")).toHaveLength(1);
  });

  it("denní úloha hnití přepočte zakázky a upozorní jen na čerstvě zhnilé", async () => {
    const owner = await office();
    const quiet = await office();
    // „Nová poptávka“ hnije po 3 dnech bez pohybu
    const rotten = await mkJob(owner, { title: `Hnije ${tag()}` });
    const healthy = await mkJob(quiet, { title: `Zdravá ${tag()}` });
    const stageEntered = (d: number) => new Date(Date.now() - d * 86_400_000);
    await app.db
      .update(job)
      .set({ crmStageEnteredAt: stageEntered(3) })
      .where(eq(job.id, rotten.id));
    const { jobStageHistory } = await import("@rebar/zakazky/schema");
    await app.db
      .update(jobStageHistory)
      .set({ enteredAt: stageEntered(3) })
      .where(eq(jobStageHistory.jobId, rotten.id));
    const at = zonedToUtc(nextWorkday(), "05:30");
    const r = await refreshRotting(app.db, at);
    expect(r.recomputed).toBeGreaterThan(0);
    expect((await rawJob(rotten.id)).crmRotting).toBe(true);
    expect((await rawJob(healthy.id)).crmRotting).toBe(false);
    const [n] = await notesOf(owner.id, "crm.deals_rotting");
    expect(n).toBeTruthy();
    expect(n!.title).toBe("1 zakázka hnije");
    expect(n!.body).toContain(rotten.title);
    expect(await notesOf(quiet.id, "crm.deals_rotting")).toEqual([]);
    // opakované spuštění nic nezdvojí
    await refreshRotting(app.db, at);
    expect(await notesOf(owner.id, "crm.deals_rotting")).toHaveLength(1);
  });
});

describe("kalendář a odběr", () => {
  it("kalendářní vrstva ukáže moje aktivity v rozsahu (hotové šedě, po termínu červeně), cizí ne", async () => {
    const boss = await office();
    const other = await office();
    const j = await mkJob(boss);
    const inRange = await run("crm.activity.create", boss.ctx, {
      typeKey: "meeting",
      subject: `V rozsahu ${tag()}`,
      dueAt: inDays(1, "14:00"),
      durationMin: 60,
      jobId: j.id,
    });
    const fullDay = await run("crm.activity.create", boss.ctx, {
      typeKey: "deadline",
      subject: `Celý den ${tag()}`,
      dueAt: inDays(2),
      allDay: true,
    });
    const outside = await run("crm.activity.create", boss.ctx, {
      typeKey: "call",
      subject: `Mimo ${tag()}`,
      dueAt: inDays(40),
    });
    const notMine = await run("crm.activity.create", other.ctx, {
      typeKey: "call",
      subject: `Cizí ${tag()}`,
      dueAt: inDays(1),
    });
    const items = await activitiesLayer.items(
      boss.ctx,
      { from: todayIso(), to: addDaysIso(todayIso(), 7) },
      deps(),
    );
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.has(outside.id)).toBe(false);
    expect(byId.has(notMine.id)).toBe(false);
    const a = byId.get(inRange.id)!;
    expect(a).toMatchObject({
      layer: "crm.activities",
      title: `Schůzka: ${inRange.subject}`,
      allDay: false,
      start: `${addDaysIso(todayIso(), 1)}T14:00`,
      end: `${addDaysIso(todayIso(), 1)}T15:00`,
      href: `/crm?record=${j.id}`,
    });
    expect(byId.get(fullDay.id)).toMatchObject({ allDay: true, start: addDaysIso(todayIso(), 2) });
  });

  it("ICS: otevřené moje aktivity s UID, délkou a připomenutím; hotová a cizí ne; bez práva ke CRM nic", async () => {
    const boss = await office();
    const w = await worker();
    const j = await mkJob(boss);
    const open = await run("crm.activity.create", boss.ctx, {
      typeKey: "site_visit",
      subject: `Obhlídka ${tag()}`,
      dueAt: inDays(3, "08:00"),
      location: "Husova 12",
      note: "Vzít metr",
      jobId: j.id,
    });
    const done = await run("crm.activity.create", boss.ctx, {
      typeKey: "call",
      subject: `Hotová ${tag()}`,
      dueAt: inDays(1),
    });
    await run("crm.activity.complete", boss.ctx, { id: done.id });
    const events = await activityIcsEvents(app.db, boss.id, "example.test");
    const ev = events.find((e) => e.uid === `crm-activity-${open.id}@example.test`)!;
    expect(ev).toMatchObject({
      title: `Zaměření / obhlídka na místě: ${open.subject}`,
      location: "Husova 12",
      allDay: false,
      reminderMinutes: 15,
    });
    expect(ev.endsAt.getTime() - ev.startsAt.getTime()).toBe(90 * 60_000);
    expect(ev.description).toContain("Vzít metr");
    expect(events.some((e) => e.uid.includes(done.id))).toBe(false);
    expect(await activityIcsEvents(app.db, w.id, "example.test")).toEqual([]);
  });
});
