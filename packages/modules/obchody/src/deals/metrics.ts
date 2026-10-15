import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { ClientTabProvider, EmailVarsProvider } from "@rebar/core/contracts";
import { scopedEntity } from "@rebar/core/dashboards";
import { privateScope } from "@rebar/core/entities";
import {
  defineDashboardMetric,
  type DashboardMetricInput,
  type ModuleDeps,
  type PrivatePathDef,
  type WidgetProvider,
} from "@rebar/core/module-server";
import { scopeOf, type Ctx } from "@rebar/core/rbac";
import { deal } from "../schema";
import { dealPipeline } from "./common";

/*
  Čtení obchodů mimo registr entit: metriky nástěnek (Pipeline v Kč, vážený součet, Moje otevřené obchody, obchody bez
  další aktivity), widgety, příspěvky pro kartu klienta a proměnné e-mailů. Každé respektuje rozsah „jen moje“
  a soukromé záznamy (D §5.4); všechna mají záznam v `privatePaths`.
*/

const num = (v: unknown) => Number(v ?? 0);

/** Obchody, které aktér smí číst, pro čtení bez registru: nesmazané, rozsah „jen moje“, soukromé jen s `private.read`. */
function readableWhere(ctx: Ctx): SQL | null {
  const scope = scopeOf(ctx, "obchody.read");
  if (!scope) return null;
  return and(
    isNull(deal.deletedAt),
    privateScope(ctx, deal),
    scope === "own" ? eq(deal.ownerId, ctx.actor.userId ?? "") : undefined,
  )!;
}

async function openWhere(
  ctx: Ctx,
  deps: ModuleDeps,
  input: Pick<DashboardMetricInput, "userId"> | null,
): Promise<SQL> {
  const scope = await scopedEntity(ctx, deps, "deal");
  return and(
    scope.where,
    eq(deal.result, "open"),
    input?.userId ? eq(deal.ownerId, input.userId) : undefined,
  )!;
}

const PERM = ["obchody.read"] as const;

/** Pojmenované metriky nástěnek (`obchody.*`). Počítají jen otevřené obchody v rozsahu aktéra. */
export const dealMetrics = [
  defineDashboardMetric({
    key: "obchody.pipeline_value",
    label: "Pipeline v Kč podle fází",
    description:
      "Součet hodnot a vážený součet (hodnota × pravděpodobnost fáze) otevřených obchodů po fázích.",
    format: "money",
    shape: "series",
    permissions: PERM,
    supports: { person: true },
    compute: async (ctx, input, deps) => {
      const where = await openWhere(ctx, deps, input);
      const pl = await dealPipeline(ctx.db);
      const rows = await ctx.db
        .select({
          stageId: deal.stageId,
          v: sql<number>`coalesce(sum(${deal.valueMinor}), 0)::float8`,
          w: sql<number>`coalesce(sum(${deal.weightedMinor}), 0)::float8`,
        })
        .from(deal)
        .where(where)
        .groupBy(deal.stageId);
      const by = new Map(rows.map((r) => [r.stageId, r] as const));
      const stages = [...pl.stages].sort((a, b) => a.position - b.position);
      return {
        kind: "series",
        categories: stages.map((s) => ({ key: s.id, label: s.name, color: s.color })),
        series: [
          { key: "value", label: "Hodnota", values: stages.map((s) => num(by.get(s.id)?.v)) },
          {
            key: "weighted",
            label: "Vážená hodnota",
            values: stages.map((s) => num(by.get(s.id)?.w)),
          },
        ],
      };
    },
  }),
  defineDashboardMetric({
    key: "obchody.pipeline_total",
    label: "Hodnota otevřených obchodů",
    format: "money",
    shape: "scalar",
    permissions: PERM,
    supports: { person: true },
    compute: async (ctx, input, deps) => {
      const [r] = await ctx.db
        .select({ v: sql<number>`coalesce(sum(${deal.valueMinor}), 0)::float8` })
        .from(deal)
        .where(await openWhere(ctx, deps, input));
      return { kind: "scalar", value: num(r?.v) };
    },
  }),
  defineDashboardMetric({
    key: "obchody.pipeline_weighted",
    label: "Vážená hodnota otevřených obchodů",
    format: "money",
    shape: "scalar",
    permissions: PERM,
    supports: { person: true },
    compute: async (ctx, input, deps) => {
      const [r] = await ctx.db
        .select({ v: sql<number>`coalesce(sum(${deal.weightedMinor}), 0)::float8` })
        .from(deal)
        .where(await openWhere(ctx, deps, input));
      return { kind: "scalar", value: num(r?.v) };
    },
  }),
  defineDashboardMetric({
    key: "obchody.my_open",
    label: "Moje otevřené obchody",
    description: "Počet otevřených obchodů, jejichž vlastníkem je přihlášený uživatel.",
    format: "number",
    shape: "scalar",
    permissions: PERM,
    compute: async (ctx, _input, deps) => {
      const [r] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(deal)
        .where(await openWhere(ctx, deps, { userId: ctx.actor.userId }));
      return { kind: "scalar", value: num(r?.n) };
    },
  }),
  defineDashboardMetric({
    key: "obchody.no_activity",
    label: "Obchody bez další aktivity",
    description:
      "Počet otevřených obchodů bez naplánované další aktivity (každý má mít další krok).",
    format: "number",
    shape: "scalar",
    permissions: PERM,
    supports: { person: true },
    compute: async (ctx, input, deps) => {
      const [r] = await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(deal)
        .where(and(await openWhere(ctx, deps, input), isNull(deal.nextActivityAt)));
      return { kind: "scalar", value: num(r?.n) };
    },
  }),
];

const czk = (minor: number) =>
  `${new Intl.NumberFormat("cs-CZ").format(Math.round(minor / 100))} Kč`;

/** Dlaždice přehledu: Pipeline v Kč a Moje otevřené obchody (bez další aktivity nahoře v seznamu obchodů). */
export const dealWidgets: WidgetProvider = async (ctx, deps) => {
  if (!scopeOf(ctx, "obchody.read")) return [];
  const all = await openWhere(ctx, deps, null);
  const [sum] = await ctx.db
    .select({
      n: sql<number>`count(*)::int`,
      v: sql<number>`coalesce(sum(${deal.valueMinor}), 0)::float8`,
      w: sql<number>`coalesce(sum(${deal.weightedMinor}), 0)::float8`,
    })
    .from(deal)
    .where(all);
  const mine = await openWhere(ctx, deps, { userId: ctx.actor.userId });
  const [m] = await ctx.db
    .select({
      n: sql<number>`count(*)::int`,
      none: sql<number>`count(*) filter (where ${deal.nextActivityAt} is null)::int`,
    })
    .from(deal)
    .where(mine);
  return [
    {
      id: "obchody.pipeline",
      module: "obchody",
      title: "Pipeline",
      value: czk(num(sum?.v)),
      hint: `vážená ${czk(num(sum?.w))} · ${num(sum?.n)} obchodů`,
      href: "/obchody",
      order: 20,
    },
    {
      id: "obchody.my_open",
      module: "obchody",
      title: "Moje otevřené obchody",
      value: String(num(m?.n)),
      hint: num(m?.none) ? `${num(m?.none)} bez další aktivity` : "všechny mají další aktivitu",
      href: "/obchody",
      tone: num(m?.none) ? "warning" : "default",
      order: 21,
    },
  ];
};

/** Příspěvek ke kartě klienta: záložka Obchody (počet) a souhrn otevřených obchodů. */
export const dealClientCard: ClientTabProvider = {
  tabCounts: async (ctx, companyId) => {
    const where = readableWhere(ctx);
    if (!where) return {};
    const [r] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(deal)
      .where(and(where, eq(deal.companyId, companyId)));
    return { obchody: num(r?.n) };
  },
  summary: async (ctx, companyId) => {
    const where = readableWhere(ctx);
    if (!where) return {};
    const [r] = await ctx.db
      .select({
        n: sql<number>`count(*)::int`,
        v: sql<number>`coalesce(sum(${deal.valueMinor}), 0)::float8`,
      })
      .from(deal)
      .where(and(where, eq(deal.companyId, companyId), eq(deal.result, "open")));
    return { deals: { open: num(r?.n), openValueMinor: num(r?.v) } };
  },
};

/** Proměnné e-mailových šablon pro obchod: `{obchod}` je název obchodu. */
export const dealEmailVars: EmailVarsProvider = {
  entityType: "deal",
  vars: [{ key: "obchod", label: "Název obchodu" }],
  resolve: async (ctx, id): Promise<Record<string, string>> => {
    const where = readableWhere(ctx);
    if (!where) return {};
    const [r] = await ctx.db
      .select({ title: deal.title })
      .from(deal)
      .where(and(where, eq(deal.id, id)));
    return r ? { obchod: r.title } : {};
  },
};

/** Ruční čtecí cesty pro canary test soukromí (D §5.4). */
export const dealPrivatePaths: readonly PrivatePathDef[] = [
  {
    name: "obchody.dashboardMetrics",
    run: async (ctx, deps) => {
      const input: DashboardMetricInput = {
        from: null,
        to: null,
        jobId: null,
        userId: null,
        bucket: null,
        limit: 50,
        params: {},
        today: new Date().toISOString().slice(0, 10),
      };
      return Promise.all(dealMetrics.map((m) => m.compute(ctx, input, deps)));
    },
  },
  { name: "obchody.widgets", run: (ctx, deps) => dealWidgets(ctx, deps) },
  {
    name: "obchody.clientCard",
    run: async (ctx) => {
      const rows = await ctx.db
        .selectDistinct({ id: deal.companyId })
        .from(deal)
        .where(isNull(deal.deletedAt));
      const ids = rows.map((r) => r.id).filter((x): x is string => !!x);
      return Promise.all(
        ids.map(async (id) => [
          await dealClientCard.tabCounts?.(ctx, id),
          await dealClientCard.summary?.(ctx, id),
        ]),
      );
    },
  },
  {
    name: "obchody.emailVars",
    run: async (ctx) => {
      const rows = await ctx.db.select({ id: deal.id }).from(deal).where(isNull(deal.deletedAt));
      return Promise.all(rows.map((r) => dealEmailVars.resolve(ctx, r.id)));
    },
  },
];
