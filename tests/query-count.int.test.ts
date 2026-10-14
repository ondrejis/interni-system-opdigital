import { sql } from "drizzle-orm";
import { rebarDbUrls } from "@rebar/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@rebar/core/db";
import { queryGroups, queryRecords, resolveEntity, searchAll } from "@rebar/core/entities";
import { createCtx, loadActor, type Ctx } from "@rebar/core/rbac";
import { buildFixture, isolatedDb, type Fixture } from "./support/security-fixture";

/*
  Žádné N+1: počet dotazů nesmí záviset na množství dat. Každá operace se změří nad malým a pak nad velkým počtem
  záznamů (stejné řádky v odpovědi, víc dat v databázi, víc položek ve stromu) a počty dotazů se musí rovnat.
  Obecná pravidla jsou v docs/PERFORMANCE.md; měření latencí je `pnpm perf:check`.
*/

let queries = 0;
const handle = createDb(rebarDbUrls().app, {
  max: 4,
  logger: {
    logQuery() {
      queries++;
    },
  },
});
let db: Db;
let discard: () => Promise<void>;
let f: Fixture;
let owner: Ctx;
let foreman: Ctx;

beforeAll(async () => {
  ({ db, discard } = await isolatedDb(handle.db));
  f = await buildFixture(db);
  const actor = async (id: string) => (await loadActor(db, id, { catalog: f.catalog }))!;
  owner = createCtx(db, await actor(f.people.owner.id));
  foreman = createCtx(db, await actor(f.people.foremanA.id));
}, 120_000);
afterAll(async () => {
  await discard();
  await handle.close();
});

/** Počet dotazů jedné operace (zahřátí první, ať se nepočítají jednorázové dotazy na konfiguraci). */
async function count(fn: () => Promise<unknown>) {
  await fn();
  queries = 0;
  await fn();
  return queries;
}

/** Přidá `rows` zakázek (a jejich členy a náklady) přímo v SQL. */
async function grow(rows: number) {
  const tag = Math.random().toString(36).slice(2, 8);
  await db.execute(sql`
    insert into job (id, number, title, company_id, stage_id, phase, manager_id, value_minor, sum_contract_minor)
    select gen_random_uuid(), 'N1-' || ${tag} || '-' || g, 'Zakázka N+1 ' || g, j.company_id, j.stage_id, 'execution', j.manager_id, 1000000, 1000000
    from generate_series(1, ${rows}) g, (select company_id, stage_id, manager_id from job where id = ${f.jobA.id}) j`);
}

describe("počet dotazů nezávisí na množství dat", () => {
  it("seznam entity (50 řádků, součty, seskupení, rozsah „jen moje“, hledání)", async () => {
    const job = await resolveEntity(
      db,
      f.collected.entities.find((e) => e.key === "job")!,
    );
    // po jednom: počítadlo dotazů je společné
    const run = async () => [
      await count(() => queryRecords(owner, f.registry, job, { limit: 50 })),
      await count(() => queryRecords(foreman, f.registry, job, { limit: 50 })),
      await count(() => queryRecords(owner, f.registry, job, { limit: 50, q: "zakazka" })),
      await count(() => queryGroups(owner, job, "stage", {})),
      await count(() => searchAll(owner, f.registry.all(), "zakazka")),
    ];
    const before = await run();
    await grow(120);
    const after = await run();
    // sdílená databáze se mezi soubory testů mění (např. definice vlastních polí přidají jeden dotaz na načtení definic),
    // proto tolerance jednoho dotazu; N+1 by při 120 nových řádcích přidalo desítky dotazů
    after.forEach((n, i) => expect(Math.abs(n - before[i]!)).toBeLessThanOrEqual(1));
    expect(Math.max(...after)).toBeLessThanOrEqual(8);
  });

  it("přehled (pozornost a dlaždice) pro majitele i mistra", async () => {
    const dash = (ctx: Ctx) => async () => {
      await Promise.all([
        ...f.collected.attention.map((a) => a(ctx, f.deps)),
        ...f.collected.widgets.map((w) => w(ctx, f.deps)),
      ]);
    };
    const before = [await count(dash(owner)), await count(dash(foreman))];
    await grow(100);
    const after = [await count(dash(owner)), await count(dash(foreman))];
    // moduly mají podmíněné dotazy podle toho, co v databázi je (sdílí ji ostatní soubory testů), proto malá tolerance;
    // N+1 by přidalo desítky dotazů (přibylo 100 zakázek)
    after.forEach((n, i) => expect(Math.abs(n - before[i]!)).toBeLessThanOrEqual(3));
  });

  it("strom rozpočtu, souhrn a náklady zakázky", async () => {
    const cmd = (name: string, input: unknown) => async () => {
      const c = f.collected.commands.get(name)!;
      await c.handler(owner, c.input.parse(input), f.deps);
    };
    const ops = {
      tree: cmd("zakazky.budget.tree", { jobId: f.jobA.id }),
      summary: cmd("zakazky.summary", { jobId: f.jobA.id }),
      costs: cmd("zakazky.costs.list", { jobId: f.jobA.id }),
      orders: cmd("zakazky.orders.list", { jobId: f.jobA.id }),
      changes: cmd("zakazky.change.list", { jobId: f.jobA.id }),
    };
    const measure = async () => {
      const out: Record<string, number> = {};
      for (const [k, fn] of Object.entries(ops)) out[k] = await count(fn);
      return out;
    };
    const before = await measure();
    // 300 položek rozpočtu v 15 oddílech a 300 nákladů
    await db.execute(sql`
      insert into budget_section (id, version_id, object_id, title, position)
      select gen_random_uuid(), v.id, o.id, 'Oddíl ' || s, s + 10
      from generate_series(1, 15) s, (select id from budget_version where job_id = ${f.jobA.id} and kind = 'realization') v,
        (select id from budget_object where version_id = (select id from budget_version where job_id = ${f.jobA.id} and kind = 'realization') limit 1) o`);
    await db.execute(sql`
      insert into budget_item (id, version_id, section_id, position, title, quantity, unit_cost_minor, unit_price_minor)
      select gen_random_uuid(), s.version_id, s.id, i, 'Položka ' || i, 2, 1000, 1500
      from budget_section s, generate_series(1, 20) i where s.version_id = (select id from budget_version where job_id = ${f.jobA.id} and kind = 'realization')`);
    await db.execute(sql`
      insert into job_cost (id, job_id, date, category, title, amount_minor)
      select gen_random_uuid(), ${f.jobA.id}, date '2026-09-01', 'material', 'Náklad ' || g, 100000 from generate_series(1, 300) g`);
    const after = await measure();
    expect(after).toEqual(before);
  });
});
