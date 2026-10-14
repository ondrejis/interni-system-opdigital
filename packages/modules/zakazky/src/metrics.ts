import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  scopedEntity,
  clampLimit,
  choiceParam,
  pct1,
  type ScopedEntity,
} from "@rebar/core/dashboards";
import {
  defineDashboardMetric,
  type DashboardMetricInput,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { PermissionError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { job } from "./schema";

const ECONOMICS = "zakazky.economics";

/** Fáze, ve kterých zakázka už vydělává nebo je vyúčtovaná: příprava a dřív se do ekonomiky nepočítají. */
export const ECONOMY_PHASES = ["execution", "handover", "warranty", "closed"];

/** Jedna zakázka v ekonomice: smluvní cena, náklady a fakturace v haléřích. */
export type JobEconomy = { contractMinor: number; costMinor: number; invoicedMinor: number };

/** Marže zakázky v haléřích: smluvní cena − náklady. */
export const marginOf = (e: JobEconomy): number => e.contractMinor - e.costMinor;

/** Nevyfakturováno: smluvní cena − fakturováno, nikdy záporné (přefakturování se neodečítá od ostatních zakázek). */
export const unbilledOf = (e: JobEconomy): number => Math.max(0, e.contractMinor - e.invoicedMinor);

/** Vážená marže v % (součet marží / součet smluvních cen), ne průměr procent jednotlivých zakázek. */
export function weightedMarginPct(rows: readonly JobEconomy[]): number | null {
  const contract = rows.reduce((a, r) => a + r.contractMinor, 0);
  const margin = rows.reduce((a, r) => a + marginOf(r), 0);
  return pct1(margin, contract);
}

/**
 * Zakázky v rozsahu aktéra (vedoucí a členové týmu při „jen moje“) ve fázích ekonomiky. Ekonomické sloupce smí číst
 * jen ten, kdo má `zakazky.economics`: atribut, který aktér nevidí, v entitě neexistuje, takže se nedá sečíst ani
 * obejitím definice widgetu.
 */
async function economyScope(
  ctx: Ctx,
  deps: ModuleDeps,
  input: DashboardMetricInput,
): Promise<{ scope: ScopedEntity; where: SQL }> {
  const scope = await scopedEntity(ctx, deps, "job");
  for (const k of ["sumContract", "sumCost", "sumInvoiced"])
    if (!scope.entity.byKey.has(k))
      throw new PermissionError("Na ekonomiku zakázek nemáte oprávnění.");
  const where = and(
    scope.where,
    inArray(job.phase, ECONOMY_PHASES),
    input.jobId ? eq(job.id, input.jobId) : undefined,
  )!;
  return { scope, where };
}

const num = (v: unknown) => Number(v ?? 0);
const marginSql = sql`(${job.sumContractMinor} - ${job.sumCostMinor})`;
const unbilledSql = sql`greatest(0, ${job.sumContractMinor} - ${job.sumInvoicedMinor})`;

const SORTS = ["highest", "lowest"] as const;

/** Série po zakázkách seřazená podle výrazu; popisek je číslo a název, odkaz vede na detail zakázky. */
async function byJob(
  ctx: Ctx,
  deps: ModuleDeps,
  input: DashboardMetricInput,
  expr: SQL,
  seriesKey: string,
  seriesLabel: string,
  opts: { dir: "asc" | "desc"; onlyPositive?: boolean },
) {
  const { scope, where } = await economyScope(ctx, deps, input);
  const rows = await ctx.db
    .select({ id: job.id, number: job.number, title: job.title, v: sql<number>`(${expr})::float8` })
    .from(job)
    .where(opts.onlyPositive ? and(where, sql`${expr} > 0`) : where)
    .orderBy(opts.dir === "desc" ? desc(expr) : asc(expr), asc(job.number))
    .limit(clampLimit(input.limit));
  return {
    kind: "series" as const,
    categories: rows.map((r) => ({
      key: r.id,
      label: `${r.number} ${r.title}`,
      href: scope.href(r.id),
    })),
    series: [{ key: seriesKey, label: seriesLabel, values: rows.map((r) => num(r.v)) }],
  };
}

/** Součty ekonomiky zakázek v rozsahu aktéra. */
async function totals(ctx: Ctx, deps: ModuleDeps, input: DashboardMetricInput) {
  const { where } = await economyScope(ctx, deps, input);
  const [r] = await ctx.db
    .select({
      contract: sql<number>`coalesce(sum(${job.sumContractMinor}), 0)::float8`,
      cost: sql<number>`coalesce(sum(${job.sumCostMinor}), 0)::float8`,
      unbilled: sql<number>`coalesce(sum(${unbilledSql}), 0)::float8`,
    })
    .from(job)
    .where(where);
  return { contract: num(r?.contract), cost: num(r?.cost), unbilled: num(r?.unbilled) };
}

/** Pojmenované metriky nástěnek modulu Zakázky. Všechny vyžadují ekonomiku zakázek a čtou jen zakázky v rozsahu aktéra. */
export const dashboardMetrics = [
  defineDashboardMetric({
    key: "zakazky.margin",
    label: "Marže zakázek",
    description:
      "Marže v Kč po zakázkách (smluvní cena − náklady) u zakázek v realizaci, předání, záruce a uzavřených. Řazení od nejvyšší nebo nejnižší marže.",
    format: "money",
    shape: "series",
    permissions: ["zakazky.read", ECONOMICS],
    supports: { job: true },
    params: [
      {
        key: "sort",
        label: "Řazení",
        type: "select",
        choices: [
          { value: "highest", label: "Nejvyšší marže" },
          { value: "lowest", label: "Nejnižší marže" },
        ],
        default: "highest",
      },
    ],
    compute: (ctx, input, deps) =>
      byJob(ctx, deps, input, marginSql, "margin", "Marže", {
        dir: choiceParam(input.params, "sort", SORTS, "highest") === "lowest" ? "asc" : "desc",
      }),
  }),
  defineDashboardMetric({
    key: "zakazky.margin_total",
    label: "Marže zakázek celkem",
    description:
      "Součet marží (smluvní cena − náklady) zakázek v realizaci, předání, záruce a uzavřených v Kč.",
    format: "money",
    shape: "scalar",
    permissions: ["zakazky.read", ECONOMICS],
    supports: { job: true },
    compute: async (ctx, input, deps) => {
      const t = await totals(ctx, deps, input);
      return { kind: "scalar", value: t.contract - t.cost };
    },
  }),
  defineDashboardMetric({
    key: "zakazky.margin_pct",
    label: "Marže zakázek (%)",
    description:
      "Vážená marže v procentech: součet marží děleno součtem smluvních cen zakázek v realizaci, předání, záruce a uzavřených.",
    format: "percent",
    shape: "scalar",
    permissions: ["zakazky.read", ECONOMICS],
    supports: { job: true },
    compute: async (ctx, input, deps) => {
      const t = await totals(ctx, deps, input);
      return { kind: "scalar", value: pct1(t.contract - t.cost, t.contract) };
    },
  }),
  defineDashboardMetric({
    key: "zakazky.unbilled",
    label: "Nevyfakturováno",
    description:
      "Součet toho, co ještě nebylo vyfakturováno (smluvní cena − fakturováno, nejméně nula za zakázku) u zakázek v realizaci a dál. Bez DPH.",
    format: "money",
    shape: "scalar",
    permissions: ["zakazky.read", ECONOMICS],
    supports: { job: true },
    compute: async (ctx, input, deps) => ({
      kind: "scalar",
      value: (await totals(ctx, deps, input)).unbilled,
    }),
  }),
  defineDashboardMetric({
    key: "zakazky.unbilled_by_job",
    label: "Nevyfakturováno po zakázkách",
    description:
      "Zakázky v realizaci a dál s největší nevyfakturovanou částkou (smluvní cena − fakturováno, bez DPH).",
    format: "money",
    shape: "series",
    permissions: ["zakazky.read", ECONOMICS],
    supports: { job: true },
    compute: (ctx, input, deps) =>
      byJob(ctx, deps, input, unbilledSql, "unbilled", "Nevyfakturováno", {
        dir: "desc",
        onlyPositive: true,
      }),
  }),
];
