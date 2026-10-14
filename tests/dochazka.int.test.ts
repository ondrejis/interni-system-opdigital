import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  queryRecords,
  registerEntityPolicies,
  resolveEntity,
  type EntityRegistry,
} from "@rebar/core/entities";
import type {
  CostProvider,
  DiaryPrefillProvider,
  ModuleDeps,
  ModuleJob,
  ModuleJobDeps,
} from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { PermissionError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, localParts, todayIso, weekStartIso } from "@rebar/core/time";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job } from "@rebar/zakazky/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import { company } from "@rebar/kontakty/schema";
import { jobEntity } from "@rebar/zakazky/server";
import {
  approvals,
  clockBreak,
  clockIn,
  clockOut,
  clockStatus,
  lockMonth,
  month,
  remove,
  report,
  reviewWeek,
  save,
  sendEveningReminders,
  sendForgottenClockOut,
  sendMissingClockIn,
  server,
  submitWeek,
  timeEntry,
  timeEntryEntity,
  timeLock,
  week,
  withdrawWeek,
} from "@rebar/dochazka/server";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
let requireApproval = true;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
    diaryPrefill: [],
    emit: async () => {},
    settings: {
      get: async (_db: unknown, def: { key: string; default: Record<string, unknown> }) =>
        def.key === "dochazka" ? { ...def.default, requireApproval } : def.default,
    },
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity, timeEntryEntity]);
  registerEntityPolicies(registry);
  for (const p of zakazkyManifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, zakazkyManifest.seed.series);
});

const worker = () =>
  makeUser(app.db, [
    ["dochazka.own", "all"],
    ["dochazka.read", "own"],
  ]);
const boss = () =>
  makeUser(app.db, [
    ["dochazka.own", "all"],
    ["dochazka.read", "all"],
    ["dochazka.approve", "all"],
    ["dochazka.close_month", "all"],
    ["zakazky.economics", "all"], // mzdové náklady v přehledu vidí jen držitel ekonomiky zakázek
  ]);
/** Schvalovatel docházky bez ekonomiky (mistr): hodiny vidí, náklady ne. */
const approver = () =>
  makeUser(app.db, [
    ["dochazka.own", "all"],
    ["dochazka.read", "all"],
    ["dochazka.approve", "all"],
  ]);

// pracovní dny v minulém měsíci, ať testy nezávisí na dnešku (pondělí a úterý v týdnu 2026-03-02)
const MON = "2026-03-02";
const TUE = "2026-03-03";
const input = (cmd: { input: { parse: (v: unknown) => unknown } }, v: Record<string, unknown>) =>
  cmd.input.parse(v) as never;

describe("zápis docházky", () => {
  it("doba z od–do minus přestávka, snímek nákladu hodiny, jeden člověk a den do 24 h", async () => {
    requireApproval = true;
    const u = await worker();
    const a = await save.handler(
      u.ctx,
      input(save, {
        date: MON,
        kind: "work",
        startTime: "07:00",
        endTime: "15:30",
        breakMinutes: 30,
        note: "Zdění",
      }),
      deps(),
    );
    const [row] = await app.db.select().from(timeEntry).where(eq(timeEntry.id, a.id));
    expect(row).toMatchObject({
      minutes: 480,
      status: "draft",
      breakMinutes: 30,
      hourlyCostMinor: 250_00,
      userId: u.id,
    });
    // zapsané 8 h + 16,5 h > 24 h
    await expect(
      save.handler(u.ctx, input(save, { date: MON, kind: "work", hours: 16.5 }), deps()),
    ).rejects.toThrow(/víc než 24 h/);
    await save.handler(u.ctx, input(save, { date: MON, kind: "travel", hours: 1 }), deps());
    await expect(
      save.handler(
        u.ctx,
        input(save, { date: MON, kind: "work", startTime: "10:00", endTime: "09:00" }),
        deps(),
      ),
    ).rejects.toThrow(/po začátku/);
    await expect(
      save.handler(u.ctx, input(save, { date: MON, kind: "work" }), deps()),
    ).rejects.toThrow(/odpracovanou dobu/);
  });

  it("absence nemá zakázku; zápis za jiného smí jen schvalovatel; bez dochazka.own se nezapíše", async () => {
    const u = await worker();
    const other = await worker();
    const b = await boss();
    const [c] = await app.db
      .insert(company)
      .values({ name: `F ${randomBytes(2).toString("hex")}` })
      .returning();
    const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
    const [j] = await app.db
      .insert(job)
      .values({
        number: `D-${randomBytes(4).toString("hex")}`,
        title: "Dům",
        companyId: c!.id,
        stageId: stage.id,
      })
      .returning();
    const v = await save.handler(
      u.ctx,
      input(save, { date: TUE, kind: "vacation", hours: 8, jobId: j!.id }),
      deps(),
    );
    expect(
      (await app.db.select().from(timeEntry).where(eq(timeEntry.id, v.id)))[0]!.jobId,
    ).toBeNull();
    await expect(
      save.handler(
        u.ctx,
        input(save, { userId: other.id, date: TUE, kind: "work", hours: 1 }),
        deps(),
      ),
    ).rejects.toThrow(PermissionError);
    const forOther = await save.handler(
      b.ctx,
      input(save, { userId: other.id, date: TUE, kind: "work", hours: 1 }),
      deps(),
    );
    expect(
      (await app.db.select().from(timeEntry).where(eq(timeEntry.id, forOther.id)))[0]!.userId,
    ).toBe(other.id);
    const nobody = await makeUser(app.db, [["dochazka.read", "own"]]);
    await expect(
      save.handler(nobody.ctx, input(save, { date: TUE, kind: "work", hours: 1 }), deps()),
    ).rejects.toThrow(PermissionError);
  });

  it("bez schvalování se záznamy schvalují samy", async () => {
    requireApproval = false;
    try {
      const u = await worker();
      const a = await save.handler(
        u.ctx,
        input(save, { date: MON, kind: "work", hours: 4 }),
        deps(),
      );
      expect((await app.db.select().from(timeEntry).where(eq(timeEntry.id, a.id)))[0]!.status).toBe(
        "approved",
      );
    } finally {
      requireApproval = true;
    }
  });
});

describe("odeslání, schválení, vrácení", () => {
  it("celý oběh: odeslat → vrátit s důvodem → opravit → odeslat → schválit; autor schválené nezmění", async () => {
    const u = await worker();
    const b = await boss();
    const mon = await save.handler(
      u.ctx,
      input(save, { date: MON, kind: "work", hours: 8 }),
      deps(),
    );
    await expect(
      submitWeek.handler(b.ctx, input(submitWeek, { weekStart: "2026-02-23" }), deps()),
    ).rejects.toThrow(/nic k odeslání/);
    await submitWeek.handler(u.ctx, input(submitWeek, { weekStart: MON }), deps());
    await expect(
      save.handler(u.ctx, input(save, { id: mon.id, date: MON, kind: "work", hours: 7 }), deps()),
    ).rejects.toThrow(/vezměte zpět/);
    await expect(
      reviewWeek.handler(
        b.ctx,
        input(reviewWeek, { userId: u.id, weekStart: MON, decision: "return" }),
        deps(),
      ),
    ).rejects.toThrow(/co je potřeba opravit/);
    await reviewWeek.handler(
      b.ctx,
      input(reviewWeek, {
        userId: u.id,
        weekStart: MON,
        decision: "return",
        note: "Chybí přestávka",
      }),
      deps(),
    );
    let w = await week.handler(u.ctx, input(week, { weekStart: MON }), deps());
    expect(w.entries[0]).toMatchObject({ status: "returned", reviewNote: "Chybí přestávka" });
    await save.handler(
      u.ctx,
      input(save, {
        id: mon.id,
        date: MON,
        kind: "work",
        startTime: "07:00",
        endTime: "15:30",
        breakMinutes: 30,
      }),
      deps(),
    );
    w = await week.handler(u.ctx, input(week, { weekStart: MON }), deps());
    expect(w.entries[0]!.status).toBe("draft");
    await submitWeek.handler(u.ctx, input(submitWeek, { weekStart: MON }), deps());
    const pending = await approvals.handler(b.ctx, {}, deps());
    expect(pending.some((p) => p.userId === u.id && p.week === weekStartIso(MON))).toBe(true);
    await reviewWeek.handler(
      b.ctx,
      input(reviewWeek, { userId: u.id, weekStart: MON, decision: "approve" }),
      deps(),
    );
    await expect(
      save.handler(u.ctx, input(save, { id: mon.id, date: MON, kind: "work", hours: 6 }), deps()),
    ).rejects.toThrow(/Požádejte vedoucího/);
    await expect(remove.handler(u.ctx, { id: mon.id }, deps())).rejects.toThrow(/nejde smazat/);
    await expect(
      reviewWeek.handler(
        b.ctx,
        input(reviewWeek, { userId: u.id, weekStart: MON, decision: "approve" }),
        deps(),
      ),
    ).rejects.toThrow(/už není ke schválení/);
    const notes = await app.db
      .select()
      .from(schema.notification)
      .where(eq(schema.notification.userId, u.id));
    expect(notes.map((n) => n.kind)).toEqual(
      expect.arrayContaining(["time.returned", "time.approved"]),
    );
    // data v upozornění jsou česky (2. 3. 2026), ne ISO (2026-03-02)
    expect(notes.find((n) => n.kind === "time.approved")!.body).toMatch(
      /^2\. 3\. 2026 – 8\. 3\. 2026/,
    );
    const bossNotes = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(eq(schema.notification.userId, b.id), eq(schema.notification.kind, "time.submitted")),
      );
    expect(bossNotes.some((n) => /2\. 3\. 2026 – 8\. 3\. 2026/.test(n.body ?? ""))).toBe(true);
    // titulek se jménem, odkaz na schvalování; zaměstnanec dostane odkaz na konkrétní týden
    expect(bossNotes.find((n) => n.url === "/dochazka/schvalovani")?.title).toMatch(
      /^Docházka ke schválení: /,
    );
    expect(notes.find((n) => n.kind === "time.approved")!.url).toBe(`/dochazka?tyden=${MON}`);
    expect(notes.find((n) => n.kind === "time.returned")!.body).toMatch(/Chybí přestávka/);
    // odesílatel sám sebe neupozorňuje
    const selfNotes = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(eq(schema.notification.userId, u.id), eq(schema.notification.kind, "time.submitted")),
      );
    expect(selfNotes).toHaveLength(0);
  });

  it("odeslaný týden jde vzít zpět; schvalování a přehled jsou jen pro oprávněné", async () => {
    const u = await worker();
    await save.handler(u.ctx, input(save, { date: "2026-03-09", kind: "work", hours: 5 }), deps());
    await submitWeek.handler(u.ctx, input(submitWeek, { weekStart: "2026-03-09" }), deps());
    await withdrawWeek.handler(u.ctx, input(withdrawWeek, { weekStart: "2026-03-09" }), deps());
    expect(
      (await week.handler(u.ctx, input(week, { weekStart: "2026-03-09" }), deps())).entries[0]!
        .status,
    ).toBe("draft");
    await expect(
      report.handler(u.ctx, input(report, { month: "2026-03" }), deps()),
    ).rejects.toThrow(PermissionError);
    const other = await worker();
    await expect(
      week.handler(u.ctx, input(week, { weekStart: MON, userId: other.id }), deps()),
    ).rejects.toThrow(PermissionError);
  });
});

describe("uzávěrka měsíce a přehled", () => {
  it("uzavřený měsíc nejde měnit; přehled počítá odpracované, absence, fond a rozdíl", async () => {
    const u = await worker();
    const b = await boss();
    const m = "2025-11"; // nikdo jiný v něm nezapisuje
    for (const d of ["2025-11-03", "2025-11-04", "2025-11-05"])
      await save.handler(u.ctx, input(save, { date: d, kind: "work", hours: 8 }), deps());
    await save.handler(
      u.ctx,
      input(save, { date: "2025-11-06", kind: "vacation", hours: 8 }),
      deps(),
    );
    const mo = await month.handler(u.ctx, input(month, { month: m }), deps());
    expect(mo).toMatchObject({ workedMinutes: 24 * 60, paidAbsenceMinutes: 8 * 60, locked: false });
    expect(mo.fundMinutes).toBe(19 * 8 * 60); // listopad 2025: 20 pracovních dnů bez svátku 17. 11.
    expect(mo.balanceMinutes).toBe(32 * 60 - 152 * 60);
    const rep = await report.handler(b.ctx, input(report, { month: m }), deps());
    expect(rep.users.find((x) => x.userId === u.id)).toMatchObject({
      workedMinutes: 24 * 60,
      absenceMinutes: 8 * 60,
      costMinor: 24 * 250_00,
    });
    // schvalovatel bez ekonomiky zakázek vidí hodiny, ale ne náklady
    const a = await approver();
    const plain = await report.handler(a.ctx, input(report, { month: m }), deps());
    expect(plain.users.find((x) => x.userId === u.id)).toMatchObject({
      workedMinutes: 24 * 60,
      costMinor: null,
    });

    await lockMonth.handler(b.ctx, input(lockMonth, { month: m, locked: true }), deps());
    await expect(
      save.handler(u.ctx, input(save, { date: "2025-11-07", kind: "work", hours: 8 }), deps()),
    ).rejects.toThrow(/uzavřený/);
    await expect(
      submitWeek.handler(u.ctx, input(submitWeek, { weekStart: "2025-11-03" }), deps()),
    ).rejects.toThrow(/uzavřený/);
    await lockMonth.handler(b.ctx, input(lockMonth, { month: m, locked: false }), deps());
    await save.handler(u.ctx, input(save, { date: "2025-11-07", kind: "work", hours: 8 }), deps());
    await app.db.delete(timeLock).where(eq(timeLock.month, m));
  });
});

describe("píchačka", () => {
  it("příchod → přestávka → odchod vytvoří záznam; dvě píchačky najednou nejdou; okamžitý odchod záznam zahodí", async () => {
    const u = await worker();
    const none = await clockStatus.handler(u.ctx, {}, deps());
    expect(none.running).toBeNull();
    await clockIn.handler(u.ctx, input(clockIn, {}), deps());
    await expect(clockIn.handler(u.ctx, input(clockIn, {}), deps())).rejects.toThrow(/už běží/);
    // předsunout příchod o 3 hodiny, ať je co počítat
    await app.db
      .update(timeEntry)
      .set({ startedAt: new Date(Date.now() - 3 * 3_600_000) })
      .where(and(eq(timeEntry.userId, u.id), eq(timeEntry.source, "clock")));
    await clockBreak.handler(u.ctx, input(clockBreak, { action: "start" }), deps());
    await expect(
      clockBreak.handler(u.ctx, input(clockBreak, { action: "start" }), deps()),
    ).rejects.toThrow(/už běží/);
    await app.db
      .update(timeEntry)
      .set({ breakStartedAt: new Date(Date.now() - 30 * 60_000) })
      .where(and(eq(timeEntry.userId, u.id), eq(timeEntry.source, "clock")));
    await clockBreak.handler(u.ctx, input(clockBreak, { action: "end" }), deps());
    const out = await clockOut.handler(u.ctx, input(clockOut, { note: "Zateplení" }), deps());
    expect(out.discarded).toBe(false);
    expect(out.minutes).toBeGreaterThanOrEqual(149);
    expect(out.minutes).toBeLessThanOrEqual(151); // 3 h − 30 min přestávky
    const [e] = await app.db
      .select()
      .from(timeEntry)
      .where(and(eq(timeEntry.userId, u.id), eq(timeEntry.source, "clock")));
    expect(e).toMatchObject({
      note: "Zateplení",
      status: "draft",
      date: localParts(e!.startedAt!).date,
    });
    await expect(clockOut.handler(u.ctx, input(clockOut, {}), deps())).rejects.toThrow(/neběží/);

    await clockIn.handler(u.ctx, input(clockIn, {}), deps());
    const quick = await clockOut.handler(u.ctx, input(clockOut, {}), deps());
    expect(quick).toMatchObject({ discarded: true, minutes: 0 });
  });

  it("odeslání týdne přeskočí běžící píchačku; po odchodu je záznam k odeslání", async () => {
    const u = await worker();
    await clockIn.handler(u.ctx, input(clockIn, {}), deps());
    const wk = weekStartIso(todayIso());
    // jediný záznam týdne je rozpracovaná píchačka: nic k odeslání
    await expect(
      submitWeek.handler(u.ctx, input(submitWeek, { weekStart: wk }), deps()),
    ).rejects.toThrow(/nic k odeslání/);
    const [run] = await app.db
      .select()
      .from(timeEntry)
      .where(and(eq(timeEntry.userId, u.id), eq(timeEntry.source, "clock")));
    expect(run!.status).toBe("draft");
    // ruční záznam ve stejném týdnu se odešle, píchačka zůstane rozpracovaná
    await save.handler(u.ctx, input(save, { date: wk, kind: "work", hours: 4 }), deps());
    await submitWeek.handler(u.ctx, input(submitWeek, { weekStart: wk }), deps());
    const [still] = await app.db.select().from(timeEntry).where(eq(timeEntry.id, run!.id));
    expect(still!.status).toBe("draft");
    expect((await clockStatus.handler(u.ctx, {}, deps())).running).not.toBeNull();
  });

  it("zapomenutý odchod (píchačka běží přes víkend) píchačku nezablokuje: doba se zkrátí a záznam se vrátí k opravě", async () => {
    const u = await worker();
    await clockIn.handler(u.ctx, input(clockIn, {}), deps());
    await app.db
      .update(timeEntry)
      .set({ startedAt: new Date(Date.now() - 62 * 3_600_000) })
      .where(and(eq(timeEntry.userId, u.id), eq(timeEntry.source, "clock")));
    const out = await clockOut.handler(u.ctx, input(clockOut, {}), deps());
    expect(out).toMatchObject({ discarded: false, capped: true, minutes: 24 * 60 });
    const [e] = await app.db
      .select()
      .from(timeEntry)
      .where(and(eq(timeEntry.userId, u.id), eq(timeEntry.source, "clock")));
    expect(e).toMatchObject({ status: "returned", minutes: 24 * 60 });
    expect(e!.reviewNote).toMatch(/běžela 62:00 h, doba je zkrácena na 24:00 h/);
    // píchačka je zase volná a vrácený záznam jde opravit ručně na skutečnou dobu
    expect((await clockStatus.handler(u.ctx, {}, deps())).running).toBeNull();
    await save.handler(
      u.ctx,
      input(save, { id: e!.id, date: e!.date, kind: "work", hours: 8 }),
      deps(),
    );
    const [fixed] = await app.db.select().from(timeEntry).where(eq(timeEntry.id, e!.id));
    // úprava záznamu z píchačky v hodinách z něj nesmí udělat „běžící“ píchačku (jinak by se rozbil stav píchačky)
    expect(fixed).toMatchObject({ minutes: 8 * 60, status: "draft", source: "clock" });
    expect(fixed!.startedAt).not.toBeNull();
    expect(fixed!.endedAt).not.toBeNull();
    expect((await clockStatus.handler(u.ctx, {}, deps())).running).toBeNull();
    await clockIn.handler(u.ctx, input(clockIn, {}), deps());

    // den už je plný jiným záznamem: z píchačky se nevejde nic, záznam se zahodí
    const full = await worker();
    await clockIn.handler(full.ctx, input(clockIn, {}), deps());
    const [run] = await app.db
      .select()
      .from(timeEntry)
      .where(and(eq(timeEntry.userId, full.id), eq(timeEntry.source, "clock")));
    await app.db
      .update(timeEntry)
      .set({ startedAt: new Date(Date.now() - 5 * 3_600_000) })
      .where(eq(timeEntry.id, run!.id));
    await save.handler(full.ctx, input(save, { date: run!.date, kind: "work", hours: 24 }), deps());
    const none = await clockOut.handler(full.ctx, input(clockOut, {}), deps());
    expect(none).toMatchObject({ discarded: true, capped: true, minutes: 0 });
    expect((await clockStatus.handler(full.ctx, {}, deps())).running).toBeNull();
  });
});

describe("entita a poskytovatelé", () => {
  it("seznam záznamů je jen ke čtení a respektuje rozsah (jen moje / vše)", async () => {
    const a = await worker();
    const b = await boss();
    await save.handler(
      a.ctx,
      input(save, { date: addDaysIso(todayIso(), -400), kind: "work", hours: 1 }),
      deps(),
    );
    const E = await resolveEntity(app.db, timeEntryEntity);
    const mine = await queryRecords(a.ctx, registry, E, { limit: 200 });
    expect(mine.rows.every((r) => r.user === a.id)).toBe(true);
    const all = await queryRecords(b.ctx, registry, E, { limit: 1 });
    expect(all.total).toBeGreaterThan(mine.total);
    await expect(createRecord(b.ctx, registry, E, { date: MON })).rejects.toThrow(
      /Docházku zapisujte/,
    );
  });

  it("náklad práce na zakázku a předvyplnění deníku z docházky; absence a cizí zakázky se nepočítají", async () => {
    const u = await worker();
    const b = await boss();
    const [c] = await app.db
      .insert(company)
      .values({ name: `F ${randomBytes(2).toString("hex")}` })
      .returning();
    const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
    const [j] = await app.db
      .insert(job)
      .values({
        number: `D-${randomBytes(4).toString("hex")}`,
        title: "Dům",
        companyId: c!.id,
        stageId: stage.id,
      })
      .returning();
    await save.handler(
      u.ctx,
      input(save, { date: "2025-12-01", kind: "work", hours: 8, jobId: j!.id, note: "Zdění" }),
      deps(),
    );
    await save.handler(
      u.ctx,
      input(save, { date: "2025-12-01", kind: "travel", hours: 1, jobId: j!.id }),
      deps(),
    );
    await save.handler(u.ctx, input(save, { date: "2025-12-02", kind: "work", hours: 5 }), deps());
    const cost = await (server.costProviders![0] as CostProvider).costs(b.ctx, j!.id, deps());
    // řádky na úrovni záznamu (ref = id záznamu), celkem stejně jako dřív: 9 h × 250 Kč
    expect(cost).toHaveLength(2);
    expect(cost.map((l) => l.amountMinor).sort((a, b) => a - b)).toEqual([250_00, 8 * 250_00]);
    expect(cost.reduce((a, l) => a + l.amountMinor, 0)).toBe(9 * 250_00);
    for (const l of cost)
      expect(l).toMatchObject({
        category: "labour",
        source: "dochazka",
        ref: expect.any(String),
        date: expect.stringMatching(/^2025-12-0\d$/),
      });
    expect(new Set(cost.map((l) => l.ref)).size).toBe(2);
    const pre = await (server.diaryPrefill![0] as DiaryPrefillProvider)(
      b.ctx,
      j!.id,
      "2025-12-01",
      deps(),
    );
    expect(pre.people).toContain("(8:00 h)");
    expect(pre.work).toBe("Zdění");
  });

  it("náklad v měsíčním přehledu a v ekonomice zakázky se shodují na haléř i u neceločíselných hodin", async () => {
    const u = await worker();
    const b = await boss();
    const [c] = await app.db
      .insert(company)
      .values({ name: `F ${randomBytes(2).toString("hex")}` })
      .returning();
    const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
    const [j] = await app.db
      .insert(job)
      .values({
        number: `D-${randomBytes(4).toString("hex")}`,
        title: "Zaokrouhlení",
        companyId: c!.id,
        stageId: stage.id,
      })
      .returning();
    // 7:25 h a 3:07 h při 250 Kč/h: 185 416,67 a 77 916,67 haléře, každý záznam se zaokrouhluje zvlášť
    await save.handler(
      u.ctx,
      input(save, {
        date: "2024-02-05",
        kind: "work",
        startTime: "07:00",
        endTime: "14:25",
        jobId: j!.id,
      }),
      deps(),
    );
    await save.handler(
      u.ctx,
      input(save, {
        date: "2024-02-06",
        kind: "work",
        startTime: "08:00",
        endTime: "11:07",
        jobId: j!.id,
      }),
      deps(),
    );
    const lines = await (server.costProviders![0] as CostProvider).costs(b.ctx, j!.id, deps());
    const fromJob = lines.reduce((a, l) => a + l.amountMinor, 0);
    expect(lines.map((l) => l.amountMinor).sort((a, b) => a - b)).toEqual([77_917, 185_417]);
    const rep = await report.handler(b.ctx, input(report, { month: "2024-02" }), deps());
    expect(rep.users.find((x) => x.userId === u.id)!.costMinor).toBe(fromJob);
  });

  it("večerní připomínka upozorní jen toho, kdo dnes nic nezapsal, a jen jednou za den", async () => {
    const lazy = await worker();
    const done = await worker();
    const today = localParts(new Date()).date;
    await save
      .handler(done.ctx, input(save, { date: today, kind: "work", hours: 1 }), deps())
      .catch(() => undefined);
    const reminder = server.jobs![0] as ModuleJob;
    const jobDeps = {
      db: app.db,
      registry,
      queue: { send: async () => null },
      settings: deps().settings,
      baseURL: "http://localhost",
    } as unknown as ModuleJobDeps;
    await reminder.handler(jobDeps, {}, {} as never);
    await reminder.handler(jobDeps, {}, {} as never);
    const mine = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(eq(schema.notification.userId, lazy.id), eq(schema.notification.kind, "time.reminder")),
      );
    // o víkendu ani ve svátek se neupozorňuje, jinak právě jednou
    const workday = ![0, 6].includes(new Date().getDay());
    expect(mine.length).toBe(workday ? 1 : 0);
  });
});

/* ---------- plánovaná upozornění ---------- */

/** Zaměstnanec s kartou zaměstnance (podmínka „očekává se, že pracuje“). */
async function employee(
  perms: Parameters<typeof makeUser>[1],
  card: Partial<typeof schema.employee.$inferInsert> | null = {},
) {
  const u = await makeUser(app.db, perms);
  if (card) await app.db.insert(schema.employee).values({ userId: u.id, ...card });
  return u;
}
const OWN: [string, "all" | "own"][] = [["dochazka.own", "all"]];
const SETTINGS = { workDays: [1, 2, 3, 4, 5], reminder: true };

const notesOf = (userId: string, kind: string) =>
  app.db
    .select()
    .from(schema.notification)
    .where(and(eq(schema.notification.userId, userId), eq(schema.notification.kind, kind)));

const insertEntry = (
  v: Partial<typeof timeEntry.$inferInsert> & { userId: string; date: string },
) => app.db.insert(timeEntry).values({ kind: "work", minutes: 60, ...v });

describe("plánovaná upozornění", () => {
  it("úlohy jsou zaregistrované: připomínka 17:30, příchod 8:30, odchod každou půlhodinu", () => {
    const byName = new Map(server.jobs!.map((j) => [j.name, j]));
    expect(byName.get("dochazka.reminder")?.cron).toBe("30 17 * * 1-5");
    expect(byName.get("dochazka.missing_clock_in")?.cron).toBe("30 8 * * 1-5");
    expect(byName.get("dochazka.forgot_clock_out")?.cron).toBe("*/30 6-21 * * *");
  });

  it("večerní připomínka: jen kdo nic nezapsal, jednou za den, ne o víkendu ani při vypnutí", async () => {
    const lazy = await employee(OWN);
    const done = await employee(OWN);
    const now = new Date("2026-06-10T15:30:00Z"); // středa 17:30 CEST
    await insertEntry({ userId: done.id, date: "2026-06-10" });
    await sendEveningReminders(app.db, SETTINGS, now);
    await sendEveningReminders(app.db, SETTINGS, now);
    expect(await notesOf(lazy.id, "time.reminder")).toHaveLength(1);
    expect(await notesOf(done.id, "time.reminder")).toHaveLength(0);
    const [n] = await notesOf(lazy.id, "time.reminder");
    expect(n).toMatchObject({ title: "Nezapomeňte zapsat docházku", url: "/dochazka" });

    // další den znovu; sobota ne; vypnuté v nastavení ne
    await sendEveningReminders(app.db, SETTINGS, new Date("2026-06-11T15:30:00Z"));
    expect(await notesOf(lazy.id, "time.reminder")).toHaveLength(2);
    await sendEveningReminders(app.db, SETTINGS, new Date("2026-06-13T15:30:00Z"));
    await sendEveningReminders(
      app.db,
      { ...SETTINGS, reminder: false },
      new Date("2026-06-12T15:30:00Z"),
    );
    expect(await notesOf(lazy.id, "time.reminder")).toHaveLength(2);
  });

  it("chybějící příchod: jen očekávaní zaměstnanci bez záznamu a bez běžící píchačky, jednou za den", async () => {
    const day = "2026-06-10"; // středa
    const now = new Date("2026-06-10T06:30:00Z"); // 8:30 CEST
    const missing = await employee(OWN, { employmentType: "hpp" });
    const clocked = await employee(OWN);
    const onVacation = await employee(OWN);
    const stale = await employee(OWN); // píchačka z předchozího dne řeší „zapomenutý odchod“
    const external = await employee(OWN, { employmentType: "external" });
    const notStarted = await employee(OWN, { startDate: "2026-07-01" });
    const noCard = await employee(OWN, null);
    await insertEntry({
      userId: clocked.id,
      date: day,
      source: "clock",
      startedAt: new Date("2026-06-10T05:00:00Z"),
    });
    await insertEntry({ userId: onVacation.id, date: day, kind: "vacation", minutes: 480 });
    await insertEntry({
      userId: stale.id,
      date: "2026-06-09",
      source: "clock",
      startedAt: new Date("2026-06-09T05:00:00Z"),
    });

    const first = await sendMissingClockIn(app.db, SETTINGS, now);
    const second = await sendMissingClockIn(app.db, SETTINGS, now);
    expect(first.created).toBeGreaterThanOrEqual(1);
    expect(second.created).toBe(0);
    const mine = await notesOf(missing.id, "dochazka.missing_clock_in");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      title: "Chybí váš příchod",
      url: "/dochazka",
      severity: "normal",
    });
    for (const u of [clocked, onVacation, stale, external, notStarted, noCard])
      expect(await notesOf(u.id, "dochazka.missing_clock_in")).toHaveLength(0);

    // v neděli (a také ve státní svátek) se nic neposílá
    const sunday = await sendMissingClockIn(app.db, SETTINGS, new Date("2026-06-14T06:30:00Z"));
    expect(sunday).toEqual({ created: 0, expected: 0 });
    const holiday = await sendMissingClockIn(app.db, SETTINGS, new Date("2026-05-08T06:30:00Z"));
    expect(holiday.expected).toBe(0);
  });

  it("chybějící příchod a „dnes“ v pražském čase: kolem půlnoci a v dny změny času", async () => {
    const early = await employee(OWN);
    const late = await employee(OWN);
    // 29. 3. 2026 ve 22:30 UTC je v Praze už pondělí 30. 3. (0:30 CEST): dnešek je 30. 3.
    const now = new Date("2026-03-29T22:30:00Z");
    await insertEntry({ userId: early.id, date: "2026-03-30" });
    await insertEntry({ userId: late.id, date: "2026-03-29" }); // včerejší (nedělní) záznam dnešek nepokrývá
    await sendMissingClockIn(app.db, SETTINGS, now);
    expect(await notesOf(early.id, "dochazka.missing_clock_in")).toHaveLength(0);
    expect(await notesOf(late.id, "dochazka.missing_clock_in")).toHaveLength(1);

    // samotné dny změny času jsou neděle: úloha mlčí
    for (const sunday of ["2026-03-29T06:30:00Z", "2026-10-25T07:30:00Z"])
      expect((await sendMissingClockIn(app.db, SETTINGS, new Date(sunday))).expected).toBe(0);
    // pondělí po podzimní změně: 8:30 CET = 7:30 UTC
    const monday = await employee(OWN);
    await sendMissingClockIn(app.db, SETTINGS, new Date("2026-10-26T07:30:00Z"));
    expect(await notesOf(monday.id, "dochazka.missing_clock_in")).toHaveLength(1);
  });

  it("zapomenutý odchod: naléhavě zaměstnanci a schvalovateli „vše“, jednou za den a záznam", async () => {
    const forgetful = await employee(OWN);
    const fine = await employee(OWN);
    const boss = await makeUser(app.db, [
      ["dochazka.own", "all"],
      ["dochazka.approve", "all"],
    ]);
    const foreman = await makeUser(app.db, [["dochazka.approve", "own"]]);
    // neděle 18:00 CEST → pondělí 8:00 CEST: píchačka běží 14 h
    const [entry] = await insertEntry({
      userId: forgetful.id,
      date: "2026-06-07",
      source: "clock",
      startedAt: new Date("2026-06-07T16:00:00Z"),
      minutes: 0,
    }).returning();
    await insertEntry({
      userId: fine.id,
      date: "2026-06-08",
      source: "clock",
      startedAt: new Date("2026-06-08T04:00:00Z"), // 6:00, v 8:00 je to 2 h
      minutes: 0,
    });
    const now = new Date("2026-06-08T06:00:00Z");
    const a = await sendForgottenClockOut(app.db, now);
    const b = await sendForgottenClockOut(app.db, now);
    expect(a.person).toBeGreaterThanOrEqual(1);
    expect(b).toEqual({ person: 0, team: 0 });

    const mine = await notesOf(forgetful.id, "dochazka.forgot_clock_out");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      title: "Zapomenutý odchod",
      severity: "urgent",
      url: "/dochazka",
    });
    expect(mine[0]!.body).toMatch(/od 7\. 6\. 2026 v 18:00 \(14:00 h\)/);
    const team = await notesOf(boss.id, "dochazka.forgot_clock_out_team");
    expect(team).toHaveLength(1);
    expect(team[0]!.title).toMatch(/^Zapomenutý odchod: /);
    expect(team[0]!.url).toBe("/dochazka/schvalovani");
    expect(await notesOf(foreman.id, "dochazka.forgot_clock_out_team")).toHaveLength(0);
    expect(await notesOf(fine.id, "dochazka.forgot_clock_out")).toHaveLength(0);

    // další den běží stejný záznam dál: upozornění se opakuje (jednou za den a záznam)
    await sendForgottenClockOut(app.db, new Date("2026-06-09T06:00:00Z"));
    expect(await notesOf(forgetful.id, "dochazka.forgot_clock_out")).toHaveLength(2);

    // po odchodu už nic
    await app.db
      .update(timeEntry)
      .set({ endedAt: new Date("2026-06-09T06:30:00Z") })
      .where(eq(timeEntry.id, entry!.id));
    await sendForgottenClockOut(app.db, new Date("2026-06-10T06:00:00Z"));
    expect(await notesOf(forgetful.id, "dochazka.forgot_clock_out")).toHaveLength(2);
  });

  it("zapomenutý odchod přes změnu času: 12 h se počítá ze skutečného času a upozornění je jedno", async () => {
    const spring = await employee(OWN);
    const autumn = await employee(OWN);
    // 29. 3. 2026: příchod 1:00 CET (00:00 UTC); ve 13:59 CEST uplynulo 11 h 59 min, ve 14:00 CEST 12 h
    await insertEntry({
      userId: spring.id,
      date: "2026-03-29",
      source: "clock",
      startedAt: new Date("2026-03-29T00:00:00Z"),
      minutes: 0,
    });
    await sendForgottenClockOut(app.db, new Date("2026-03-29T11:59:00Z"));
    expect(await notesOf(spring.id, "dochazka.forgot_clock_out")).toHaveLength(0);
    await sendForgottenClockOut(app.db, new Date("2026-03-29T12:00:00Z"));
    await sendForgottenClockOut(app.db, new Date("2026-03-29T12:30:00Z")); // další průchod téhož dne
    expect(await notesOf(spring.id, "dochazka.forgot_clock_out")).toHaveLength(1);

    // 25. 10. 2026: příchod 2:30 CEST (00:30 UTC); ve 13:30 CET je na hodinkách 11 h, uplynulo 12 h
    await insertEntry({
      userId: autumn.id,
      date: "2026-10-25",
      source: "clock",
      startedAt: new Date("2026-10-25T00:30:00Z"),
      minutes: 0,
    });
    await sendForgottenClockOut(app.db, new Date("2026-10-25T12:29:00Z"));
    expect(await notesOf(autumn.id, "dochazka.forgot_clock_out")).toHaveLength(0);
    await sendForgottenClockOut(app.db, new Date("2026-10-25T12:30:00Z"));
    expect(await notesOf(autumn.id, "dochazka.forgot_clock_out")).toHaveLength(1);
  });
});
