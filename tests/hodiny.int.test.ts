/* eslint-disable @typescript-eslint/no-explicit-any -- test čte neotypovaný výstup příkazů */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRecord, resolveEntity } from "@rebar/core/entities";
import type { Db } from "@rebar/core/db";
import type { ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, PermissionError, UserError, type Ctx } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import { taskType } from "@rebar/ukoly/schema";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Modul Hodiny (HOD-01…04): zápis bez stopek, týdenní mřížka, přehledy, odpracováno vs. odhad, efektivní sazba a soukromí
  (hodiny soukromé zakázky jsou soukromé). Příkazy se volají přes registr jako z UI.
*/

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let owner: Ctx;
let partner: Ctx;
let external: Ctx;
let jobA: string;
let jobB: string;
let privJob: string;
let company: string | undefined;

const WEEK = "2026-10-12"; // pondělí
const DAY = (n: number) => `2026-10-${12 + n}`;

async function run<T = any>(
  name: string,
  ctx: Ctx,
  input: unknown,
  deps: ModuleDeps = f.deps,
): Promise<T> {
  const cmd = f.collected.commands.get(name);
  if (!cmd) throw new Error(`Příkaz ${name} neexistuje`);
  return (await cmd.handler(ctx, cmd.input.parse(input), deps)) as T;
}

const mkJob = async (title: string, isPrivate = false) => {
  const e = await resolveEntity(db, f.registry.get("job")!);
  const ce = await resolveEntity(db, f.registry.get("company")!);
  company ??= (await createRecord(owner, f.registry, ce, { name: "Firma hodiny" })).row.id;
  const { row } = await createRecord(owner, f.registry, e, {
    title,
    company,
    type: "web",
    ...(isPrivate ? { isPrivate: true } : {}),
  });
  return row.id;
};

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  owner = f.people.owner.ctx;
  partner = f.people.partner.ctx;
  external = f.people.external.ctx;
  await db
    .insert(taskType)
    .values({ key: "task", name: "Úkol", isSystem: true } as never)
    .onConflictDoNothing();
  jobA = await mkJob("Web Alfa");
  jobB = await mkJob("Web Beta");
  privJob = await mkJob("Soukromá zakázka PRIVATE-CANARY-hodiny", true);
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

const cell = (ctx: Ctx, jobId: string, date: string, time: string) =>
  run("hodiny.cell.save", ctx, { jobId, date, time });
const week = (ctx: Ctx) => run("hodiny.week", ctx, { weekStart: WEEK });

describe("zápis a týdenní mřížka", () => {
  it("parse: náhled rozpoznání", async () => {
    expect(await run("hodiny.parse", owner, { text: "1,5" })).toMatchObject({
      ok: true,
      minutes: 90,
      hm: "1:30",
    });
    expect(await run("hodiny.parse", owner, { text: "x" })).toMatchObject({ ok: false });
  });

  it("buňka: založení, přepsání, formát 1:30 i 1,5, vymazání", async () => {
    await cell(owner, jobA, DAY(0), "1,5");
    let w = await week(owner);
    let row = w.rows.find((r: any) => r.job.id === jobA);
    expect(row.cells[DAY(0)].gridMinutes).toBe(90);
    expect(w.totalMinutes).toBe(90);

    await cell(owner, jobA, DAY(0), "2:15");
    await cell(owner, jobA, DAY(1), "45m");
    w = await week(owner);
    row = w.rows.find((r: any) => r.job.id === jobA);
    expect(row.cells[DAY(0)].gridMinutes).toBe(135);
    expect(row.totalMinutes).toBe(180);
    expect(w.days[0].minutes).toBe(135);

    const cleared = await cell(owner, jobA, DAY(1), "");
    expect(cleared.minutes).toBe(0);
    w = await week(owner);
    expect(w.rows.find((r: any) => r.job.id === jobA).cells[DAY(1)].gridMinutes).toBe(0);
    await cell(owner, jobA, DAY(0), "0");
    expect((await week(owner)).rows).toHaveLength(0);
  });

  it("neplatný čas je česká chyba, nic se nezapíše", async () => {
    await expect(cell(owner, jobA, DAY(0), "abc")).rejects.toBeInstanceOf(UserError);
    await expect(
      run("hodiny.save", owner, { jobId: jobA, date: DAY(0), time: "0" }),
    ).rejects.toBeInstanceOf(UserError);
    expect((await week(owner)).totalMinutes).toBe(0);
  });

  it("denní strop 24 hodin", async () => {
    await cell(owner, jobA, DAY(2), "20");
    await expect(cell(owner, jobB, DAY(2), "5")).rejects.toThrow(/24 hodin/);
    await cell(owner, jobB, DAY(2), "4");
    await cell(owner, jobA, DAY(2), "0");
    await cell(owner, jobB, DAY(2), "0");
  });

  it("víc záznamů v buňce se při úpravě buňky sloučí a poznámky se spojí", async () => {
    await run("hodiny.save", owner, { jobId: jobA, date: DAY(3), time: "1", note: "schůzka" });
    await run("hodiny.save", owner, { jobId: jobA, date: DAY(3), time: "0:30", note: "úpravy" });
    let w = await week(owner);
    expect(w.rows[0].cells[DAY(3)]).toMatchObject({ gridMinutes: 90, gridEntries: 2 });
    await cell(owner, jobA, DAY(3), "3");
    w = await week(owner);
    expect(w.rows[0].cells[DAY(3)]).toMatchObject({ gridMinutes: 180, gridEntries: 1 });
    expect(w.entries).toHaveLength(1);
    expect(w.entries[0].note).toBe("schůzka; úpravy");
    await run("hodiny.delete", owner, { id: w.entries[0].id });
    expect((await week(owner)).entries).toHaveLength(0);
  });

  it("zakázka bez přístupu se tváří jako neexistující; cizí záznam nejde smazat", async () => {
    await expect(
      cell(owner, "00000000-0000-4000-8000-000000000000", DAY(0), "1"),
    ).rejects.toBeInstanceOf(NotFoundError);
    const saved = await run("hodiny.save", owner, { jobId: jobA, date: DAY(4), time: "1" });
    await expect(run("hodiny.delete", partner, { id: saved.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await run("hodiny.delete", owner, { id: saved.id });
  });

  it("externista bez oprávnění k hodinám nic nečte ani nezapisuje", async () => {
    await expect(week(external)).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("zápis k úkolu", () => {
  it("zakázka se vezme z úkolu, úkol jiné zakázky se odmítne", async () => {
    const e = await resolveEntity(db, f.registry.get("task")!);
    const { row: task } = await createRecord(owner, f.registry, e, {
      title: "Texty",
      job: jobA,
      estimateMin: 120,
    });
    const saved = await run("hodiny.save", owner, {
      taskId: task.id,
      date: DAY(0),
      time: "1,5",
      note: "hotovo",
    });
    expect(saved).toMatchObject({ jobId: jobA, taskId: task.id, minutes: 90 });
    await expect(
      run("hodiny.save", owner, { taskId: task.id, jobId: jobB, date: DAY(0), time: "1" }),
    ).rejects.toThrow(/jiné zakázce/);

    const t = await run("hodiny.forTask", owner, { taskId: task.id });
    expect(t).toMatchObject({
      taskTitle: "Texty",
      estimateMin: 120,
      totalMinutes: 90,
      myMinutes: 90,
    });
    expect(t.job.id).toBe(jobA);
    // záznam u úkolu je v buňce zakázky jako „u úkolů“, ne jako upravitelný čas
    const w = await week(owner);
    expect(w.rows[0].cells[DAY(0)]).toMatchObject({ gridMinutes: 0, taskMinutes: 90 });
    expect(w.entries[0].taskTitle).toBe("Texty");
    await run("hodiny.delete", owner, { id: saved.id });
  });

  it("úkol bez zakázky nejde použít", async () => {
    const e = await resolveEntity(db, f.registry.get("task")!);
    const { row: task } = await createRecord(owner, f.registry, e, { title: "Bez zakázky" });
    await expect(
      run("hodiny.save", owner, { taskId: task.id, date: DAY(0), time: "1" }),
    ).rejects.toThrow(/nepatří k žádné zakázce/);
  });
});

describe("přehledy a souhrn zakázky", () => {
  beforeAll(async () => {
    await cell(owner, jobA, DAY(0), "2");
    await cell(owner, jobB, DAY(1), "1");
    await cell(partner, jobA, DAY(0), "3");
  });

  it("moje hodiny podle zakázky, týden a měsíc", async () => {
    const r = await run("hodiny.report", owner, { period: "week", anchor: DAY(2), by: "job" });
    expect(r).toMatchObject({ from: WEEK, to: DAY(6), totalMinutes: 180, scope: "mine" });
    expect(r.rows[0]).toMatchObject({ minutes: 120 });
    expect(r.days[0].minutes).toBe(120);
    const m = await run("hodiny.report", owner, { period: "month", anchor: DAY(2) });
    expect(m.from).toBe("2026-10-01");
    expect(m.totalMinutes).toBe(180);
  });

  it("hodiny všech podle osoby", async () => {
    const r = await run("hodiny.report", owner, {
      period: "week",
      anchor: WEEK,
      scope: "all",
      by: "person",
    });
    expect(r.totalMinutes).toBe(360);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].minutes).toBe(180);
    await expect(run("hodiny.report", external, { scope: "all" })).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("odpracováno vs. odhad úkolů (bez financí sazba není)", async () => {
    const e = await resolveEntity(db, f.registry.get("task")!);
    await createRecord(owner, f.registry, e, { title: "A1", job: jobA, estimateMin: 120 });
    await createRecord(owner, f.registry, e, { title: "A2", job: jobA, estimateMin: 60 });
    const s = await run("hodiny.job.summary", owner, { jobId: jobA });
    expect(s).toMatchObject({
      workedMinutes: 300,
      estimateMin: 300, // Texty 120 + A1 120 + A2 60
      estimateTasks: 3,
      remainingMinutes: 0,
      overrunMinutes: 0,
      progressPct: 100,
      moneyAvailable: false,
      effectiveRateMinor: null,
    });
    expect(s.users).toHaveLength(2);
  });

  it("efektivní sazba z podílů na příjmech (služba finance)", async () => {
    const withFinance: ModuleDeps = {
      ...f.deps,
      services: {
        ...f.deps.services,
        optional: ((k: string) =>
          k === "finance"
            ? {
                allocatedByUser: async () => ({
                  [f.people.owner.id]: 1_000_000,
                  [f.people.partner.id]: 500_000,
                }),
              }
            : f.deps.services.optional(k as never)) as never,
      },
    };
    const s = await run("hodiny.job.summary", owner, { jobId: jobA }, withFinance);
    expect(s.moneyAvailable).toBe(true);
    const o = s.users.find((u: any) => u.userId === f.people.owner.id);
    const p = s.users.find((u: any) => u.userId === f.people.partner.id);
    expect(o).toMatchObject({ minutes: 120, incomeMinor: 1_000_000, rateMinor: 500_000 }); // 5 000 Kč/h
    expect(p).toMatchObject({ minutes: 180, incomeMinor: 500_000, rateMinor: 166_667 });
    expect(s.totalIncomeMinor).toBe(1_500_000);
  });

  it("metriky: tento týden a podle zakázky", async () => {
    const m = f.collected.dashboardMetrics.find((x) => x.key === "hodiny.week")!;
    const input = {
      from: WEEK,
      to: DAY(6),
      jobId: null,
      userId: null,
      bucket: null,
      limit: 10,
      params: {},
      today: DAY(1),
    };
    expect(await m.compute(owner, input, f.deps)).toEqual({ kind: "scalar", value: 360 });
    const by = f.collected.dashboardMetrics.find((x) => x.key === "hodiny.by_job")!;
    const r = (await by.compute(owner, { ...input, params: { by: "person" } }, f.deps)) as any;
    expect(r.series[0].values).toEqual([180, 180]);
  });
});

describe("soukromé zakázky (hodiny soukromé zakázky jsou soukromé)", () => {
  beforeAll(async () => {
    await cell(owner, privJob, DAY(0), "4");
  });

  it("záznam dědí zámek od zakázky; vlastník ho vidí, partner ne", async () => {
    const mine = await week(owner);
    expect(mine.rows.some((r: any) => r.job.id === privJob && r.job.isPrivate)).toBe(true);
    const theirs = await week(partner);
    expect(JSON.stringify(theirs)).not.toContain("PRIVATE-CANARY");
    expect(theirs.rows.some((r: any) => r.job.id === privJob)).toBe(false);
    await expect(cell(partner, privJob, DAY(0), "1")).rejects.toBeInstanceOf(NotFoundError);
    await expect(run("hodiny.job.summary", partner, { jobId: privJob })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("přehledy, metriky a seznam zakázek partnerovi nic soukromého neukážou", async () => {
    const r = await run("hodiny.report", partner, { period: "week", anchor: WEEK, scope: "all" });
    expect(JSON.stringify(r)).not.toContain("PRIVATE-CANARY");
    expect(r.totalMinutes).toBe(360 - 0); // jen sdílené hodiny obou
    const ro = await run("hodiny.report", owner, { period: "week", anchor: WEEK, scope: "all" });
    expect(ro.totalMinutes).toBe(360 + 240);
    const m = f.collected.dashboardMetrics.find((x) => x.key === "hodiny.week")!;
    const input = {
      from: WEEK,
      to: DAY(6),
      jobId: null,
      userId: null,
      bucket: null,
      limit: 10,
      params: {},
      today: DAY(1),
    };
    expect(await m.compute(partner, input, f.deps)).toEqual({ kind: "scalar", value: 360 });
    expect(await m.compute(owner, input, f.deps)).toEqual({ kind: "scalar", value: 600 });
    const jobs = await run("hodiny.jobs", partner, {});
    expect(JSON.stringify(jobs)).not.toContain("PRIVATE-CANARY");
    expect(JSON.stringify(await run("hodiny.jobs", owner, {}))).toContain("PRIVATE-CANARY");
  });
});
