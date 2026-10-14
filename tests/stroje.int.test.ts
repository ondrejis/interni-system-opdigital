import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensurePipeline, getPipeline } from "@rebar/core/config-data";
import { schema } from "@rebar/core/db";
import {
  clearEntityPolicies,
  createEntityRegistry,
  createRecord,
  deleteRecord,
  registerEntityPolicies,
  resolveEntity,
  updateRecord,
  type EntityRegistry,
} from "@rebar/core/entities";
import type {
  AttentionProvider,
  CalendarLayerProvider,
  CommandDef,
  CostProvider,
  DiaryPrefillProvider,
  ModuleDeps,
  ModuleJob,
  ModuleJobDeps,
  WidgetProvider,
} from "@rebar/core/module-server";
import { ensureSeries } from "@rebar/core/numbering";
import { NotFoundError, PermissionError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { addDaysIso, addMonthsIso, todayIso } from "@rebar/core/time";
import { company } from "@rebar/kontakty/schema";
import { companyEntity, personEntity } from "@rebar/kontakty/server";
import {
  asset,
  assetDefect,
  assetInterval,
  assetLog,
  assetReservation,
  commands,
  entities as strojeEntities,
  sendDeadlineReminders,
  sendReservationReminders,
  server,
} from "@rebar/stroje/server";
import { manifest as zakazkyManifest } from "@rebar/zakazky";
import { job } from "@rebar/zakazky/schema";
import { jobEntity } from "@rebar/zakazky/server";

const app = connectAppDb();
afterAll(() => app.close());

let registry: EntityRegistry;
const deps = () =>
  ({
    registry,
    baseURL: "http://localhost",
    costProviders: [],
    calendarLayers: [],
    diaryPrefill: [],
    emit: async () => {},
  }) as unknown as ModuleDeps;

beforeAll(async () => {
  clearEntityPolicies();
  registry = createEntityRegistry([companyEntity, personEntity, jobEntity, ...strojeEntities]);
  registerEntityPolicies(registry);
  for (const p of zakazkyManifest.seed.pipelines) await ensurePipeline(app.db, p);
  await ensureSeries(app.db, zakazkyManifest.seed.series);
});

const run = async (name: string, ctx: unknown, input: unknown) => {
  const c = commands.find((x) => x.name === name) as CommandDef | undefined;
  if (!c) throw new Error(`Příkaz ${name} neexistuje.`);
  return c.handler(ctx as never, c.input.parse(input), deps()) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const manager = () =>
  makeUser(app.db, [
    ["stroje.read", "all"],
    ["stroje.log", "all"],
    ["stroje.write", "all"],
    ["zakazky.read", "all"],
    ["zakazky.economics", "all"],
  ]);
const driver = () =>
  makeUser(app.db, [
    ["stroje.read", "all"],
    ["stroje.log", "all"],
    ["zakazky.read", "all"],
  ]);

const tag = () => randomBytes(3).toString("hex");

async function mkAsset(over: Partial<typeof asset.$inferInsert> = {}) {
  const [a] = await app.db
    .insert(asset)
    .values({
      name: `Dodávka ${tag()}`,
      kind: "van",
      meter: "km",
      meterValue: "1000.0",
      fuel: "diesel",
      tankLiters: 80,
      ...over,
    })
    .returning();
  return a!;
}
async function mkJob() {
  const [c] = await app.db
    .insert(company)
    .values({ name: `Klient ${tag()}` })
    .returning();
  const stage = (await getPipeline(app.db, "job", "default"))!.stages[0]!;
  const [j] = await app.db
    .insert(job)
    .values({
      number: `D-${randomBytes(4).toString("hex")}`,
      title: "Stavba",
      companyId: c!.id,
      stageId: stage.id,
    })
    .returning();
  return j!;
}
const assetNow = async (id: string) =>
  (await app.db.select().from(asset).where(eq(asset.id, id)))[0]!;

const D1 = addDaysIso(todayIso(), -3);
const D2 = addDaysIso(todayIso(), -2);
const D3 = addDaysIso(todayIso(), -1);

describe("karta stroje", () => {
  it("SPZ velkými písmeny, unikátní mezi živými; s historií nejde smazat", async () => {
    const u = await manager();
    const E = await resolveEntity(app.db, registry.get("asset")!);
    const plate = `${tag()}`.toUpperCase();
    const { row } = await createRecord(u.ctx, registry, E, {
      name: `Auto ${tag()}`,
      kind: "van",
      meter: "km",
      fuel: "diesel",
      plate: plate.toLowerCase(),
    });
    expect(row.plate).toBe(plate);
    await expect(
      createRecord(u.ctx, registry, E, {
        name: `Jiné ${tag()}`,
        kind: "car",
        meter: "km",
        fuel: "petrol",
        plate,
      }),
    ).rejects.toThrow();

    await run("stroje.log.save", u.ctx, {
      assetId: row.id,
      date: D1,
      amount: 10,
      purpose: "Test",
    });
    await expect(deleteRecord(u.ctx, E, row.id)).rejects.toThrow(/Vyřazeno/);

    const fresh = await createRecord(u.ctx, registry, E, {
      name: `Nová ${tag()}`,
      kind: "small",
      meter: "mth",
      fuel: "none",
    });
    await deleteRecord(u.ctx, E, fresh.row.id);
  });
});

describe("kniha jízd", () => {
  it("zápis zvýší stav tachometru, pravidla se hlídají, cizí zápis smí jen správce", async () => {
    const u = await driver();
    const m = await manager();
    const a = await mkAsset();
    const r = await run("stroje.log.save", u.ctx, {
      assetId: a.id,
      date: D1,
      meterStart: 1000,
      meterEnd: 1120.5,
      route: "Plzeň – Rokycany",
      purpose: "Rozvoz materiálu",
    });
    expect(r.amount).toBe("120.5");
    expect((await assetNow(a.id)).meterValue).toBe("1120.5");

    await expect(
      run("stroje.log.save", u.ctx, { assetId: a.id, date: D1, amount: 20 }),
    ).rejects.toThrow(/účel nebo zakázku/);
    await expect(
      run("stroje.log.save", u.ctx, { assetId: a.id, date: D1, amount: 2000, purpose: "x" }),
    ).rejects.toThrow(/1 500 km/);
    await expect(
      run("stroje.log.save", u.ctx, {
        assetId: a.id,
        date: addDaysIso(todayIso(), 5),
        amount: 1,
        purpose: "x",
      }),
    ).rejects.toThrow(/budoucnosti/);
    await expect(
      run("stroje.log.save", u.ctx, {
        assetId: a.id,
        date: D1,
        amount: 5,
        purpose: "x",
        userId: m.id,
      }),
    ).rejects.toThrow(/jen za sebe/);
    const forOther = await run("stroje.log.save", m.ctx, {
      assetId: a.id,
      date: D2,
      amount: 5,
      purpose: "Cesta",
      userId: u.id,
    });
    const [saved] = await app.db.select().from(assetLog).where(eq(assetLog.id, forOther.id));
    expect(saved!.userId).toBe(u.id);

    // řidič smaže své, cizí ne; správce kdykoli
    const mine = await run("stroje.log.save", u.ctx, {
      assetId: a.id,
      date: D3,
      amount: 3,
      purpose: "Úklid",
    });
    const others = await run("stroje.log.save", m.ctx, {
      assetId: a.id,
      date: D3,
      amount: 4,
      purpose: "Kontrola",
    });
    await expect(run("stroje.log.delete", u.ctx, { id: others.id })).rejects.toThrow(/své záznamy/);
    await run("stroje.log.delete", u.ctx, { id: mine.id });
    await run("stroje.log.delete", m.ctx, { id: others.id });
    const list = await run("stroje.logs", m.ctx, { assetId: a.id });
    expect(list.rows).toHaveLength(2);
  });

  it("soukromou jízdu ostatní vidí bez trasy a účelu, správce celou", async () => {
    const u = await driver();
    const other = await driver();
    const m = await manager();
    const a = await mkAsset();
    await run("stroje.log.save", u.ctx, {
      assetId: a.id,
      date: D1,
      amount: 40,
      route: "K lékaři",
      purpose: "Soukromě",
      private: true,
    });
    const asOther = (await run("stroje.logs", other.ctx, { assetId: a.id })).rows[0];
    expect(asOther).toMatchObject({ private: true, route: null, purpose: null, canDelete: false });
    const asOwner = (await run("stroje.logs", u.ctx, { assetId: a.id })).rows[0];
    expect(asOwner).toMatchObject({ route: "K lékaři", canDelete: true });
    const asManager = (await run("stroje.logs", m.ctx, { assetId: a.id })).rows[0];
    expect(asManager.route).toBe("K lékaři");
  });

  it("stroj v motohodinách a vyřazený stroj", async () => {
    const m = await manager();
    const bagr = await mkAsset({
      kind: "excavator",
      meter: "mth",
      fuel: "diesel",
      meterValue: "100.0",
    });
    await expect(
      run("stroje.log.save", m.ctx, { assetId: bagr.id, date: D1, amount: 25, purpose: "x" }),
    ).rejects.toThrow(/24 motohodin/);
    await run("stroje.log.save", m.ctx, {
      assetId: bagr.id,
      date: D1,
      amount: 8.5,
      purpose: "Výkop",
    });
    expect((await assetNow(bagr.id)).meterValue).toBe("108.5");
    const retired = await mkAsset({ status: "retired" });
    await expect(
      run("stroje.log.save", m.ctx, { assetId: retired.id, date: D1, amount: 5, purpose: "x" }),
    ).rejects.toThrow(/Vyřazený/);
  });

  it("bez oprávnění ke stroji se zápis ani seznam nepovede", async () => {
    const nobody = await makeUser(app.db, [["zakazky.read", "all"]]);
    const a = await mkAsset();
    await expect(
      run("stroje.log.save", nobody.ctx, { assetId: a.id, date: D1, amount: 5, purpose: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("tankování a spotřeba", () => {
  const fuel = (ctx: unknown, assetId: string, over: Record<string, unknown>) =>
    run("stroje.fuel.save", ctx, {
      assetId,
      date: D1,
      liters: 50,
      totalMinor: 2_000_00,
      fullTank: true,
      payment: "card",
      ...over,
    });

  it("spotřeba mezi plnými nádržemi a přepočet stavu tachometru", async () => {
    const m = await manager();
    const a = await mkAsset({ meterValue: "0.0" });
    const first = await fuel(m.ctx, a.id, { meterValue: 1000 });
    expect(first.consumption).toBeNull();
    const second = await fuel(m.ctx, a.id, { meterValue: 1500, liters: 40, date: D2 });
    expect(second.consumption).toBeCloseTo(8);
    expect((await assetNow(a.id)).meterValue).toBe("1500.0");

    const list = await run("stroje.fuel", m.ctx, { assetId: a.id });
    expect(list.rows).toHaveLength(2);
    expect(list.avg).toBeCloseTo(8);
    expect(list.unit).toBe("l/100 km");
  });

  it("kontroly: elektro netankuje, nádrž, povinný tachometr", async () => {
    const m = await manager();
    const ev = await mkAsset({ fuel: "electric" });
    await expect(fuel(m.ctx, ev.id, { meterValue: 10 })).rejects.toThrow(/netankuje/);
    const a = await mkAsset();
    await expect(fuel(m.ctx, a.id, { meterValue: 10, liters: 95 })).rejects.toThrow(/Nádrž má 80/);
    await expect(fuel(m.ctx, a.id, {})).rejects.toThrow(/tachometru/);
  });

  it("tankování za dnešek s nižším stavem než poslední známý se odmítne, zpětné se přijme", async () => {
    const m = await manager();
    const a = await mkAsset({ meterValue: "5000.0" });
    await expect(fuel(m.ctx, a.id, { meterValue: 4000, date: todayIso() })).rejects.toThrow(
      /nižší než poslední známý/,
    );
    expect((await assetNow(a.id)).meterValue).toBe("5000.0");
    await fuel(m.ctx, a.id, { meterValue: 4000, date: D1 }); // zpětný zápis starší než poslední stav
    expect((await assetNow(a.id)).meterValue).toBe("5000.0"); // stav stroje se nesnižuje
    await fuel(m.ctx, a.id, { meterValue: 5200, date: todayIso(), liters: 40 });
    expect((await assetNow(a.id)).meterValue).toBe("5200.0");
  });

  it("neobvyklá spotřeba upozorní správce vozového parku", async () => {
    const m = await manager();
    const u = await driver();
    const a = await mkAsset({ meterValue: "0.0" });
    // 4 tankování po 7 l/100 km, pak 12 l/100 km
    let odo = 1000;
    await fuel(u.ctx, a.id, { meterValue: odo, liters: 10 });
    for (const day of [D1, D1, D2, D2]) {
      odo += 500;
      await fuel(u.ctx, a.id, { meterValue: odo, liters: 35, date: day });
    }
    odo += 500;
    await fuel(u.ctx, a.id, { meterValue: odo, liters: 60, date: D3 });
    const notes = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, m.id),
          eq(schema.notification.kind, "stroje.fuel"),
          eq(schema.notification.entityId, a.id),
        ),
      );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ severity: "normal", url: `/stroje/evidence/${a.id}` });
    expect(notes[0]!.title).toMatch(/Neobvyklá spotřeba/);
    expect(notes[0]!.body).toMatch(/12,0 l\/100 km, obvykle 7,0 l\/100 km\./);
    // řidič, který tankoval, upozornění sám sobě nedostane (nemá ani právo správy)
    const own = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(eq(schema.notification.userId, u.id), eq(schema.notification.kind, "stroje.fuel")),
      );
    expect(own).toHaveLength(0);
  });

  it("palivo účtované na zakázku jde do nákladů bez DPH", async () => {
    const m = await manager();
    const j = await mkJob();
    const a = await mkAsset({ meterValue: "0.0", internalRateMinor: 8_00 });
    await fuel(m.ctx, a.id, { meterValue: 100, totalMinor: 1_210_00, jobId: j.id });
    await run("stroje.log.save", m.ctx, {
      assetId: a.id,
      date: D1,
      meterStart: 100,
      meterEnd: 200,
      jobId: j.id,
    });
    const provider = server.costProviders[0] as CostProvider;
    const lines = await provider.costs(m.ctx, j.id, deps());
    expect(lines).toEqual([
      expect.objectContaining({
        category: "machines",
        amountMinor: 100 * 8_00,
        source: "stroje",
        ref: expect.stringMatching(/^log:/),
        date: D1,
      }),
      expect.objectContaining({
        category: "machines",
        label: expect.stringMatching(/^Palivo/),
        amountMinor: 1_000_00,
        ref: expect.stringMatching(/^fuel:/),
      }),
    ]);
    const detail = await run("stroje.jobFleet", m.ctx, { jobId: j.id });
    expect(detail.usageMinor).toBe(800_00);
    expect(detail.fuelMinor).toBe(1_000_00);
    // řidič bez ekonomiky zakázky vidí provoz, ne sazby a náklady
    const blind = await run("stroje.jobFleet", (await driver()).ctx, { jobId: j.id });
    expect(blind.usageMinor).toBe(0);
    expect(blind.fuelMinor).toBe(0);
    expect(blind.rows[0]).toMatchObject({ rateMinor: null, costMinor: 0, fuelNetMinor: 0 });
    expect(Number(blind.rows[0]!.amount)).toBeGreaterThan(0);
    expect(await provider.costs(m.ctx, (await mkJob()).id, deps())).toEqual([]);

    const prefill = await (server.diaryPrefill[0] as DiaryPrefillProvider)(m.ctx, j.id, D1, deps());
    expect(prefill.machines).toMatch(new RegExp(a.name));
  });

  it("palivo na zakázku: součet na kartě zakázky a karty stroje se shoduje s řádky nákladů na haléř", async () => {
    const m = await manager();
    const j = await mkJob();
    const a = await mkAsset({ meterValue: "0.0" });
    // 1 001 Kč s DPH 21 % = 827,27 Kč bez DPH; dvě tankování: po záznamech 2 × 827,27 = 1 654,54 Kč
    for (const odo of [100, 200])
      await fuel(m.ctx, a.id, { meterValue: odo, totalMinor: 1_001_00, jobId: j.id });
    const lines = await (server.costProviders[0] as CostProvider).costs(m.ctx, j.id, deps());
    const fromLines = lines.reduce((acc, l) => acc + l.amountMinor, 0);
    expect(fromLines).toBe(2 * 82_727);
    const detail = await run("stroje.jobFleet", m.ctx, { jobId: j.id });
    expect(detail.fuelMinor).toBe(fromLines);
    const costs = await run("stroje.assetCosts", m.ctx, { assetId: a.id });
    expect(costs.fuelNetMinor).toBe(fromLines);
  });
});

describe("servis, intervaly a termíny", () => {
  it("servis splní interval, STK se posune a stav se zvedne", async () => {
    const m = await manager();
    const a = await mkAsset({ meterValue: "50000.0", stkDate: addDaysIso(todayIso(), 10) });
    const iv = await run("stroje.interval.save", m.ctx, {
      assetId: a.id,
      title: "Výměna oleje",
      everyMeter: 15000,
      everyMonths: 12,
      lastDate: addMonthsIso(todayIso(), -13),
      lastMeter: 30000,
    });
    let info = await run("stroje.service", m.ctx, { assetId: a.id });
    expect(info.intervals[0]).toMatchObject({ tone: "overdue" });

    await run("stroje.service.save", m.ctx, {
      assetId: a.id,
      date: todayIso(),
      kind: "service",
      title: "Olej a filtry",
      vendor: "Autoservis",
      costMinor: 6_500_00,
      meterValue: 50200,
      intervalId: iv.id,
    });
    info = await run("stroje.service", m.ctx, { assetId: a.id });
    expect(info.intervals[0]).toMatchObject({ tone: "ok", lastMeter: "50200.0" });
    expect(info.services).toHaveLength(1);
    expect((await assetNow(a.id)).meterValue).toBe("50200.0");

    const newStk = addMonthsIso(todayIso(), 24);
    await run("stroje.service.save", m.ctx, {
      assetId: a.id,
      date: todayIso(),
      kind: "inspection",
      title: "STK",
      nextStkDate: newStk,
    });
    expect((await assetNow(a.id)).stkDate).toBe(newStk);

    const costs = await run("stroje.assetCosts", m.ctx, { assetId: a.id });
    expect(costs.serviceMinor).toBe(6_500_00);

    await expect(
      run("stroje.service.save", m.ctx, {
        assetId: (await mkAsset()).id,
        date: todayIso(),
        kind: "service",
        title: "Cizí interval",
        intervalId: iv.id,
      }),
    ).rejects.toThrow(/nepatří/);
    await expect(
      run("stroje.interval.save", m.ctx, { assetId: a.id, title: "Nic" }),
    ).rejects.toThrow(/Zadejte interval/);
  });

  it("denní úloha upozorní na termíny jen jednou na stupeň", async () => {
    const m = await manager();
    const a = await mkAsset({
      stkDate: addDaysIso(todayIso(), 5),
      insuranceDate: addDaysIso(todayIso(), 100),
      plate: `T${tag()}`.toUpperCase(),
    });
    const jobDef = server.jobs?.find((j) => j.name === "stroje.deadlines") as ModuleJob;
    const jobDeps = {
      db: app.db,
      registry,
      queue: { send: async () => null },
      settings: {},
      baseURL: "http://localhost",
    } as unknown as ModuleJobDeps;
    await jobDef.handler(jobDeps, {}, {} as never);
    await jobDef.handler(jobDeps, {}, {} as never);
    const mine = () =>
      app.db
        .select()
        .from(schema.notification)
        .where(
          and(
            eq(schema.notification.userId, m.id),
            inArray(schema.notification.kind, ["stroje.deadline", "stroje.deadline_urgent"]),
            eq(schema.notification.entityId, a.id),
          ),
        );
    const first = await mine();
    expect(first).toHaveLength(1);
    expect(first[0]!.title).toMatch(/STK a emise za 5 dní/);
    // do týdne je to naléhavé; 30 dní předem běžné
    expect(first[0]).toMatchObject({ kind: "stroje.deadline_urgent", severity: "urgent" });
    expect(first[0]!.url).toBe(`/stroje/evidence/${a.id}`);

    // po změně termínu se stupeň a klíč změní → nové upozornění
    await app.db
      .update(asset)
      .set({ stkDate: addDaysIso(todayIso(), 20) })
      .where(eq(asset.id, a.id));
    await jobDef.handler(jobDeps, {}, {} as never);
    const after = await mine();
    expect(after).toHaveLength(2);
    expect(after.map((n) => n.kind).sort()).toEqual(["stroje.deadline", "stroje.deadline_urgent"]);
  });

  it("přehled, pozornost, widget a kalendář pro správce, ne pro řidiče", async () => {
    const m = await manager();
    const u = await driver();
    const a = await mkAsset({ stkDate: addDaysIso(todayIso(), -3) });
    const overview = await run("stroje.fleet", m.ctx, {});
    const row = overview.assets.find((x: { id: string }) => x.id === a.id);
    expect(row.alerts[0]).toMatchObject({ tone: "overdue", label: "STK a emise" });

    const attention = await (server.attention[0] as AttentionProvider)(m.ctx, deps());
    expect(attention.find((x) => x.id === "fleet-deadlines")?.severity).toBe("danger");
    expect(await (server.attention[0] as AttentionProvider)(u.ctx, deps())).toEqual([]);
    const widgets = await (server.widgets[0] as WidgetProvider)(m.ctx, deps());
    expect(widgets[0]).toMatchObject({ id: "fleet-status" });

    const layers = [...server.calendarLayers] as CalendarLayerProvider[];
    const terminy = layers.find((l) => l.key === "stroje.terminy")!;
    const range = { from: addDaysIso(todayIso(), -10), to: addDaysIso(todayIso(), 10) };
    expect((await terminy.items(m.ctx, range, deps())).some((i) => i.title.includes(a.name))).toBe(
      true,
    );
    expect(await terminy.items(u.ctx, range, deps())).toEqual([]);
  });
});

describe("rezervace", () => {
  it("hlídá kolize, upozorní obsluhu a umí rezervaci zrušit", async () => {
    const m = await manager();
    const u = await driver();
    const j = await mkJob();
    const a = await mkAsset();
    const from = addDaysIso(todayIso(), 5);
    const to = addDaysIso(todayIso(), 7);
    const r = await run("stroje.reservation.save", m.ctx, {
      assetId: a.id,
      dateFrom: from,
      dateTo: to,
      jobId: j.id,
      userId: u.id,
    });
    const notes = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, u.id),
          eq(schema.notification.kind, "stroje.reservation"),
        ),
      );
    expect(notes.length).toBeGreaterThan(0);

    await expect(
      run("stroje.reservation.save", m.ctx, {
        assetId: a.id,
        dateFrom: addDaysIso(todayIso(), 7),
        dateTo: addDaysIso(todayIso(), 9),
      }),
    ).rejects.toThrow(/už rezervovaný/);
    // sousední den kolizi nedělá; úprava vlastní rezervace také ne
    await run("stroje.reservation.save", m.ctx, {
      assetId: a.id,
      dateFrom: addDaysIso(todayIso(), 8),
      dateTo: addDaysIso(todayIso(), 8),
    });
    await run("stroje.reservation.save", m.ctx, {
      id: r.id,
      assetId: a.id,
      dateFrom: from,
      dateTo: addDaysIso(todayIso(), 6),
    });
    await expect(
      run("stroje.reservation.save", m.ctx, { assetId: a.id, dateFrom: to, dateTo: from }),
    ).rejects.toThrow(/před začátkem/);
    await expect(
      run("stroje.reservation.save", u.ctx, { assetId: a.id, dateFrom: from, dateTo: to }),
    ).rejects.toThrow();

    const list = await run("stroje.reservations", u.ctx, {
      from: addDaysIso(todayIso(), 0),
      to: addDaysIso(todayIso(), 30),
      assetId: a.id,
    });
    expect(list).toHaveLength(2);
    const layer = ([...server.calendarLayers] as CalendarLayerProvider[]).find(
      (l) => l.key === "stroje.rezervace",
    )!;
    const items = await layer.items(
      u.ctx,
      { from: todayIso(), to: addDaysIso(todayIso(), 30) },
      deps(),
    );
    expect(items.some((i) => i.title.includes(a.name))).toBe(true);

    await run("stroje.reservation.delete", m.ctx, { id: r.id });
    await run("stroje.reservation.save", m.ctx, { assetId: a.id, dateFrom: from, dateTo: to });
  });

  it("denní úloha připomene zítřejší rezervaci právě jednou", async () => {
    const m = await manager();
    const u = await driver();
    const a = await mkAsset();
    const tomorrow = addDaysIso(todayIso(), 1);
    await run("stroje.reservation.save", m.ctx, {
      assetId: a.id,
      dateFrom: tomorrow,
      dateTo: tomorrow,
      userId: u.id,
      note: "Výkopy",
    });
    const jobDef = server.jobs?.find((j) => j.name === "stroje.reservations") as ModuleJob;
    const jobDeps = {
      db: app.db,
      registry,
      queue: { send: async () => null },
      settings: {},
      baseURL: "http://localhost",
    } as unknown as ModuleJobDeps;
    await jobDef.handler(jobDeps, {}, {} as never);
    await jobDef.handler(jobDeps, {}, {} as never);
    const mine = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, u.id),
          eq(schema.notification.kind, "stroje.reservation_tomorrow"),
          eq(schema.notification.title, `Zítra: ${a.name}`),
        ),
      );
    expect(mine).toHaveLength(1);
  });
});

describe("závady", () => {
  it("blokující závada stroj odstaví, vytvoří úkol; vyřešení ho vrátí do provozu", async () => {
    const m = await manager();
    const u = await driver();
    const a = await mkAsset({ responsibleId: m.id });
    const r = await run("stroje.defect.report", u.ctx, {
      assetId: a.id,
      title: "Netěsní hydraulika",
      description: "Teče olej",
      severity: "blocking",
    });
    expect(r.blocking).toBe(true);
    expect((await assetNow(a.id)).status).toBe("service");
    const [def] = await app.db.select().from(assetDefect).where(eq(assetDefect.id, r.id));
    expect(def).toMatchObject({ status: "open", severity: "blocking", reportedBy: u.id });
    const [task] = await app.db.select().from(schema.task).where(eq(schema.task.id, r.taskId));
    expect(task).toMatchObject({
      assigneeId: m.id,
      priority: "high",
      entityType: "asset_defect",
      entityId: r.id,
      doneAt: null,
    });
    const notes = await app.db
      .select()
      .from(schema.notification)
      .where(and(eq(schema.notification.userId, m.id), eq(schema.notification.entityId, r.id)));
    expect(notes[0]!.title).toMatch(/Stroj mimo provoz/);
    expect(notes[0]).toMatchObject({
      kind: "stroje.defect_blocking",
      severity: "urgent",
      url: `/stroje/zavady/${r.id}`,
    });

    // ručně do provozu nejde, dokud je blokující závada otevřená
    const E = await resolveEntity(app.db, registry.get("asset")!);
    await expect(updateRecord(m.ctx, registry, E, a.id, { status: "active" })).rejects.toThrow(
      /blokující závadu/,
    );
    // řidič závadu nevyřeší
    await expect(
      run("stroje.defect.resolve", u.ctx, { id: r.id, resolution: "Hotovo" }),
    ).rejects.toBeInstanceOf(PermissionError);
    const done = await run("stroje.defect.resolve", m.ctx, {
      id: r.id,
      resolution: "Vyměněno těsnění",
    });
    expect(done.backInService).toBe(true);
    expect((await assetNow(a.id)).status).toBe("active");
    const [after] = await app.db.select().from(schema.task).where(eq(schema.task.id, r.taskId));
    expect(after!.doneAt).not.toBeNull();
    await expect(run("stroje.defect.resolve", m.ctx, { id: r.id })).rejects.toThrow(
      /už je vyřešená/,
    );
    const back = await app.db
      .select()
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.userId, u.id),
          eq(schema.notification.kind, "stroje.defect_resolved"),
        ),
      );
    expect(back.some((n) => /Opraveno/.test(n.title))).toBe(true);
  });

  it("drobná závada stroj neodstaví; stav se vrátí až po poslední blokující", async () => {
    const m = await manager();
    const a = await mkAsset();
    const minor = await run("stroje.defect.report", m.ctx, {
      assetId: a.id,
      title: "Škrábanec",
      severity: "normal",
    });
    expect((await assetNow(a.id)).status).toBe("active");
    const b1 = await run("stroje.defect.report", m.ctx, {
      assetId: a.id,
      title: "Brzdy",
      severity: "blocking",
    });
    const b2 = await run("stroje.defect.report", m.ctx, {
      assetId: a.id,
      title: "Světla",
      severity: "blocking",
    });
    expect((await run("stroje.defect.resolve", m.ctx, { id: b1.id })).backInService).toBe(false);
    expect((await assetNow(a.id)).status).toBe("service");
    expect((await run("stroje.defect.resolve", m.ctx, { id: b2.id })).backInService).toBe(true);
    // drobná zůstává otevřená, stroj jede
    const [d] = await app.db.select().from(assetDefect).where(eq(assetDefect.id, minor.id));
    expect(d!.status).toBe("open");

    const att = await (server.attention[0] as AttentionProvider)(m.ctx, deps());
    expect(att.some((x) => x.id === "fleet-defects")).toBe(true);
  });

  it("seznam intervalů nepřežije smazání stroje bez historie a karta ukáže přehled", async () => {
    const m = await manager();
    const a = await mkAsset();
    await run("stroje.interval.save", m.ctx, { assetId: a.id, title: "Brzdy", everyMonths: 6 });
    const [iv] = await app.db.select().from(assetInterval).where(eq(assetInterval.assetId, a.id));
    await run("stroje.interval.delete", m.ctx, { id: iv!.id });
    expect((await run("stroje.service", m.ctx, { assetId: a.id })).intervals).toEqual([]);
    const opts = await run("stroje.options", m.ctx, {});
    expect(opts.assets.some((x: { id: string }) => x.id === a.id)).toBe(true);
    expect(opts.me).toMatchObject({ id: m.id, canManage: true });
  });
});

const notesOf = (userId: string, kinds: string[], assetId?: string) =>
  app.db
    .select()
    .from(schema.notification)
    .where(
      and(
        eq(schema.notification.userId, userId),
        inArray(schema.notification.kind, kinds),
        assetId ? eq(schema.notification.entityId, assetId) : undefined,
      ),
    );

describe("plánovaná upozornění: termíny", () => {
  const KINDS = ["stroje.deadline", "stroje.deadline_urgent"];

  it("jednou na stupeň a termín, příjemci podle pravidel, znovu po změně data", async () => {
    const m = await manager();
    const resp = await makeUser(app.db, [["stroje.read", "own"]]); // odpovědná osoba jen s rozsahem „moje“
    const other = await makeUser(app.db, [["stroje.read", "own"]]);
    const a = await mkAsset({ stkDate: "2026-11-20", responsibleId: resp.id });
    const run1 = (iso: string) => sendDeadlineReminders(app.db, new Date(iso));

    await run1("2026-10-31T06:30:00Z"); // za 20 dní: běžné
    await run1("2026-10-31T06:30:00Z");
    const first = await notesOf(m.id, KINDS, a.id);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: "stroje.deadline", severity: "normal" });
    expect(first[0]!.title).toBe(`${a.name}: STK a emise za 20 dní`);
    expect(first[0]!.url).toBe(`/stroje/evidence/${a.id}`);
    expect(await notesOf(resp.id, KINDS, a.id)).toHaveLength(1);
    expect(await notesOf(other.id, KINDS, a.id)).toHaveLength(0);

    await run1("2026-11-14T06:30:00Z"); // za 6 dní: naléhavé
    await run1("2026-11-15T06:30:00Z"); // stejný stupeň další den: už ne
    await run1("2026-11-21T06:30:00Z"); // po termínu
    const all = await notesOf(m.id, KINDS, a.id);
    expect(all.map((n) => [n.kind, n.severity]).sort()).toEqual([
      ["stroje.deadline", "normal"],
      ["stroje.deadline_urgent", "urgent"],
      ["stroje.deadline_urgent", "urgent"],
    ]);

    // termín se prodloužil o rok: nový klíč, připomene se znovu
    await app.db.update(asset).set({ stkDate: "2027-11-20" }).where(eq(asset.id, a.id));
    await run1("2027-10-31T06:30:00Z");
    expect(await notesOf(m.id, KINDS, a.id)).toHaveLength(4);
  });

  it("„dnes“ je pražský den, i když je v UTC ještě včera (půlnoc při změně času 25. 10. 2026)", async () => {
    const m = await manager();
    const a = await mkAsset({ stkDate: "2026-11-01" });
    // 22:30 UTC 24. 10. je v Praze 25. 10. 0:30 (CEST): do 1. 11. zbývá 7 dní → naléhavé
    await sendDeadlineReminders(app.db, new Date("2026-10-24T22:30:00Z"));
    const [n] = await notesOf(m.id, KINDS, a.id);
    expect(n).toMatchObject({ kind: "stroje.deadline_urgent" });
    expect(n!.title).toMatch(/STK a emise za 7 dní/);
  });

  it("servisní interval: běžně při blížícím se, naléhavě po překročení", async () => {
    const m = await manager();
    const a = await mkAsset({ meterValue: "14000.0", plate: null });
    await app.db.insert(assetInterval).values({
      assetId: a.id,
      title: "Výměna oleje",
      everyMeter: 15_000,
      lastDate: "2026-01-10",
      lastMeter: "0.0",
    });
    const now = new Date("2026-10-01T06:30:00Z");
    await sendDeadlineReminders(app.db, now);
    await sendDeadlineReminders(app.db, now);
    const soon = await notesOf(m.id, KINDS, a.id);
    expect(soon).toHaveLength(1);
    expect(soon[0]).toMatchObject({ kind: "stroje.deadline", severity: "normal" });
    expect(soon[0]!.title).toMatch(/^.+: Výměna oleje: zbývá/);
    await app.db.update(asset).set({ meterValue: "16000.0" }).where(eq(asset.id, a.id));
    await sendDeadlineReminders(app.db, now);
    expect((await notesOf(m.id, KINDS, a.id)).map((n) => n.kind).sort()).toEqual([
      "stroje.deadline",
      "stroje.deadline_urgent",
    ]);
  });
});

describe("plánovaná upozornění: rezervace", () => {
  const TOMORROW = ["stroje.reservation_tomorrow"];
  const reserve = (assetId: string, userId: string | null, dateFrom: string) =>
    app.db
      .insert(assetReservation)
      .values({ assetId, userId, dateFrom, dateTo: dateFrom, note: "Výkopy" })
      .returning();

  it("zítřek se určuje v pražském čase; jednou na rezervaci a datum, znovu po přesunu", async () => {
    const u = await driver();
    const a = await mkAsset();
    // 23:30 UTC 28. 3. 2026 je v Praze už 29. 3. (den změny času): zítra je 30. 3.
    const now = new Date("2026-03-28T23:30:00Z");
    const [r] = await reserve(a.id, u.id, "2026-03-30");
    await reserve(a.id, u.id, "2026-03-29"); // „zítra podle UTC“ tím není
    await sendReservationReminders(app.db, now);
    await sendReservationReminders(app.db, now);
    const mine = await notesOf(u.id, TOMORROW, a.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      title: `Zítra: ${a.name}`,
      body: "Výkopy",
      url: `/stroje/evidence/${a.id}`,
    });

    // rezervace se přesunula na další den: připomene se znovu
    await app.db
      .update(assetReservation)
      .set({ dateFrom: "2026-03-31", dateTo: "2026-03-31" })
      .where(eq(assetReservation.id, r!.id));
    await sendReservationReminders(app.db, new Date("2026-03-30T13:00:00Z"));
    expect(await notesOf(u.id, TOMORROW, a.id)).toHaveLength(2);

    // podzimní změna času: 24. 10. 2026 v 15:00 CEST je zítra 25. 10.
    const b = await mkAsset();
    await reserve(b.id, u.id, "2026-10-25");
    await sendReservationReminders(app.db, new Date("2026-10-24T13:00:00Z"));
    expect(await notesOf(u.id, TOMORROW, b.id)).toHaveLength(1);
  });

  it("kdo stroj nesmí číst, upozornění nedostane; rezervace bez obsluhy nikoho neobtěžuje", async () => {
    const blind = await makeUser(app.db, [["stroje.read", "own"]]); // není odpovědný, nevidí cizí stroje
    const a = await mkAsset();
    await reserve(a.id, blind.id, "2026-05-12");
    await reserve(a.id, null, "2026-05-12");
    await sendReservationReminders(app.db, new Date("2026-05-11T13:00:00Z"));
    expect(await notesOf(blind.id, TOMORROW, a.id)).toHaveLength(0);
  });
});

describe("upozornění z příkazů: rezervace a závady", () => {
  it("rezervace upozorní obsluhu s titulkem a odkazem, aktéra samotného ne", async () => {
    const m = await manager();
    const u = await driver();
    const a = await mkAsset();
    const from = addDaysIso(todayIso(), 10);
    await run("stroje.reservation.save", m.ctx, {
      assetId: a.id,
      dateFrom: from,
      dateTo: from,
      userId: u.id,
      note: "Rozvoz",
    });
    const [n] = await notesOf(u.id, ["stroje.reservation"], a.id);
    expect(n!.title).toMatch(new RegExp(`^${a.name} je váš `));
    expect(n).toMatchObject({ body: "Rozvoz", url: `/stroje/evidence/${a.id}` });
    // správce si rezervuje sám sobě: nic
    await run("stroje.reservation.save", m.ctx, {
      assetId: a.id,
      dateFrom: addDaysIso(from, 5),
      dateTo: addDaysIso(from, 5),
      userId: m.id,
    });
    expect(await notesOf(m.id, ["stroje.reservation"], a.id)).toHaveLength(0);
  });

  it("drobná závada jde řešiteli (běžně), blokující navíc všem správcům (naléhavě)", async () => {
    const m = await manager();
    const m2 = await manager();
    const u = await driver();
    const a = await mkAsset({ responsibleId: m.id });
    const minor = await run("stroje.defect.report", u.ctx, {
      assetId: a.id,
      title: "Škrábanec",
      severity: "normal",
    });
    const [mn] = await app.db
      .select()
      .from(schema.notification)
      .where(and(eq(schema.notification.userId, m.id), eq(schema.notification.entityId, minor.id)));
    expect(mn).toMatchObject({
      kind: "stroje.defect",
      severity: "normal",
      url: `/stroje/zavady/${minor.id}`,
    });
    expect(mn!.title).toBe(`Závada: ${a.name}`);
    const forOther = (id: string) =>
      app.db
        .select()
        .from(schema.notification)
        .where(and(eq(schema.notification.userId, m2.id), eq(schema.notification.entityId, id)));
    expect(await forOther(minor.id)).toHaveLength(0);

    const hard = await run("stroje.defect.report", u.ctx, {
      assetId: a.id,
      title: "Prasklý rám",
      severity: "blocking",
    });
    const [bn] = await forOther(hard.id);
    expect(bn).toMatchObject({ kind: "stroje.defect_blocking", severity: "urgent" });
    // reportér sám sebe neupozorňuje
    const own = await app.db
      .select()
      .from(schema.notification)
      .where(and(eq(schema.notification.userId, u.id), eq(schema.notification.entityId, hard.id)));
    expect(own).toHaveLength(0);
  });
});
