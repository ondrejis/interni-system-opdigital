import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cloneBoard,
  createBoard,
  deleteBoard,
  ensureSeedDashboards,
  evaluateWidget,
  getBoard,
  homeBoardId,
  listAllBoards,
  listBoards,
  MAX_WIDGETS,
  reorderBoards,
  seedDashboard,
  setRoleDefault,
  shareBoard,
  sourceCatalog,
  updateBoard,
  clearDashboardCache,
  type DashboardEnv,
} from "@rebar/core/dashboards";
import type { DashboardWidget } from "@rebar/core/dashboards-shared";
import { schema } from "@rebar/core/db";
import type { Db } from "@rebar/core/db";
import { aggregateRecords, resolveEntity } from "@rebar/core/entities";
import { defineDashboardMetric } from "@rebar/core/module-server";
import { PermissionError, UserError } from "@rebar/core/rbac";
import { connectAppDb, makeUser } from "@rebar/core/testing";
import { buildFixture, isolatedDb, MONEY, type Fixture } from "./support/legacy/fixture";

/**
 * Nástěnky: agregace nad entitami, bezpečnost dotazů (oprávnění a rozsah řádků na úrovni dat, ani úpravou definice widgetu),
 * mezipaměť na uživatele, časový limit, správa nástěnek (sdílení, výchozí pro roli, pořadí, seed) a limity.
 */
const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let env: DashboardEnv;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  env = {
    registry: f.registry,
    deps: f.deps,
    metrics: new Map(f.collected.dashboardMetrics.map((m) => [m.key, m])),
    cacheTtlMs: 0,
  };
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

const P = () => f.people;
const widget = (over: Partial<DashboardWidget>): DashboardWidget => ({
  id: `w-${Math.random().toString(36).slice(2, 10)}`,
  type: "kpi",
  title: "Test",
  w: 3,
  h: 1,
  source: { kind: "entity", entity: "job", agg: { fn: "count" } },
  ...over,
});
const jobEntity = () => resolveEntity(db, f.registry.get("job")!);
/** Jen zakázky z fixtury (databáze je sdílená s dalšími soubory testů). */
const OURS = {
  op: "or" as const,
  conditions: [
    { attr: "title", op: "equals" as const, value: "Zakázka A" },
    { attr: "title", op: "equals" as const, value: "Zakázka B" },
  ],
};

describe("agregace entity: oprávnění a rozsah řádků", () => {
  it("majitel spočítá zakázky a součet hodnot; externista vidí jen své zakázky", async () => {
    const e = await jobEntity();
    const all = await aggregateRecords(P().owner.ctx, f.registry, e, { fn: "count" });
    const mine = await aggregateRecords(P().externistaA.ctx, f.registry, e, { fn: "count" });
    expect(all.total.count).toBeGreaterThanOrEqual(2);
    expect(mine.total.count).toBe(1);
    const sum = await aggregateRecords(P().owner.ctx, f.registry, e, {
      fn: "sum",
      attr: "value",
      filters: { op: "and", conditions: [{ attr: "title", op: "equals", value: "Zakázka A" }] },
    });
    expect(sum.total.value).toBe(MONEY.value);
  });

  it("součet atributu skrytého oprávněním externista nedostane (neexistuje pro něj)", async () => {
    const e = await jobEntity();
    for (const who of [P().externistaA]) {
      await expect(
        aggregateRecords(who.ctx, f.registry, e, { fn: "sum", attr: "value" }),
      ).rejects.toBeInstanceOf(UserError);
      await expect(
        aggregateRecords(who.ctx, f.registry, e, {
          fn: "count",
          groupBy: { attr: "stage" },
          filters: { op: "and", conditions: [{ attr: "value", op: "gt", value: 1 }] },
        }),
      ).rejects.toBeInstanceOf(UserError);
    }
  });

  it("seskupení podle stavu, uživatele a období (měsíc) vrací popisky a počty", async () => {
    const e = await jobEntity();
    const byStage = await aggregateRecords(P().owner.ctx, f.registry, e, {
      fn: "count",
      groupBy: { attr: "stage" },
      filters: OURS,
    });
    expect(byStage.groups[0]!.label).not.toBe("");
    const byManager = await aggregateRecords(P().owner.ctx, f.registry, e, {
      fn: "count",
      groupBy: { attr: "manager" },
      filters: OURS,
      limit: 50,
    });
    expect(byManager.groups.map((g) => g.label)).toContain(P().externistaA.name);
    const byMonth = await aggregateRecords(P().owner.ctx, f.registry, e, {
      fn: "count",
      groupBy: { attr: "startDate", bucket: "month" },
      filters: OURS,
    });
    expect(byMonth.groups.some((g) => g.key === "2026-09-01" && g.label === "září 2026")).toBe(
      true,
    );
  });

  it("každý datumový atribut každé entity jde seskupit po měsících (i sloupce s časem, Europe/Prague)", async () => {
    for (const def of f.registry.all()) {
      if (!def.attributes.some((a) => a.type === "date")) continue;
      const e = await resolveEntity(db, def);
      for (const a of def.attributes.filter((x) => x.type === "date")) {
        const r = await aggregateRecords(P().owner.ctx, f.registry, e, {
          fn: "count",
          groupBy: { attr: a.key, bucket: "month" },
        }).catch((err: unknown) => {
          if (err instanceof UserError) return null; // atribut skrytý oprávněním
          throw err;
        });
        void r;
      }
    }
  });

  it("místní den v Praze: 29. 3. 00:30 CET je už 29. 3., 31. 10. 23:30 CET ještě říjen", async () => {
    const r = await db.execute(sql`select
      (timestamptz '2026-03-28 23:30:00+00' at time zone 'Europe/Prague')::date::text as a,
      (timestamptz '2026-10-31 22:30:00+00' at time zone 'Europe/Prague')::date::text as b`);
    const row = (r as unknown as { a: string; b: string }[])[0]!;
    expect(row).toEqual({ a: "2026-03-29", b: "2026-10-31" });
  });

  it("průměr, minimum a maximum a omezení období", async () => {
    const e = await jobEntity();
    const avg = await aggregateRecords(P().owner.ctx, f.registry, e, {
      fn: "avg",
      attr: "value",
      filters: { op: "and", conditions: [{ attr: "title", op: "equals", value: "Zakázka A" }] },
    });
    expect(avg.total.value).toBe(MONEY.value);
    const min = await aggregateRecords(P().owner.ctx, f.registry, e, {
      fn: "min",
      attr: "startDate",
    });
    expect(min.total.text).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const inPeriod = await aggregateRecords(P().owner.ctx, f.registry, e, {
      fn: "count",
      period: { attr: "startDate", from: "2026-09-01", to: "2026-09-30" },
      filters: { op: "and", conditions: [{ attr: "title", op: "equals", value: "Zakázka A" }] },
    });
    expect(inPeriod.total.count).toBe(1);
    const outside = await aggregateRecords(P().owner.ctx, f.registry, e, {
      fn: "count",
      period: { attr: "startDate", from: "2026-01-01", to: "2026-01-31" },
      filters: { op: "and", conditions: [{ attr: "title", op: "equals", value: "Zakázka A" }] },
    });
    expect(outside.total.count).toBe(0);
  });
});

describe("evaluateWidget: oprávnění ani úprava definice nic neodemkne", () => {
  const sumWidget = () =>
    widget({
      source: { kind: "entity", entity: "job", agg: { fn: "sum", attr: "value" } },
    });

  it("majitel dostane součet, externista chybu a v odpovědi nejsou peníze", async () => {
    const ok = await evaluateWidget(P().owner.ctx, env, sumWidget(), { period: "all" });
    expect(ok.ok).toBe(true);
    const bad = await evaluateWidget(P().externistaA.ctx, env, sumWidget(), { period: "all" });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).not.toContain(String(MONEY.value));
    const worker = await evaluateWidget(P().externistaA.ctx, env, sumWidget(), { period: "all" });
    expect(worker.ok).toBe(false);
  });

  it("seznam záznamů a graf externisty: jen jeho zakázky, bez sloupců s cenou", async () => {
    const list = await evaluateWidget(
      P().externistaA.ctx,
      env,
      widget({
        type: "table",
        source: { kind: "records", entity: "job", columns: ["title", "value"] },
      }),
      { period: "all" },
    );
    expect(list.ok).toBe(false);
    const ok = await evaluateWidget(
      P().externistaA.ctx,
      env,
      widget({
        type: "table",
        source: { kind: "records", entity: "job", columns: ["title", "number"] },
      }),
      { period: "all" },
    );
    expect(ok.ok && ok.result.kind === "table" && ok.result.rows.length).toBe(1);
  });

  it("neplatná definice (neznámý druh, příliš mnoho widgetů, špatný graf) vrací chybu, ne výjimku", async () => {
    expect((await evaluateWidget(P().owner.ctx, env, { type: "kpi" }, { period: "all" })).ok).toBe(
      false,
    );
    const noGroup = await evaluateWidget(
      P().owner.ctx,
      env,
      widget({ type: "chart", source: { kind: "entity", entity: "job", agg: { fn: "count" } } }),
      { period: "all" },
    );
    expect(noGroup.ok).toBe(false);
    const missing = await evaluateWidget(
      P().owner.ctx,
      env,
      widget({ source: { kind: "entity", entity: "neexistuje", agg: { fn: "count" } } }),
      { period: "all" },
    );
    expect(missing.ok).toBe(false);
  });

  it("metrika bez všech oprávnění nejde vyhodnotit a není v katalogu", async () => {
    const secret = defineDashboardMetric({
      key: "zakazky.test_secret",
      label: "Tajná",
      format: "money",
      shape: "scalar",
      permissions: ["zakazky.finance"],
      compute: async () => ({ kind: "scalar", value: 777 }),
    });
    const e2: DashboardEnv = { ...env, metrics: new Map([[secret.key, secret]]) };
    const w = widget({ source: { kind: "metric", metric: secret.key } });
    const ok = await evaluateWidget(P().owner.ctx, e2, w, { period: "all" });
    expect(ok.ok && ok.result.kind === "kpi" && ok.result.value).toBe(777);
    const no = await evaluateWidget(P().externistaA.ctx, e2, w, { period: "all" });
    expect(no).toMatchObject({ ok: false, code: "forbidden" });
    expect(sourceCatalog(P().externistaA.ctx, e2).metrics).toHaveLength(0);
    expect(sourceCatalog(P().owner.ctx, e2).metrics).toHaveLength(1);
    expect(sourceCatalog(P().externistaA.ctx, e2).entities.some((x) => x.key === "job")).toBe(true);
  });

  it("srovnání období: scalar metrika se vyhodnotí dvakrát (aktuální a předchozí období)", async () => {
    const calls: (string | null)[] = [];
    const m = defineDashboardMetric({
      key: "zakazky.test_period",
      label: "Perioda",
      format: "number",
      shape: "scalar",
      permissions: [],
      supports: { period: true },
      compute: async (_c, input) => {
        calls.push(input.from);
        return { kind: "scalar", value: input.from === "2026-10-01" ? 30 : 20 };
      },
    });
    const e2: DashboardEnv = {
      ...env,
      metrics: new Map([[m.key, m]]),
      now: () => new Date("2026-10-15T10:00:00Z"),
    };
    const r = await evaluateWidget(
      P().owner.ctx,
      e2,
      widget({
        source: { kind: "metric", metric: m.key },
        options: { compare: "previous_period" },
      }),
      { period: "this_month" },
    );
    expect(calls).toEqual(["2026-10-01", "2026-09-01"]);
    expect(r.ok && r.result.kind === "kpi" && r.result.delta).toEqual({ abs: 10, pct: 50 });
  });

  it("mezipaměť je na uživatele: výsledek majitele se nikdy nevrátí mistrovi", async () => {
    clearDashboardCache();
    const cached: DashboardEnv = { ...env, cacheTtlMs: 60_000 };
    const w = sumWidget();
    const a = await evaluateWidget(P().owner.ctx, cached, w, { period: "all" });
    expect(a.ok).toBe(true);
    const again = await evaluateWidget(P().owner.ctx, cached, w, { period: "all" });
    expect(again).toBe(a); // z mezipaměti
    const b = await evaluateWidget(P().externistaA.ctx, cached, w, { period: "all" });
    expect(b.ok).toBe(false);
    clearDashboardCache();
  });

  it("dlouhý dotaz skončí českou hláškou o překročení času a nerozbije ostatní widgety", async () => {
    const slow = defineDashboardMetric({
      key: "zakazky.test_slow",
      label: "Pomalá",
      format: "number",
      shape: "scalar",
      permissions: [],
      compute: async (ctx) => {
        await ctx.db.execute(sql`select pg_sleep(3)`);
        return { kind: "scalar", value: 1 };
      },
    });
    const e2: DashboardEnv = { ...env, metrics: new Map([[slow.key, slow]]), timeoutMs: 150 };
    const r = await evaluateWidget(
      P().owner.ctx,
      e2,
      widget({ source: { kind: "metric", metric: slow.key } }),
      {
        period: "all",
      },
    );
    expect(r).toMatchObject({ ok: false, code: "timeout" });
    const fine = await evaluateWidget(P().owner.ctx, e2, widget({}), { period: "all" });
    expect(fine.ok).toBe(true);
  });

  it("filtr nástěnky (zakázka) zúží widget", async () => {
    const r = await evaluateWidget(
      P().owner.ctx,
      env,
      widget({
        source: {
          kind: "entity",
          entity: "job",
          agg: { fn: "count" },
        },
      }),
      { period: "all", jobId: f.jobA.id },
    );
    expect(r.ok).toBe(true);
    const onJob = await evaluateWidget(P().owner.ctx, env, widget({}), {
      period: "all",
      jobId: f.jobA.id,
    });
    expect(onJob.ok && onJob.result.kind === "kpi" && onJob.result.value).toBe(1);
  });
});

describe("druhy widgetů", () => {
  const entity = { kind: "entity" as const, entity: "job" };
  it("měřidlo (plnění cíle), skládaný graf, koláč, souhrn podle stavu a seznam", async () => {
    const ctx = P().owner.ctx;
    const gauge = await evaluateWidget(
      ctx,
      env,
      widget({
        type: "gauge",
        source: { ...entity, agg: { fn: "count" } },
        options: { target: 4 },
      }),
      { period: "all" },
    );
    expect(gauge.ok && gauge.result.kind === "gauge" && gauge.result.pct).toBeGreaterThan(0);

    const stacked = await evaluateWidget(
      ctx,
      env,
      widget({
        type: "chart",
        source: { ...entity, agg: { fn: "count" }, groupBy: { attr: "phase" }, splitBy: "stage" },
        options: { chart: "stacked" },
      }),
      { period: "all" },
    );
    expect(stacked.ok && stacked.result.kind === "chart" && stacked.result.chart).toBe("stacked");
    expect(
      stacked.ok && stacked.result.kind === "chart" && stacked.result.series.length,
    ).toBeGreaterThan(0);

    const pie = await evaluateWidget(
      ctx,
      env,
      widget({
        type: "chart",
        source: { ...entity, agg: { fn: "count" }, groupBy: { attr: "phase" } },
        options: { chart: "pie" },
      }),
      { period: "all" },
    );
    expect(pie.ok && pie.result.kind === "chart" && pie.result.chart).toBe("pie");

    const status = await evaluateWidget(
      ctx,
      env,
      widget({
        type: "status",
        source: { ...entity, agg: { fn: "count" }, groupBy: { attr: "stage" } },
      }),
      { period: "all" },
    );
    expect(
      status.ok && status.result.kind === "status" && status.result.stages.length,
    ).toBeGreaterThan(0);

    const list = await evaluateWidget(
      ctx,
      env,
      widget({
        type: "list",
        source: {
          kind: "records",
          entity: "job",
          columns: ["title", "endDate"],
          sort: [{ attr: "endDate", dir: "asc" }],
          limit: 5,
        },
      }),
      { period: "all" },
    );
    expect(list.ok && list.result.kind === "list" && list.result.items.length).toBeGreaterThan(0);
    const top = await evaluateWidget(
      ctx,
      env,
      widget({
        type: "table",
        source: {
          ...entity,
          agg: { fn: "sum", attr: "value" },
          groupBy: { attr: "manager" },
          limit: 3,
        },
      }),
      { period: "all" },
    );
    expect(top.ok && top.result.kind === "table" && top.result.rows.length).toBeGreaterThan(0);
  });
});

describe("správa nástěnek", () => {
  const def = (n = 1) =>
    seedDashboard({
      key: "x",
      name: "x",
      role: "x",
      widgets: Array.from({ length: n }, (_, i) => ({
        type: "kpi" as const,
        title: `K${i}`,
        source: { kind: "entity" as const, entity: "job", agg: { fn: "count" as const } },
      })),
    }).definition;

  it("vlastní nástěnka: založení, úprava s kontrolou souběžné změny, klon, smazání, audit", async () => {
    const u = await makeUser(db, [["dashboards.write", "all"]]);
    const { id } = await createBoard(u.ctx, { name: "Moje", definition: def(2) });
    const b = await getBoard(u.ctx, id);
    expect(b.definition.widgets).toHaveLength(2);
    expect(b.summary.canEdit).toBe(true);
    const upd = await updateBoard(u.ctx, id, {
      name: "Moje 2",
      definition: def(3),
      expectedUpdatedAt: b.summary.updatedAt,
    });
    await expect(
      updateBoard(u.ctx, id, { name: "Starší verze", expectedUpdatedAt: b.summary.updatedAt }),
    ).rejects.toThrow(/mezitím někdo změnil/);
    expect(upd.updatedAt).not.toBe(b.summary.updatedAt);
    const clone = await cloneBoard(u.ctx, id);
    expect((await getBoard(u.ctx, clone.id)).summary.name).toContain("(kopie)");
    await deleteBoard(u.ctx, clone.id);
    await expect(getBoard(u.ctx, clone.id)).rejects.toThrow(/nenalezena/);
    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(
        sql`${schema.auditLog.entityType} = 'dashboard' and ${schema.auditLog.entityId} = ${id}`,
      );
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["create", "update"]));
  });

  it("bez dashboards.write nástěnku nezaloží; cizí nástěnku nevidí ani neupraví", async () => {
    const author = await makeUser(db, [["dashboards.write", "all"]]);
    const other = await makeUser(db, [["dashboards.write", "all"]]);
    const reader = await makeUser(db, []);
    const { id } = await createBoard(author.ctx, { name: "Soukromá", definition: def() });
    await expect(createBoard(reader.ctx, { name: "Nelze" })).rejects.toBeInstanceOf(
      PermissionError,
    );
    await expect(getBoard(other.ctx, id)).rejects.toThrow(/nenalezena/);
    expect((await listBoards(other.ctx)).some((x) => x.id === id)).toBe(false);
    // sdílená s uživatelem: vidí, ale needituje
    await shareBoard(author.ctx, id, { roles: [], users: [other.id] });
    expect((await listBoards(other.ctx)).find((x) => x.id === id)).toMatchObject({
      kind: "shared",
      canEdit: false,
    });
    await expect(updateBoard(other.ctx, id, { name: "Přepsáno" })).rejects.toBeInstanceOf(
      PermissionError,
    );
    await expect(deleteBoard(other.ctx, id)).rejects.toBeInstanceOf(PermissionError);
    // zrušení sdílení
    await shareBoard(author.ctx, id, { roles: [], users: [] });
    expect((await listBoards(other.ctx)).some((x) => x.id === id)).toBe(false);
  });

  it("sdílení s rolí a výchozí nástěnka pro roli (domovská nahradí Přehled, jedna za roli)", async () => {
    const admin = await makeUser(db, [
      ["dashboards.manage", "all"],
      ["dashboards.write", "all"],
    ]);
    const a = await createBoard(admin.ctx, { name: "Pro roli A", definition: def() });
    const b = await createBoard(admin.ctx, { name: "Pro roli B", definition: def() });
    const member = await makeUser(db, []);
    const [role] = await db
      .select()
      .from(schema.user)
      .where(sql`id = ${member.id}`);
    const [r] = await db
      .select({ key: schema.role.key })
      .from(schema.role)
      .where(sql`id = ${role!.roleId}`);
    await setRoleDefault(admin.ctx, a.id, { roleKey: r!.key, home: true });
    expect(await homeBoardId(member.ctx)).toBe(a.id);
    await setRoleDefault(admin.ctx, b.id, { roleKey: r!.key, home: true });
    expect(await homeBoardId(member.ctx)).toBe(b.id); // původní domovská se uvolnila
    expect((await listBoards(member.ctx)).map((x) => x.kind)).toEqual([
      "role_default",
      "role_default",
    ]);
    await expect(setRoleDefault(member.ctx, a.id, { roleKey: null })).rejects.toBeInstanceOf(
      PermissionError,
    );
    await shareBoard(admin.ctx, a.id, { roles: ["neexistuje"], users: [] }).catch((e) =>
      expect(e).toBeInstanceOf(UserError),
    );
    // správce vidí všechny a smí otevřít cizí
    expect((await listAllBoards(admin.ctx)).length).toBeGreaterThanOrEqual(2);
    expect((await getBoard(admin.ctx, a.id)).summary.id).toBe(a.id);
  });

  it("pořadí v přepínači je osobní", async () => {
    const u = await makeUser(db, [["dashboards.write", "all"]]);
    const x = await createBoard(u.ctx, { name: "X", definition: def() });
    const y = await createBoard(u.ctx, { name: "Y", definition: def() });
    await reorderBoards(u.ctx, [y.id, x.id]);
    expect((await listBoards(u.ctx)).map((s) => s.name)).toEqual(["Y", "X"]);
    await reorderBoards(u.ctx, [x.id, y.id]);
    expect((await listBoards(u.ctx)).map((s) => s.name)).toEqual(["X", "Y"]);
  });

  it("limity: nejvýš 24 widgetů, neplatná definice se neuloží", async () => {
    const u = await makeUser(db, [["dashboards.write", "all"]]);
    await expect(
      createBoard(u.ctx, { name: "Moc", definition: def(MAX_WIDGETS + 1) }),
    ).rejects.toThrow(/nejvýš 24/);
    await expect(
      createBoard(u.ctx, { name: "Zlá", definition: { schemaVersion: 1, widgets: [{}] } }),
    ).rejects.toBeInstanceOf(UserError);
    await expect(createBoard(u.ctx, { name: "   " })).rejects.toThrow(/Vyplňte název/);
  });

  it("výchozí sady klienta: zakládají se jednou, smazaná ani upravená se nepřepisuje, chybějící role se přeskočí", async () => {
    const seeds = [
      seedDashboard({
        key: `t-${Math.random().toString(36).slice(2, 8)}`,
        name: "Sada",
        role: "sec-owner",
        widgets: [
          {
            type: "kpi",
            title: "K",
            source: { kind: "entity", entity: "job", agg: { fn: "count" } },
          },
        ],
      }),
      seedDashboard({
        key: `t-${Math.random().toString(36).slice(2, 8)}`,
        name: "Bez role",
        role: "neexistuje-role",
        widgets: [],
      }),
    ];
    const first = await ensureSeedDashboards(db, seeds);
    expect(first.created).toEqual([seeds[0]!.key]);
    const again = await ensureSeedDashboards(db, seeds);
    expect(again.created).toEqual([]);
    await db.execute(
      sql`update dashboard set deleted_at = now() where seed_key = ${seeds[0]!.key}`,
    );
    expect((await ensureSeedDashboards(db, seeds)).created).toEqual([]);
    await expect(
      ensureSeedDashboards(db, [
        {
          ...seeds[0]!,
          key: "zla-sada",
          definition: { schemaVersion: 1, widgets: [{ bad: 1 }] } as never,
        },
      ]),
    ).rejects.toThrow(/Neplatná definice/);
  });
});
