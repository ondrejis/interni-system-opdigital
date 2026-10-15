import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { choiceParam, clampLimit, entityHref } from "@rebar/core/dashboards";
import {
  defineDashboardMetric,
  type DashboardMetricInput,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { type Ctx } from "@rebar/core/rbac";
import { addDaysIso, weekStartIso } from "@rebar/core/time";
import { me, readScope, visibleEntries } from "./access";
import { jobRefs } from "./data/lookups";
import { timeEntry } from "./schema";

const num = (v: unknown) => Number(v ?? 0);

/**
 * Záznamy hodin, které smí aktér vidět (rozsah „jen moje“, zámek soukromých), zúžené obdobím, zakázkou a osobou z filtrů
 * nástěnky. `empty` = filtr míří na cizí hodiny, které aktér nesmí vidět (výsledek je prázdný).
 */
function filtered(
  ctx: Ctx,
  input: DashboardMetricInput,
  range: { from: string | null; to: string | null },
): { where: SQL; empty: boolean } {
  const own = readScope(ctx) === "own";
  const empty = own && !!input.userId && input.userId !== me(ctx);
  return {
    empty,
    where: visibleEntries(
      ctx,
      range.from ? gte(timeEntry.date, range.from) : undefined,
      range.to ? lte(timeEntry.date, range.to) : undefined,
      input.jobId ? eq(timeEntry.jobId, input.jobId) : undefined,
      input.userId ? eq(timeEntry.userId, input.userId) : undefined,
    ),
  };
}

/** Pojmenované metriky nástěnek modulu Hodiny (widget „Hodiny tento týden“, hodiny podle zakázky nebo osoby). */
export const hodinyMetrics = [
  defineDashboardMetric({
    key: "hodiny.week",
    label: "Hodiny tento týden",
    description:
      "Odpracovaný čas v období (bez zvoleného období tento týden od pondělí). Při rozsahu „jen moje“ jen vaše hodiny; hodiny soukromých zakázek vidí jen vlastník.",
    format: "minutes",
    shape: "scalar",
    permissions: ["hodiny.read"],
    supports: { period: true, job: true, person: true },
    compute: async (ctx, input) => {
      const from = input.from ?? weekStartIso(input.today);
      const to = input.to ?? addDaysIso(weekStartIso(input.today), 6);
      const f = filtered(ctx, input, { from, to });
      if (f.empty) return { kind: "scalar", value: 0 };
      const [r] = await ctx.db
        .select({ m: sql<number>`coalesce(sum(${timeEntry.minutes}), 0)::float8` })
        .from(timeEntry)
        .where(f.where);
      return { kind: "scalar", value: num(r?.m) };
    },
  }),
  defineDashboardMetric({
    key: "hodiny.by_job",
    label: "Hodiny podle zakázky nebo osoby",
    description:
      "Odpracovaný čas v období rozdělený podle zakázky, nebo podle osoby. Bez zvoleného období za celou dobu. Bez peněz.",
    format: "minutes",
    shape: "series",
    permissions: ["hodiny.read"],
    supports: { period: true, job: true, person: true },
    params: [
      {
        key: "by",
        label: "Rozdělit podle",
        type: "select",
        choices: [
          { value: "job", label: "Zakázky" },
          { value: "person", label: "Osoby" },
        ],
        default: "job",
      },
    ],
    compute: async (ctx, input, deps) => {
      const by = choiceParam(input.params, "by", ["job", "person"] as const, "job");
      const series = (values: number[]) => [{ key: "minutes", label: "Odpracováno", values }];
      const f = filtered(ctx, input, { from: input.from, to: input.to });
      if (f.empty) return { kind: "series", categories: [], series: series([]) };
      const limit = clampLimit(input.limit);
      const minutes = sql<number>`coalesce(sum(${timeEntry.minutes}), 0)::float8`;
      if (by === "person") {
        const rows = await ctx.db
          .select({ id: timeEntry.userId, name: schema.user.name, m: minutes })
          .from(timeEntry)
          .innerJoin(schema.user, eq(schema.user.id, timeEntry.userId))
          .where(f.where)
          .groupBy(timeEntry.userId, schema.user.name)
          .orderBy(desc(minutes), schema.user.name)
          .limit(limit);
        return {
          kind: "series",
          categories: rows.map((r) => ({ key: r.id, label: r.name })),
          series: series(rows.map((r) => num(r.m))),
        };
      }
      return byJob(ctx, deps, f.where, limit, series);
    },
  }),
];

async function byJob(
  ctx: Ctx,
  deps: ModuleDeps,
  where: SQL,
  limit: number,
  series: (values: number[]) => { key: string; label: string; values: number[] }[],
) {
  const minutes = sql<number>`coalesce(sum(${timeEntry.minutes}), 0)::float8`;
  const rows = await ctx.db
    .select({ id: timeEntry.jobId, m: minutes })
    .from(timeEntry)
    .where(and(where))
    .groupBy(timeEntry.jobId)
    .orderBy(desc(minutes))
    .limit(limit);
  const refs = await jobRefs(
    ctx,
    deps,
    rows.map((r) => r.id),
  );
  return {
    kind: "series" as const,
    categories: rows.map((r) => {
      const href = refs.has(r.id) ? entityHref(ctx, deps, "job", r.id) : undefined;
      return {
        key: r.id,
        label: refs.get(r.id)?.title ?? "Jiná zakázka",
        ...(href ? { href } : {}),
      };
    }),
    series: series(rows.map((r) => num(r.m))),
  };
}
