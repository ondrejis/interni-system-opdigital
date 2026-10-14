import { and, desc, eq, gte, inArray, lte, notInArray, sql, type SQL } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { visibleRecordTitles } from "@rebar/core/entities";
import {
  bucketLabel,
  bucketsBetween,
  bucketTruncSql,
  choiceParam,
  clampLimit,
  defaultBucket,
  tryScopedEntity,
  type ScopedEntity,
} from "@rebar/core/dashboards";
import {
  defineDashboardMetric,
  type DashboardMetricInput,
  type ModuleDeps,
} from "@rebar/core/module-server";
import { PermissionError, scopeOf } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { monthRange } from "@rebar/core/time";
import { periodFundMinutes, utilizationPct } from "./metrics-calc";
import { TIME_KINDS } from "./rules";
import { dochazkaSetting } from "./settings";
import { timeEntry } from "./schema";

const ABSENCES = TIME_KINDS.filter((k) => k.absence).map((k) => k.value);
const num = (v: unknown) => Number(v ?? 0);

/** Rozsah, ve kterém aktér vidí docházku jiných: stejné pravidlo jako příkazy modulu (`readScope`). */
function readScope(ctx: Ctx): "all" | "own" | null {
  const s = ["dochazka.read", "dochazka.approve"].map((k) => scopeOf(ctx, k));
  return s.includes("all") ? "all" : s.includes("own") ? "own" : null;
}

type Visible = {
  /** Podmínky nad `time_entry`: nesmazané, období, filtry nástěnky a tým aktéra. */
  conds: SQL[];
  /** Lidé v rozsahu aktéra při „jen moje“ (on sám a lidé na jeho zakázkách); `null` = všichni. */
  team: string[] | null;
  /** Filtr z nástěnky míří mimo rozsah aktéra: výsledek je prázdný. */
  empty: boolean;
  /** Zakázky v rozsahu aktéra (pro popisky a odkazy), pokud je smí číst. */
  jobs: ScopedEntity | null;
};

/**
 * Záznamy docházky, které smí aktér vidět. Při rozsahu „jen moje“ (mistr) je to on sám a lidé, kteří zapisovali na
 * zakázky v jeho rozsahu, stejně jako v příkazech modulu; cizí tým a cizí zakázka do součtů nevstoupí.
 */
async function visibility(
  ctx: Ctx,
  deps: ModuleDeps,
  input: DashboardMetricInput,
  opts: { approvedOnly?: boolean; withJob?: boolean } = {},
): Promise<Visible> {
  const scope = readScope(ctx);
  if (!scope) throw new PermissionError("Na docházku nemáte oprávnění.");
  const jobs = await tryScopedEntity(ctx, deps, "job");
  const conds: SQL[] = [sql`${timeEntry.deletedAt} is null`];
  let team: string[] | null = null;
  let empty = false;
  if (scope === "own") {
    const me = ctx.actor.userId;
    if (!me) return { conds, team: [], empty: true, jobs };
    const set = new Set<string>([me]);
    if (jobs) {
      const rows = await ctx.db
        .selectDistinct({ userId: timeEntry.userId })
        .from(timeEntry)
        .where(
          and(
            sql`${timeEntry.jobId} in (${jobs.idsSubquery})`,
            sql`${timeEntry.deletedAt} is null`,
          ),
        )
        .limit(5000);
      for (const r of rows) set.add(r.userId);
    }
    team = [...set];
    conds.push(inArray(timeEntry.userId, team));
    if (input.userId && !set.has(input.userId)) empty = true;
    if (input.jobId && !jobs) empty = true;
    if (input.jobId && jobs) conds.push(sql`${timeEntry.jobId} in (${jobs.idsSubquery})`);
  }
  if (input.userId) conds.push(eq(timeEntry.userId, input.userId));
  if (input.jobId) conds.push(eq(timeEntry.jobId, input.jobId));
  if (input.from) conds.push(gte(timeEntry.date, input.from));
  if (input.to) conds.push(lte(timeEntry.date, input.to));
  if (opts.approvedOnly) conds.push(eq(timeEntry.status, "approved"));
  return { conds, team, empty, jobs };
}

const approvedOnly = (input: DashboardMetricInput) => input.params.approvedOnly === true;
const workedOnly = notInArray(timeEntry.kind, ABSENCES);
const APPROVED_PARAM = {
  key: "approvedOnly",
  label: "Jen schválené záznamy",
  type: "boolean" as const,
  default: false,
};
const BY = ["person", "job", "day"] as const;

/** Pojmenované metriky nástěnek modulu Docházka. Čtou jen docházku v rozsahu aktéra (vedení všechny, mistr svůj tým). */
export const dashboardMetrics = [
  defineDashboardMetric({
    key: "dochazka.hours",
    label: "Odpracované hodiny",
    description:
      "Odpracovaná doba v období (práce, cesty, dílna, administrativa; bez dovolené a nemoci). Lze zúžit na zakázku nebo osobu.",
    format: "minutes",
    shape: "scalar",
    permissions: ["dochazka.read"],
    supports: { period: true, job: true, person: true },
    params: [APPROVED_PARAM],
    compute: async (ctx, input, deps) => {
      const v = await visibility(ctx, deps, input, { approvedOnly: approvedOnly(input) });
      if (v.empty) return { kind: "scalar", value: 0 };
      const [r] = await ctx.db
        .select({ m: sql<number>`coalesce(sum(${timeEntry.minutes}), 0)::float8` })
        .from(timeEntry)
        .where(and(...v.conds, workedOnly));
      return { kind: "scalar", value: num(r?.m) };
    },
  }),
  defineDashboardMetric({
    key: "dochazka.hours_by",
    label: "Odpracované hodiny podle…",
    description:
      "Odpracovaná doba rozdělená podle osoby, zakázky nebo času (den, týden, měsíc). Zakázky mimo váš rozsah jsou sloučené do „Jiné zakázky“. Bez peněz.",
    format: "minutes",
    shape: "series",
    permissions: ["dochazka.read"],
    supports: { period: true, job: true, person: true, bucket: true },
    params: [
      {
        key: "by",
        label: "Rozdělit podle",
        type: "select",
        choices: [
          { value: "person", label: "Osoby" },
          { value: "job", label: "Zakázky" },
          { value: "day", label: "Času" },
        ],
        default: "person",
      },
      APPROVED_PARAM,
    ],
    compute: async (ctx, input, deps) => {
      const by = choiceParam(input.params, "by", BY, "person");
      const v = await visibility(ctx, deps, input, { approvedOnly: approvedOnly(input) });
      const series = (values: number[]) => [{ key: "minutes", label: "Odpracováno", values }];
      if (v.empty) return { kind: "series", categories: [], series: series([]) };
      const minutes = sql<number>`coalesce(sum(${timeEntry.minutes}), 0)::float8`;
      const where = and(...v.conds, workedOnly);
      const limit = clampLimit(input.limit);

      if (by === "person") {
        const rows = await ctx.db
          .select({ id: timeEntry.userId, name: schema.user.name, m: minutes })
          .from(timeEntry)
          .innerJoin(schema.user, eq(schema.user.id, timeEntry.userId))
          .where(where)
          .groupBy(timeEntry.userId, schema.user.name)
          .orderBy(desc(minutes), schema.user.name)
          .limit(limit);
        return {
          kind: "series",
          categories: rows.map((r) => ({ key: r.id, label: r.name })),
          series: series(rows.map((r) => num(r.m))),
        };
      }

      if (by === "day") {
        const bucket =
          input.bucket ??
          defaultBucket(input.from && input.to ? { from: input.from, to: input.to } : null);
        const key = bucketTruncSql(timeEntry.date, bucket);
        const rows = await ctx.db
          .select({ k: sql<string>`${key}`, m: minutes })
          .from(timeEntry)
          .where(where)
          .groupBy(key)
          .orderBy(desc(key))
          .limit(60);
        const have = new Map(rows.map((r) => [r.k, num(r.m)]));
        const keys =
          input.from && input.to
            ? bucketsBetween({ from: input.from, to: input.to }, bucket, 60)
            : rows.map((r) => r.k).sort();
        return {
          kind: "series",
          categories: keys.map((k) => ({ key: k, label: bucketLabel(k, bucket) })),
          series: series(keys.map((k) => have.get(k) ?? 0)),
        };
      }

      // podle zakázky: zakázky mimo rozsah aktéra se sloučí, záznamy bez zakázky mají vlastní skupinu
      const key = v.jobs
        ? sql`case when ${timeEntry.jobId} is null then 'none' when ${timeEntry.jobId} in (${v.jobs.idsSubquery}) then ${timeEntry.jobId}::text else 'other' end`
        : sql`case when ${timeEntry.jobId} is null then 'none' else 'other' end`;
      const rows = await ctx.db
        .select({ k: sql<string>`${key}`, m: minutes })
        .from(timeEntry)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(desc(minutes))
        .limit(limit);
      const ids = rows.map((r) => r.k).filter((k) => k !== "none" && k !== "other");
      const titles = await visibleRecordTitles(ctx, deps.registry, "job", ids);
      return {
        kind: "series",
        categories: rows.map((r) => ({
          key: r.k,
          label:
            r.k === "none"
              ? "Bez zakázky"
              : r.k === "other"
                ? "Jiné zakázky"
                : (titles[r.k] ?? "Zakázka"),
          ...(v.jobs && ids.includes(r.k) ? { href: v.jobs.href(r.k) } : {}),
        })),
        series: series(rows.map((r) => num(r.m))),
      };
    },
  }),
  defineDashboardMetric({
    key: "dochazka.utilization",
    label: "Využití lidí",
    description:
      "Po osobách: odpracovaná doba děleno fondem pracovní doby v období (pracovní dny bez svátků × hodin denně × úvazek). Fond se počítá jen do dneška. Bez zvoleného období se bere tento měsíc.",
    format: "percent",
    shape: "series",
    permissions: ["dochazka.read"],
    supports: { period: true, person: true },
    params: [APPROVED_PARAM],
    compute: async (ctx, input, deps) => {
      const series = (values: (number | null)[]) => [
        { key: "utilization", label: "Využití", values },
      ];
      const range =
        input.from && input.to
          ? { from: input.from, to: input.to }
          : monthRange(input.today.slice(0, 7));
      const v = await visibility(
        ctx,
        deps,
        { ...input, from: range.from, to: range.to },
        { approvedOnly: approvedOnly(input) },
      );
      if (v.empty) return { kind: "series", categories: [], series: series([]) };
      const s = await deps.settings.get(ctx.db, dochazkaSetting);
      const worked = sql<number>`coalesce(sum(${timeEntry.minutes}) filter (where ${notInArray(timeEntry.kind, ABSENCES)}), 0)::float8`;
      const rows = await ctx.db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          workload: schema.employee.workload,
          m: worked,
        })
        .from(schema.user)
        .leftJoin(schema.employee, eq(schema.employee.userId, schema.user.id))
        .leftJoin(timeEntry, and(eq(timeEntry.userId, schema.user.id), ...v.conds))
        .where(
          and(
            eq(schema.user.active, true),
            sql`${schema.user.deletedAt} is null`,
            v.team ? inArray(schema.user.id, v.team) : undefined,
            input.userId ? eq(schema.user.id, input.userId) : undefined,
          ),
        )
        .groupBy(schema.user.id, schema.user.name, schema.employee.userId, schema.employee.workload)
        .having(sql`${schema.employee.userId} is not null or count(${timeEntry.id}) > 0`)
        .limit(500);
      const ranked = rows
        .map((r) => ({
          id: r.id,
          name: r.name,
          pct: utilizationPct(
            num(r.m),
            periodFundMinutes(
              range,
              input.today,
              s.hoursPerDay,
              s.workDays,
              r.workload ? Number(r.workload) : 1,
            ),
          ),
        }))
        .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name, "cs"))
        .slice(0, clampLimit(input.limit));
      return {
        kind: "series",
        categories: ranked.map((r) => ({ key: r.id, label: r.name })),
        series: series(ranked.map((r) => r.pct)),
      };
    },
  }),
  defineDashboardMetric({
    key: "dochazka.labour_cost",
    label: "Náklady na práci",
    description:
      "Odpracované hodiny × hodinový náklad zaměstnance v době zápisu (bez dovolené a nemoci). Vyžaduje právo vidět údaje zaměstnanců.",
    format: "money",
    shape: "scalar",
    permissions: ["dochazka.read", "employees.read"],
    supports: { period: true, job: true, person: true },
    params: [APPROVED_PARAM],
    compute: async (ctx, input, deps) => {
      const v = await visibility(ctx, deps, input, { approvedOnly: approvedOnly(input) });
      if (v.empty) return { kind: "scalar", value: 0 };
      const [r] = await ctx.db
        .select({
          c: sql<number>`coalesce(sum(round(${timeEntry.minutes} * ${timeEntry.hourlyCostMinor} / 60.0)), 0)::float8`,
        })
        .from(timeEntry)
        .where(and(...v.conds, workedOnly));
      return { kind: "scalar", value: num(r?.c) };
    },
  }),
];
