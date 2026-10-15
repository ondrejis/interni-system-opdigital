import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  availablePresets,
  ensurePersonalBoards,
  evaluateWidget,
  getBoard,
  listBoards,
  type DashboardEnv,
} from "@rebar/core/dashboards";
import { NO_VIEW_ID, type DashboardWidget, type WidgetResult } from "@rebar/core/dashboards-shared";
import { schema, type Db } from "@rebar/core/db";
import { getPipeline } from "@rebar/core/config-data";
import { createRecord, resolveEntity } from "@rebar/core/entities";
import { taskType } from "@rebar/ukoly/schema";
import { eq } from "drizzle-orm";
import type { Ctx } from "@rebar/core/rbac";
import { connectAppDb } from "@rebar/core/testing";
import { WIDGET_PRESETS } from "@rebar/prehled/presets";
import { opsysDashboards } from "../clients/opsys/dashboards";
import {
  CANARY_PREFIX,
  hasCanary,
  PRIVATE_AMOUNT_MINOR,
  SHARED_AMOUNT_MINOR,
} from "./support/canary";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Přehled (PRE): soukromí ve widgetech a součtech (partner nikdy nevidí soukromé záznamy ani částky), Číslo a Seznam
  z pohledu, Rychlé odkazy, Poslední změny přes `auditReadScope`, katalog podle modulů a oprávnění, výchozí přehledy
  a jejich založení při prvním otevření.
*/

const app = connectAppDb();
let f: Fixture;
let db: Db;
let discard: () => Promise<void>;
let owner: Ctx;
let partner: Ctx;
let env: DashboardEnv;

const widget = (w: Omit<DashboardWidget, "id" | "w" | "h"> & { w?: number; h?: number }) =>
  ({ id: "w-int-test", w: 6, h: 3, ...w }) as DashboardWidget;

async function result(ctx: Ctx, w: DashboardWidget): Promise<WidgetResult> {
  const o = await evaluateWidget(ctx, env, w, { period: "all" }, { fresh: true });
  if (!o.ok) throw new Error(`Widget „${w.title}“ selhal: ${o.error}`);
  return o.result;
}
const kpi = async (ctx: Ctx, w: DashboardWidget) => {
  const r = await result(ctx, w);
  if (r.kind !== "kpi") throw new Error(`Čekal jsem číslo, přišlo ${r.kind}`);
  return r.value;
};

/** Pohled `entity` s filtrem „vše“, vlastník ho sdílí (nebo ne). */
async function view(entity: string, name: string, shared = true) {
  const [v] = await db
    .insert(schema.savedView)
    .values({
      entityType: entity,
      name,
      ownerId: f.people.owner.id,
      shared,
      config: { viewType: "table" },
      createdBy: f.people.owner.id,
      updatedBy: f.people.owner.id,
    })
    .returning();
  return v!.id;
}

/** Sdílené a soukromé záznamy s canary řetězcem (vlastní sestava: sdílená sestava QA-SEC zakládá i platby, které jdou jen z Financí). */
async function seedData() {
  const make = async (key: string, values: Record<string, unknown>) => {
    const def = f.registry.get(key);
    if (!def) return undefined;
    return (
      await createRecord(f.people.owner.ctx, f.registry, await resolveEntity(db, def), values)
    ).row;
  };
  const company = await make("company", { name: "Sdílená firma přehled" });
  await make("company", { name: `${CANARY_PREFIX}-company`, isPrivate: true });
  await make("job", {
    title: "Sdílená zakázka přehled",
    company: company!.id,
    type: "web",
    price: SHARED_AMOUNT_MINOR,
  });
  await make("job", {
    title: `${CANARY_PREFIX}-job`,
    company: company!.id,
    type: "web",
    price: PRIVATE_AMOUNT_MINOR,
    isPrivate: true,
  });
  const stage = f.registry.get("deal")
    ? (await getPipeline(db, "deal", "default"))?.stages[0]?.id
    : undefined;
  if (stage) {
    await make("deal", { title: "Sdílený obchod přehled", company: company!.id, status: stage });
    await make("deal", {
      title: `${CANARY_PREFIX}-deal`,
      company: company!.id,
      status: stage,
      isPrivate: true,
    });
  }
  if (
    f.registry.get("task") &&
    !(await db.select().from(taskType).where(eq(taskType.key, "task"))).length
  )
    await db.insert(taskType).values({ key: "task", name: "Úkol", isSystem: true } as never);
  await make("task", { title: "Sdílený úkol přehled" });
  await make("task", { title: `${CANARY_PREFIX}-task`, isPrivate: true });
}

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(app.db));
  f = await buildFixture(db);
  await seedData();
  owner = f.people.owner.ctx;
  partner = f.people.partner.ctx;
  env = {
    registry: f.registry,
    deps: f.deps,
    metrics: new Map(f.collected.dashboardMetrics.map((m) => [m.key, m])),
    builtins: {
      tiles: async (ctx) =>
        (await Promise.all(f.collected.widgets.map((w) => w(ctx, f.deps)))).flat(),
    },
    presets: WIDGET_PRESETS,
    cacheTtlMs: 0,
  };
}, 120_000);
afterAll(async () => {
  await discard();
  await app.close();
});

describe("Číslo z pohledu a Seznam z pohledu: soukromí", () => {
  it("počet z pohledu: partner nepočítá soukromé záznamy, vlastník ano", async () => {
    for (const entity of ["company", "job", "task"]) {
      const viewId = await view(entity, `Vše: ${entity}`);
      const w = widget({
        type: "kpi",
        title: "Počet",
        w: 3,
        h: 1,
        source: { kind: "view", viewId, agg: { fn: "count" } },
      });
      const o = await kpi(owner, w);
      const p = await kpi(partner, w);
      expect(o, entity).toBeGreaterThan(p ?? 0);
      expect(o! - p!, entity).toBeGreaterThanOrEqual(1);
    }
  });

  it("součet z pohledu: hodnota zakázek partnera neobsahuje soukromou částku", async () => {
    const viewId = await view("job", "Všechny zakázky");
    const w = widget({
      type: "kpi",
      title: "Součet hodnoty zakázek",
      w: 3,
      h: 1,
      source: { kind: "view", viewId, agg: { fn: "sum", attr: "price" } },
    });
    const o = await kpi(owner, w);
    const p = await kpi(partner, w);
    expect(o).toBeGreaterThanOrEqual(PRIVATE_AMOUNT_MINOR + SHARED_AMOUNT_MINOR);
    expect(p).toBeLessThan(PRIVATE_AMOUNT_MINOR);
    expect(p).toBeGreaterThanOrEqual(SHARED_AMOUNT_MINOR);
  });

  it("seznam z pohledu: řádky soukromých záznamů vidí jen vlastník, limit řádků platí", async () => {
    for (const entity of ["company", "job", "deal", "task"]) {
      if (!f.registry.get(entity)) continue;
      const viewId = await view(entity, `Seznam: ${entity}`);
      const w = widget({
        type: "table",
        title: "Seznam",
        source: { kind: "view", viewId, limit: 50 },
      });
      expect(hasCanary(await result(owner, w)), `owner ${entity}`).toBe(true);
      expect(hasCanary(await result(partner, w)), `partner ${entity}`).toBe(false);
      const one = await result(owner, { ...w, source: { kind: "view", viewId, limit: 1 } });
      expect(one.kind === "table" && one.rows.length).toBe(1);
    }
  });

  it("nesdílený pohled cizího uživatele widget nepoužije; nenastavený pohled se neuloží", async () => {
    const hidden = await view("company", "Jen pro Ondřeje", false);
    const w = widget({
      type: "kpi",
      title: "Cizí pohled",
      source: { kind: "view", viewId: hidden, agg: { fn: "count" } },
    });
    expect(await kpi(owner, w)).toBeGreaterThan(0);
    const o = await evaluateWidget(partner, env, w, { period: "all" }, { fresh: true });
    expect(o.ok).toBe(false);
    const empty = await evaluateWidget(
      owner,
      env,
      { ...w, source: { kind: "view", viewId: NO_VIEW_ID } },
      { period: "all" },
      { fresh: true },
    );
    expect(empty.ok).toBe(false);
  });
});

describe("Rychlé odkazy a Poslední změny", () => {
  it("odkazy: vlastní odkazy a pohledy; pohled, který partner nesmí, se mu nenabídne; nebezpečná adresa neprojde", async () => {
    const shared = await view("company", "Sdílený pohled firem");
    const hidden = await view("company", "Soukromý pohled Ondřeje", false);
    const w = widget({
      type: "list",
      title: "Rychlé odkazy",
      source: {
        kind: "links",
        links: [{ title: "Obchody", href: "/obchody" }],
        viewIds: [shared, hidden],
      },
    });
    const titles = async (c: Ctx) => {
      const r = await result(c, w);
      return r.kind === "list" ? r.items.map((i) => i.title) : [];
    };
    expect(await titles(owner)).toEqual([
      "Obchody",
      "Sdílený pohled firem",
      "Soukromý pohled Ondřeje",
    ]);
    expect(await titles(partner)).toEqual(["Obchody", "Sdílený pohled firem"]);
    const bad = await evaluateWidget(
      owner,
      env,
      {
        ...w,
        source: {
          kind: "links",
          links: [{ title: "x", href: "javascript:alert(1)" }],
          viewIds: [],
        },
      },
      { period: "all" },
      { fresh: true },
    );
    expect(bad.ok).toBe(false);
  });

  const recent = widget({
    type: "list",
    title: "Poslední změny",
    source: {
      kind: "metric",
      metric: "prehled.recent_changes",
      params: { scope: "all", limit: 50 },
    },
  });

  it("poslední změny: vlastník vidí soukromé záznamy, partner ne (auditReadScope)", async () => {
    const o = await result(owner, { ...recent, source: { ...recent.source, limit: 50 } as never });
    const p = await result(partner, {
      ...recent,
      source: { ...recent.source, limit: 50 } as never,
    });
    expect(hasCanary(o)).toBe(true);
    expect(hasCanary(p)).toBe(false);
    expect(JSON.stringify(p)).not.toContain(CANARY_PREFIX);
    expect(p.kind === "list" && p.items.length).toBeGreaterThan(0);
  });

  it("poslední změny „jen moje“: partner bez vlastních změn dostane prázdný seznam", async () => {
    const mine = {
      ...recent,
      source: { kind: "metric", metric: "prehled.recent_changes", params: { scope: "mine" } },
    } as DashboardWidget;
    const p = await result(partner, mine);
    expect(p.kind === "list" && p.items).toEqual([]);
  });

  it("privatePaths modulu: partner nedostane canary, vlastník ano", async () => {
    const paths = f.collected.privatePaths.filter((x) => x.name.startsWith("prehled."));
    expect(paths.length).toBeGreaterThan(5);
    let ownerSees = false;
    for (const p of paths) {
      expect(hasCanary(await p.run(partner, f.deps)), `partner ${p.name}`).toBe(false);
      if (hasCanary(await p.run(owner, f.deps))) ownerSees = true;
    }
    expect(ownerSees).toBe(true);
  });
});

describe("katalog widgetů podle modulů a oprávnění", () => {
  it("partner nedostane Expirace ani Retainery z Můj prostor, vlastník ano; MVP widgety mají oba", () => {
    const keys = (c: Ctx) => availablePresets(c, env).map((p) => p.key);
    const p = keys(partner);
    const o = keys(owner);
    for (const k of ["expirace", "hosting-prijem"]) {
      expect(p).not.toContain(k);
      expect(o).toContain(k);
    }
    for (const k of [
      "ukoly-po-terminu",
      "pipeline",
      "moje-obchody",
      "zakazky-skluz",
      "prijmy-mesic",
      "saldo",
      "nezaplacene",
      "posledni-zmeny",
      "rychle-odkazy",
      "cislo-z-pohledu",
      "seznam-z-pohledu",
    ]) {
      expect(p, `partner ${k}`).toContain(k);
      expect(o, `owner ${k}`).toContain(k);
    }
  });

  it("externí spolupracovník bez oprávnění nedostane žádný widget z modulů", () => {
    const keys = availablePresets(f.people.external.ctx, env).map((x) => x.key);
    expect(keys).not.toContain("prijmy-mesic");
    expect(keys).not.toContain("pipeline");
    expect(keys).not.toContain("expirace");
  });
});

describe("výchozí přehledy: založení při prvním otevření", () => {
  it("partner dostane Den a Finance (osobní kopie), podruhé nic, ani po smazání všech", async () => {
    // vzory rolí z klienta; role v testu mají předponu `sec-`
    for (const s of opsysDashboards()) {
      await db.insert(schema.dashboard).values({
        name: s.name,
        definition: s.definition,
        seedKey: `t-${s.key}`,
        defaultForRole: `sec-${s.role}`,
        ownerId: null,
      });
    }
    expect((await ensurePersonalBoards(partner)).created).toBe(2);
    const mine = (await listBoards(partner)).filter((b) => b.mine);
    expect(mine.map((b) => b.name)).toEqual(["Den", "Finance"]);
    expect((await listBoards(partner)).filter((b) => b.template).length).toBe(2);
    expect((await ensurePersonalBoards(partner)).created).toBe(0);
    // partner nesmí dostat nic z Můj prostor, ani jako osobní kopii
    const finance = await getBoard(partner, mine[1]!.id);
    expect(JSON.stringify(finance.definition)).not.toContain("muj-prostor");
    await db
      .update(schema.dashboard)
      .set({ deletedAt: new Date() })
      .where(eq(schema.dashboard.ownerId, f.people.partner.id));
    expect((await ensurePersonalBoards(partner)).created).toBe(0);
  });

  it("vlastník dostane Den a Finance vč. Expirací; úkoly na dnes bez poskytovatele jsou prázdné", async () => {
    expect((await ensurePersonalBoards(owner)).created).toBe(2);
    const boards = (await listBoards(owner)).filter((b) => b.mine);
    expect(boards.map((b) => b.name)).toEqual(["Den", "Finance"]);
    const fin = await getBoard(owner, boards[1]!.id);
    expect(JSON.stringify(fin.definition)).toContain("muj-prostor.expirations");
    const den = await getBoard(owner, boards[0]!.id);
    const tasks = den.definition.widgets.find((w) => w.title === "Úkoly na dnes")!;
    const r = await result(owner, tasks);
    expect(r.kind === "list" && r.items).toEqual([]);
  });

  it("výchozí Den projde u partnera i vlastníka bez soukromých dat", async () => {
    for (const ctx of [partner, owner]) {
      const templates = (await listBoards(ctx)).filter((b) => b.template && b.name === "Den");
      expect(templates).toHaveLength(1);
      const den = await getBoard(ctx, templates[0]!.id);
      for (const w of den.definition.widgets) {
        const o = await evaluateWidget(ctx, env, w, { period: "all" }, { fresh: true });
        if (ctx === partner) expect(hasCanary(o), `partner/${w.title}`).toBe(false);
        // chyba oprávnění je v pořádku (widget zamkne), ale nikdy ne výjimka mimo výsledek
        expect(typeof o.ok).toBe("boolean");
      }
    }
  });
});
