import { randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectPermissions, resolveModules, type ClientConfig } from "@rebar/core";
import { getPipeline } from "@rebar/core/config-data";
import { createDb, type DbHandle } from "@rebar/core/db";
import { queryGroups, queryRecords, resolveEntity, searchAll } from "@rebar/core/entities";
import { aggregateRecords } from "@rebar/core/entities";
import { evaluateWidget, type DashboardEnv } from "@rebar/core/dashboards";
import { prepareEntityExport } from "@rebar/core/export";
import { coreJobs } from "@rebar/core/jobs";
import { migrationSources, runMigrations } from "@rebar/core/migrations";
import type { ModuleDeps } from "@rebar/core/module-server";
import { createCtx, loadActor, type Ctx } from "@rebar/core/rbac";
import { runSeed } from "@rebar/core/seed";
import { createCipher, parseKeyRing } from "@rebar/core/security";
import { createSettings } from "@rebar/core/settings";
import { ALL_MODULES } from "../apps/web/src/modules";
import { buildRegistry, collectServers } from "../apps/web/src/server/modules-server";
import opsysSeed from "../clients/opsys/seed/index";
import { opsysDashboards } from "../clients/opsys/dashboards";

/**
 * Měření výkonu na syntetických datech (zadání §8: seznam 50 řádků do 1 s, cíl stroj 1 vCPU / 4 GB).
 *
 *   pnpm perf:check                      vytvoří databázi `rebar_perf`, nasype data (20 000 zakázek, 50 000 firem a osob,
 *                                        100 000 řádků docházky), změří serverové latence a vypíše p50/p95
 *   pnpm perf:check --reset              databázi zahodí a nasype znovu
 *   pnpm perf:check --explain            navíc EXPLAIN ANALYZE dotazů, které trvají déle než 5 ms (sekvenční čtení velkých tabulek)
 *   pnpm perf:check --queries            vypíše dotazy jednotlivých měření (hledání N+1)
 *   pnpm perf:check --measure-only       jen měření nad stávající databází (např. na serveru: DATABASE_URL, nic se nesype)
 *   --runs=20  --scale=0.5  --json
 *
 * Měří se serverová část (dotaz + oprávnění + sestavení odpovědi), ne síť a vykreslení. Cíl: seznam 50 řádků do 300 ms na
 * serveru, aby s režií sítě a vykreslení vyšel cíl 1 s. Při překročení rozpočtu skript skončí s kódem 1.
 */

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k!, v ?? "true"] as const;
  }),
);
const flag = (k: string) => args.has(k) && args.get(k) !== "false";
const RUNS = Number(args.get("runs") ?? 15);
const SCALE = Number(args.get("scale") ?? 1);
const DB_NAME = process.env.PERF_DB_NAME ?? "rebar_perf";
const HOST = process.env.PERF_DB_HOST ?? `localhost:${process.env.REBAR_PG_PORT ?? 5434}`;
const ADMIN_URL = process.env.PERF_ADMIN_URL ?? `postgres://postgres@${HOST}/postgres`;
const MIGRATE_URL =
  process.env.PERF_MIGRATE_URL ?? `postgres://rebar_migrator:migrator@${HOST}/${DB_NAME}`;
const measureOnly = flag("measure-only");
const APP_URL = measureOnly
  ? (process.env.DATABASE_URL ?? "")
  : (process.env.PERF_DATABASE_URL ?? `postgres://rebar_app:app@${HOST}/${DB_NAME}`);
if (!APP_URL) throw new Error("--measure-only vyžaduje DATABASE_URL.");
if (!measureOnly && DB_NAME === "rebar_dev") throw new Error("Do vývojové databáze nesypeme.");
if (!/^[a-z][a-z0-9_]{0,40}$/.test(DB_NAME))
  throw new Error("PERF_DB_NAME: jen malá písmena, číslice a podtržítka.");

const n = (base: number) => Math.max(10, Math.round(base * SCALE));

/* ---------------- příprava databáze ---------------- */

async function ensureDatabase() {
  const adminHandle = createDb(ADMIN_URL, { max: 1 });
  const admin = adminHandle.sql;
  try {
    if (flag("reset")) await admin.unsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
    const [exists] = await admin`select 1 from pg_database where datname = ${DB_NAME}`;
    if (!exists)
      await admin.unsafe(
        `CREATE DATABASE "${DB_NAME}" OWNER rebar_migrator TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'cs-CZ' LOCALE 'en_US.UTF-8'`,
      );
  } finally {
    await adminHandle.close();
  }
}

async function migrate(slug: string) {
  const root = path.resolve(import.meta.dirname, "..");
  const config = (
    (await import(pathToFileURL(path.join(root, "clients", slug, "config.ts")).href)) as {
      default: ClientConfig;
    }
  ).default;
  const modules = resolveModules(config.modules, ALL_MODULES);
  await runMigrations({
    url: MIGRATE_URL,
    appRole: "rebar_app",
    queues: [...coreJobs, ...collectServers(modules).jobs],
    folders: migrationSources(
      root,
      modules.map((m) => m.id),
    ),
  });
  return modules;
}

/** Hromadné naplnění (generate_series), jeden průchod. Pod uživatelem migrací, aby šlo obejít omezení aplikační role. */
async function seedBulk(modules: ReturnType<typeof resolveModules>, handle: DbHandle) {
  const db = handle.db;
  const catalog = new Set(collectPermissions(modules).map((p) => p.key));
  await runSeed(
    db,
    { roles: opsysSeed.roles },
    {
      config: { security: { require2faRoles: [], idleTimeoutMinutes: 480 } } as never,
      catalog,
      moduleSeeds: modules.flatMap((m) => (m.seed ? [m.seed] : [])),
    },
  );
  const [existing] = await handle.sql<{ n: number }[]>`select count(*)::int as n from job`;
  if ((existing?.n ?? 0) >= n(20_000)) return;

  const mHandle = createDb(MIGRATE_URL, { max: 1 });
  const m = mHandle.sql;
  const t0 = Date.now();
  const step = async (label: string, fn: () => Promise<unknown>) => {
    const s = Date.now();
    await fn();
    process.stdout.write(`  ${label} (${Date.now() - s} ms)\n`);
  };
  try {
    const [owner] =
      await m`select u.id from "user" u join role r on r.id = u.role_id where r.key = 'owner' limit 1`;
    if (!owner) {
      const [role] = await m`select id from role where key = 'owner'`;
      await m`insert into "user" (id, name, email, role_id) values (gen_random_uuid(), 'Majitel (měření)', 'owner@perf.test', ${role!.id})`;
    }
    const [partner] = await m`select id from role where key = 'partner'`;
    const [externista] = await m`select id from role where key = 'externista'`;
    await step(
      "uživatelé",
      () =>
        m`insert into "user" (id, name, email, role_id)
        select gen_random_uuid(), 'Pracovník ' || g, 'p' || g || '@perf.test', case when g % 5 = 0 then ${partner!.id}::uuid else ${externista!.id}::uuid end
        from generate_series(1, 50) g on conflict do nothing`,
    );
    await m`create temp table pu as select id, row_number() over (order by email) rn from "user" where email like 'p%@perf.test'`;

    await step(
      `firmy (${n(30_000)})`,
      () =>
        m`insert into company (id, name, ico, city, email)
        select gen_random_uuid(),
          'Firma ' || (array['Novák','Svoboda','Dvořák','Černý','Procházka','Šimůnek','Žák'])[1 + g % 7] || ' ' || g || ' s.r.o.',
          lpad((10000000 + g)::text, 8, '0'),
          (array['Plzeň','Praha','Brno','Ostrava','České Budějovice'])[1 + g % 5],
          'info' || g || '@firma.example'
        from generate_series(1, ${n(30_000)}) g on conflict do nothing`,
    );
    await m`create temp table pc as select id, row_number() over (order by id) rn from company`;
    const [{ cnt: companies }] = (await m`select count(*)::int as cnt from pc`) as unknown as [
      { cnt: number },
    ];

    await step(
      `osoby (${n(20_000)})`,
      () =>
        m`insert into person (id, name, company_id, position, email)
        select gen_random_uuid(), 'Jan ' || (array['Novák','Svoboda','Dvořák','Černý'])[1 + g % 4] || ' ' || g, pc.id, 'jednatel', 'osoba' || g || '@firma.example'
        from generate_series(1, ${n(20_000)}) g join pc on pc.rn = 1 + g % ${companies}`,
    );

    await m`create temp table ps as select s.id, (row_number() over (order by s.position))::int as rn
      from pipeline_stage s join pipeline p on p.id = s.pipeline_id where p.entity_type = 'job'`;
    const [{ cnt: stageCount }] = (await m`select count(*)::int as cnt from ps`) as unknown as [
      { cnt: number },
    ];
    await step(
      `zakázky (${n(20_000)})`,
      () =>
        m`insert into job (id, number, title, company_id, stage_id, phase, value_minor, address, start_date, end_date, manager_id)
        select gen_random_uuid(), 'Z-' || lpad(g::text, 6, '0'),
          (array['Nový web','Správa Meta reklam','Systém na míru','Automatizace Make','Redesign e-shopu','AI chatbot'])[1 + g % 6] || ' ' || g,
          pc.id, ps.id, (array['inquiry','offer','preparation','execution','execution','handover','warranty','closed'])[1 + g % 8],
          (50000 + g * 137) * 100,
          (array['Plzeň','Praha','Brno'])[1 + g % 3] || ', Hlavní ' || g, date '2026-01-01' + (g % 300), date '2026-06-01' + (g % 300), pu.id
        from generate_series(1, ${n(20_000)}) g
          join pc on pc.rn = 1 + (g * 7) % ${companies}
          join ps on ps.rn = 1 + g % ${stageCount}
          join pu on pu.rn = 1 + g % 50`,
    );
    await m`create temp table pj as select id, row_number() over (order by number) rn from job`;
    const jobs = n(20_000);

    await step(
      "členové týmu zakázek",
      () =>
        m`insert into job_member (job_id, user_id)
        select pj.id, pu.id from pj join pu on pu.rn in (1 + pj.rn % 50, 1 + (pj.rn + 17) % 50) on conflict do nothing`,
    );

    await step(
      `docházka (${n(100_000)})`,
      () =>
        m`insert into time_entry (id, user_id, date, kind, minutes, job_id, status, hourly_cost_minor)
        select gen_random_uuid(), pu.id, date '2026-01-01' + (g % 280), 'work', 240 + (g % 5) * 60, pj.id,
          (array['approved','approved','approved','submitted','draft'])[1 + g % 5], 35000
        from generate_series(1, ${n(100_000)}) g join pu on pu.rn = 1 + g % 50 join pj on pj.rn = 1 + (g * 3) % ${jobs}`,
    );

    await step("upozornění (20 000) a auditní stopa (100 000)", async () => {
      await m`insert into notification (id, user_id, kind, title, read_at)
        select gen_random_uuid(), o.id, 'system', 'Upozornění ' || g, case when g % 10 = 0 then null else now() end
        from generate_series(1, 20000) g, (select id from "user" u where u.email = 'owner@perf.test' or u.role_id = (select id from role where key = 'owner') limit 1) o`;
      await m`insert into audit_log (id, actor_kind, action, entity_type, entity_id, summary, changes)
        select gen_random_uuid(), 'system', 'update', 'job', pj.id::text, 'Změna ' || g, '[]'::jsonb
        from generate_series(1, 100000) g join pj on pj.rn = 1 + g % ${jobs}`;
    });

    await step("index pro hledání Cmd+K (zakázky, firmy, osoby)", async () => {
      await m`delete from search_document`;
      await m`insert into search_document (entity_type, entity_id, title, subtitle, search_text)
        select 'job', id, number || ' ' || title, address, lower(f_unaccent(number || ' ' || title || ' ' || number)) from job`;
      await m`insert into search_document (entity_type, entity_id, title, subtitle, search_text)
        select 'company', id, name, city, lower(f_unaccent(name || ' ' || coalesce(ico,'') || ' ' || coalesce(email,''))) from company`;
      await m`insert into search_document (entity_type, entity_id, title, subtitle, search_text)
        select 'person', id, name, position, lower(f_unaccent(name || ' ' || coalesce(email,''))) from person`;
    });

    await m`analyze`;
    process.stdout.write(`Data nasypána za ${((Date.now() - t0) / 1000).toFixed(1)} s.\n`);
  } finally {
    await mHandle.close();
  }
}

/* ---------------- měření ---------------- */

type Result = {
  name: string;
  budget: number;
  p50: number;
  p95: number;
  max: number;
  queries: number;
  ok: boolean;
};

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;

async function main() {
  const slug = process.env.CLIENT ?? "opsys";
  let modules = resolveModules(
    (
      (await import(
        pathToFileURL(
          path.join(path.resolve(import.meta.dirname, ".."), "clients", slug, "config.ts"),
        ).href
      )) as { default: ClientConfig }
    ).default.modules,
    ALL_MODULES,
  );
  if (!measureOnly) {
    process.stdout.write(`Příprava databáze ${DB_NAME} (škála ${SCALE})…\n`);
    await ensureDatabase();
    modules = await migrate(slug);
  }

  // připojení s počítadlem a zachytáváním dotazů (N+1, EXPLAIN)
  let queryCount = 0;
  let captured: { query: string; params: unknown[] }[] | null = null;
  const handle = createDb(APP_URL, {
    max: 4,
    logger: {
      logQuery(query, params) {
        queryCount++;
        captured?.push({ query, params });
      },
    },
  });
  const db = handle.db;
  const client = handle.sql;

  if (!measureOnly) await seedBulk(modules, handle);

  const collected = collectServers(modules);
  const registry = buildRegistry(collected.entities);
  const catalog = new Set(collectPermissions(modules).map((p) => p.key));
  const cipher = createCipher(
    parseKeyRing({ APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") }),
  );
  const deps = {
    registry,
    queue: { send: async () => null },
    storage: {} as never,
    settings: createSettings(cipher),
    cipher,
    baseURL: "http://localhost",
    emit: async () => {},
    calendarLayers: collected.calendarLayers,
  } as ModuleDeps;

  const [owner] = await client<
    { id: string }[]
  >`select u.id from "user" u join role r on r.id = u.role_id where r.key = 'owner' and u.active limit 1`;
  if (!owner) throw new Error("V databázi není žádný majitel.");
  const ownerCtx = createCtx(db, (await loadActor(db, owner.id, { catalog }))!);
  const [ex] = await client<
    { id: string }[]
  >`select u.id from "user" u join role r on r.id = u.role_id where r.key = 'externista' and u.active limit 1`;
  const externistaCtx: Ctx | null = ex
    ? createCtx(db, (await loadActor(db, ex.id, { catalog }))!)
    : null;

  const ent = async (key: string) => resolveEntity(db, registry.get(key)!);
  const job = await ent("job");
  const company = await ent("company");
  const person = await ent("person");
  const timeEntry = registry.get("time_entry") ? await ent("time_entry") : null;
  const stage = (await getPipeline(db, "job", "default"))?.stages[0];
  const cmd = (name: string, ctx: Ctx, input: unknown) => {
    const c = collected.commands.get(name);
    if (!c) throw new Error(`Chybí příkaz ${name}`);
    return c.handler(ctx, c.input.parse(input), deps);
  };
  const dashboard = async (ctx: Ctx) => {
    await Promise.all([
      ...collected.attention.map((a) => a(ctx, deps)),
      ...collected.widgets.map((w) => w(ctx, deps)),
    ]);
  };

  const L = 300; // seznam 50 řádků: server do 300 ms
  const D = 500; // detail s agregací
  type Case = { name: string; budget: number; maxQueries: number; fn: () => Promise<unknown> };
  const cases: Case[] = [
    {
      name: "zakázky: seznam 50 řádků + součty",
      budget: L,
      maxQueries: 6,
      fn: () => queryRecords(ownerCtx, registry, job, { limit: 50 }),
    },
    {
      name: "zakázky: filtr fáze + řazení podle hodnoty",
      budget: L,
      maxQueries: 6,
      fn: () =>
        queryRecords(ownerCtx, registry, job, {
          limit: 50,
          filters: {
            op: "and",
            conditions: [{ attr: "phase", op: "is", value: "execution" }],
          } as never,
          sort: [{ attr: "value", dir: "desc" }],
        }),
    },
    {
      name: "zakázky: hledání bez diakritiky („sprava meta reklam“)",
      budget: L,
      maxQueries: 6,
      fn: () => queryRecords(ownerCtx, registry, job, { limit: 50, q: "sprava meta reklam 1" }),
    },
    {
      name: "zakázky: seskupení podle stavu se součty",
      budget: L,
      maxQueries: 3,
      fn: () => queryGroups(ownerCtx, job, "stage", {}),
    },
    ...(externistaCtx
      ? [
          {
            name: "zakázky: seznam externisty (rozsah „jen moje“)",
            budget: L,
            maxQueries: 6,
            fn: () => queryRecords(externistaCtx, registry, job, { limit: 50 }),
          } as Case,
        ]
      : []),
    {
      name: "firmy: seznam 50 řádků",
      budget: L,
      maxQueries: 6,
      fn: () => queryRecords(ownerCtx, registry, company, { limit: 50 }),
    },
    {
      name: "firmy: hledání („novak“)",
      budget: L,
      maxQueries: 6,
      fn: () => queryRecords(ownerCtx, registry, company, { limit: 50, q: "novak" }),
    },
    {
      name: "osoby: seznam 50 řádků",
      budget: L,
      maxQueries: 6,
      fn: () => queryRecords(ownerCtx, registry, person, { limit: 50 }),
    },
    ...(timeEntry
      ? [
          {
            name: "docházka: seznam 50 řádků",
            budget: L,
            maxQueries: 6,
            fn: () => queryRecords(ownerCtx, registry, timeEntry, { limit: 50 }),
          } as Case,
        ]
      : []),
    {
      name: "přehled (pozornost + dlaždice), majitel",
      budget: 800,
      maxQueries: 60,
      fn: () => dashboard(ownerCtx),
    },
    ...(externistaCtx
      ? [
          {
            name: "přehled (pozornost + dlaždice), externista",
            budget: 800,
            maxQueries: 60,
            fn: () => dashboard(externistaCtx),
          } as Case,
        ]
      : []),
    {
      name: "nástěnka: zakázky podle stavu (agregace)",
      budget: L,
      maxQueries: 5,
      fn: () =>
        aggregateRecords(ownerCtx, registry, job, { fn: "count", groupBy: { attr: "stage" } }),
    },
    {
      name: "nástěnka: součet hodnot zakázek po měsících",
      budget: L,
      maxQueries: 6,
      fn: () =>
        aggregateRecords(ownerCtx, registry, job, {
          fn: "sum",
          attr: "value",
          groupBy: { attr: "startDate", bucket: "month" },
        }),
    },
    {
      name: "nástěnka: výchozí sada majitele (widgety souběžně, bez mezipaměti)",
      budget: 2500,
      maxQueries: 250,
      fn: async () => {
        const env: DashboardEnv = {
          registry,
          deps,
          metrics: new Map(collected.dashboardMetrics.map((m) => [m.key, m])),
          cacheTtlMs: 0,
        };
        const set = opsysDashboards().find((d) => d.role === "owner");
        await Promise.all(
          (set?.definition.widgets ?? []).map((w) =>
            evaluateWidget(ownerCtx, env, w, { period: "this_month" }),
          ),
        );
      },
    },
    {
      name: "export: všechny zakázky do CSV (po stránkách po 200)",
      budget: 15000,
      maxQueries: 1000,
      fn: async () => {
        const out = await prepareEntityExport(ownerCtx, registry, job, {
          format: "csv",
          maxRows: 50_000,
          audit: false,
          query: { sort: [{ attr: "number", dir: "asc" }] },
          columns: ["number", "title", "stage"],
        });
        for await (const _chunk of out.chunks) void _chunk;
      },
    },
    {
      name: "Cmd+K: hledání napříč entitami",
      budget: L,
      maxQueries: 12,
      fn: () => searchAll(ownerCtx, registry.all(), "novak"),
    },
    {
      name: "upozornění: nepřečtené a seznam",
      budget: 150,
      maxQueries: 4,
      fn: async () => {
        const { listNotifications, unreadCount } = await import("@rebar/core/collab");
        await Promise.all([unreadCount(ownerCtx), listNotifications(ownerCtx, { limit: 100 })]);
      },
    },
    ...(collected.commands.has("dochazka.report")
      ? [
          {
            name: "docházka: měsíční přehled všech lidí",
            budget: D,
            maxQueries: 8,
            fn: () => cmd("dochazka.report", ownerCtx, { month: "2026-06" }),
          } as Case,
        ]
      : []),
  ];
  void stage;

  const results: Result[] = [];
  const slow: { name: string; queries: { query: string; params: unknown[] }[] }[] = [];
  for (const c of cases) {
    for (let i = 0; i < 3; i++) await c.fn(); // zahřátí (plány, spojení)
    const times: number[] = [];
    let counted = 0;
    for (let i = 0; i < RUNS; i++) {
      queryCount = 0;
      const t = performance.now();
      await c.fn();
      times.push(performance.now() - t);
      counted = queryCount;
    }
    times.sort((a, b) => a - b);
    const r: Result = {
      name: c.name,
      budget: c.budget,
      p50: pct(times, 50),
      p95: pct(times, 95),
      max: times[times.length - 1]!,
      queries: counted,
      ok: pct(times, 95) <= c.budget && counted <= c.maxQueries,
    };
    results.push(r);
    if (flag("explain") || flag("queries")) {
      captured = [];
      await c.fn();
      slow.push({ name: c.name, queries: captured });
      if (flag("queries"))
        console.log(
          `\n[${c.name}] ${captured.length} dotazů:\n` +
            captured
              .map(
                (q, i) =>
                  `  ${String(i + 1).padStart(2)}. ${q.query.replace(/\s+/g, " ").slice(0, 110)}`,
              )
              .join("\n"),
        );
      captured = null;
    }
  }

  if (flag("json")) console.log(JSON.stringify(results, null, 2));
  else {
    const w = Math.max(...results.map((r) => r.name.length));
    console.log(
      `\n${"měření".padEnd(w)}  ${"p50".padStart(7)} ${"p95".padStart(7)} ${"max".padStart(7)}  ${"rozpočet".padStart(8)}  dotazů`,
    );
    for (const r of results)
      console.log(
        `${r.name.padEnd(w)}  ${r.p50.toFixed(1).padStart(7)} ${r.p95.toFixed(1).padStart(7)} ${r.max.toFixed(1).padStart(7)}  ${String(r.budget).padStart(8)}  ${String(r.queries).padStart(5)}  ${r.ok ? "OK" : "PŘEKROČENO"}`,
      );
  }

  if (flag("explain")) await explain(handle.sql, slow);

  await handle.close();
  const bad = results.filter((r) => !r.ok);
  if (bad.length) {
    console.error(`\nNesplněno (${bad.length}): ${bad.map((b) => b.name).join("; ")}`);
    process.exit(1);
  }
  console.log("\nVšechny rozpočty splněny.");
}

type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Actual Total Time"?: number;
  "Plan Rows"?: number;
  "Actual Rows"?: number;
  Plans?: PlanNode[];
};

function seqScans(node: PlanNode, out: string[] = []): string[] {
  if (
    node["Node Type"] === "Seq Scan" &&
    (node["Actual Rows"] ?? 0) + (node["Plan Rows"] ?? 0) > 2000
  )
    out.push(`Seq Scan na ${node["Relation Name"]} (~${node["Actual Rows"]} řádků)`);
  for (const p of node.Plans ?? []) seqScans(p, out);
  return out;
}

/** EXPLAIN ANALYZE zachycených dotazů; vypíše ty nad 5 ms a sekvenční čtení velkých tabulek. */
async function explain(
  client: DbHandle["sql"],
  groups: { name: string; queries: { query: string; params: unknown[] }[] }[],
) {
  console.log("\nEXPLAIN ANALYZE (dotazy nad 5 ms):");
  const seen = new Set<string>();
  for (const g of groups) {
    for (const q of g.queries) {
      if (!/^\s*(select|with)/i.test(q.query) || seen.has(q.query)) continue;
      seen.add(q.query);
      try {
        const rows = await client
          .begin(async (tx) => {
            const r = await tx.unsafe(
              `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.query}`,
              q.params as never[],
            );
            await tx`rollback`.catch(() => {});
            return r;
          })
          .catch(() => null);
        const plan = (
          rows as unknown as
            { "QUERY PLAN": { Plan: PlanNode; "Execution Time": number }[] }[] | null
        )?.[0]?.["QUERY PLAN"][0];
        if (!plan) continue;
        const t = plan["Execution Time"];
        const scans = seqScans(plan.Plan);
        if (t > 5 || scans.length)
          console.log(
            `  [${g.name}] ${t.toFixed(1)} ms${scans.length ? " — " + scans.join(", ") : ""}\n    ${q.query.replace(/\s+/g, " ").slice(0, 160)}…`,
          );
      } catch {
        /* dotaz se nepodařilo zopakovat (parametry); přeskočit */
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
