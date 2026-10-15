import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { toResult } from "../actions/run";
import { schema } from "../db/client";
import { filterGroupSchema } from "../entities/filters";
import { aggregateRecords, type AggregateGroup, type AggregateSpec } from "../entities/aggregate";
import { describeEntity } from "../entities/describe";
import {
  queryRecords,
  resolveEntity,
  visibleTo,
  type EntityRegistry,
  type ResolvedEntity,
} from "../entities/engine";
import type { Condition, FilterGroup } from "../entities/operators";
import type { AttributeDef, EntityDef } from "../entities/types";
import type { AttentionItem, DashboardMetricDef, ModuleDeps, WidgetData } from "../modules/server";
import { PermissionError, UserError } from "../rbac/errors";
import { scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { todayIso } from "../time/dates";
import { deltaOf } from "./format";
import { bucketLabel, bucketsBetween, comparisonRange, defaultBucket, periodOf } from "./periods";
import {
  type Bucket,
  type ChartKind,
  type CompareMode,
  type DashboardFilters,
  type BuiltinParams,
  type DashboardWidget,
  type DateRange,
  type EntitySource,
  type LinksSource,
  type ListItem,
  type MetricInfo,
  type MetricSource,
  type RecordsSource,
  type TableColumn,
  type ValueFormat,
  type ViewChoice,
  type ViewSource,
  type WidgetPresetDef,
  type WidgetPresetInfo,
  type WidgetOutcome,
  type WidgetResult,
} from "./types";
import { widgetSchema } from "./definition";

/** Prostředí vyhodnocení: registr entit, metriky zapnutých modulů a vestavěné zdroje. Dodává aplikace. */
export type DashboardEnv = {
  registry: EntityRegistry;
  deps: ModuleDeps;
  metrics: ReadonlyMap<string, DashboardMetricDef>;
  builtins?: {
    attention?: (ctx: Ctx) => Promise<AttentionItem[]>;
    tiles?: (ctx: Ctx) => Promise<WidgetData[]>;
    /**
     * Moje úkoly na dnes a po termínu (modul `ukoly`; jádro vlastní úkoly nemá). Bez poskytovatele je seznam prázdný.
     * `includeDelegated` přidá úkoly, které jsem zadal já a řeší je jiný; `done` je odškrtnutý úkol (zůstane do obnovy).
     */
    myTasks?: (
      ctx: Ctx,
      opts: { includeDelegated: boolean; limit: number },
    ) => Promise<
      {
        id: string;
        title: string;
        dueDate: string | null;
        subtitle?: string | undefined;
        href?: string | undefined;
        delegated?: boolean | undefined;
      }[]
    >;
  };
  /** Hotové widgety pro „Přidat widget“ (dodává modul `prehled`); nabídnou se jen ty, které aktér smí. */
  presets?: readonly WidgetPresetDef[];
  /** Doba platnosti mezipaměti na uživatele (ms); 0 = vypnuto. Výchozí 30 s. */
  cacheTtlMs?: number;
  /** Nejdelší doba jednoho dotazu (ms). Výchozí 8 s. */
  timeoutMs?: number;
  now?: () => Date;
};

export const DEFAULT_CACHE_TTL_MS = 30_000;
export const DEFAULT_TIMEOUT_MS = 8_000;

/* ---------- mezipaměť ---------- */

type CacheEntry = { at: number; outcome: WidgetOutcome };
const g = globalThis as { __dashboardCache?: Map<string, CacheEntry> };
const cache = () => (g.__dashboardCache ??= new Map<string, CacheEntry>());
const CACHE_MAX = 800;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

/** Podpis oprávnění aktéra: změna role nebo oprávnění vždy dá jiný klíč mezipaměti. */
function permissionSignature(ctx: Ctx): string {
  const a = ctx.actor;
  const perms = [...a.permissions.entries()].sort(([x], [y]) => (x < y ? -1 : 1));
  return hash(`${a.roleKey}|${a.unrestricted}|${a.restriction}|${JSON.stringify(perms)}`);
}

export function clearDashboardCache() {
  cache().clear();
}

/* ---------- pomocné ---------- */

const MONEY_TYPES = ["currency"];

/** Metrika je pro aktéra dostupná, jen když má všechna její oprávnění. */
export function metricAvailable(ctx: Ctx, m: DashboardMetricDef): boolean {
  return m.permissions.every((p) => scopeOf(ctx, p) !== null);
}

export function describeMetric(m: DashboardMetricDef): MetricInfo {
  return {
    key: m.key,
    label: m.label,
    description: m.description,
    format: m.format,
    shape: m.shape,
    supports: {
      period: !!m.supports?.period,
      job: !!m.supports?.job,
      person: !!m.supports?.person,
      bucket: !!m.supports?.bucket,
    },
    params: (m.params ?? []).map((p) => ({
      key: p.key,
      label: p.label,
      type: p.type,
      choices: p.choices?.map((c) => ({ ...c })),
      default: p.default,
    })),
  };
}

/** Katalog zdrojů, které aktér smí použít ve widgetech: čitelné entity a dostupné metriky. */
export function sourceCatalog(ctx: Ctx, env: DashboardEnv) {
  return {
    entities: env.registry
      .all()
      .filter((d) => scopeOf(ctx, d.permissions.read) !== null)
      .map((d) => ({ key: d.key, label: d.label.many, module: d.module })),
    metrics: [...env.metrics.values()].filter((m) => metricAvailable(ctx, m)).map(describeMetric),
  };
}

/** Je widget z katalogu pro aktéra dostupný (zapnutý modul a všechna oprávnění)? */
export function presetAvailable(ctx: Ctx, env: DashboardEnv, p: WidgetPresetDef): boolean {
  const r = p.requires;
  if (!r) return true;
  for (const key of r.metrics ?? []) {
    const m = env.metrics.get(key);
    if (!m || !metricAvailable(ctx, m)) return false;
  }
  for (const key of r.entities ?? []) {
    const d = env.registry.get(key);
    if (!d || !scopeOf(ctx, d.permissions.read)) return false;
  }
  for (const perm of r.permissions ?? []) if (scopeOf(ctx, perm) === null) return false;
  for (const b of r.builtins ?? []) {
    if (b === "my_tasks" && !env.builtins?.myTasks) return false;
    if (b === "attention" && !env.builtins?.attention) return false;
    if (b === "tiles" && !env.builtins?.tiles) return false;
  }
  return true;
}

/** Katalog hotových widgetů, které aktér smí přidat (widget zapnutého modulu bez oprávnění se nenabízí). */
export function availablePresets(ctx: Ctx, env: DashboardEnv): WidgetPresetInfo[] {
  return (env.presets ?? [])
    .filter((p) => presetAvailable(ctx, env, p))
    .map(({ key, title, description, group, phase, widget, widgets, configure }) => ({
      key,
      title,
      description,
      group,
      phase,
      widget,
      ...(widgets ? { widgets } : {}),
      ...(configure ? { configure } : {}),
    }));
}

/** Uložené pohledy, které aktér smí použít (moje a sdílené nad čitelnou entitou), pro „Číslo“, „Seznam z pohledu“, odkazy. */
export async function listViewChoices(ctx: Ctx, env: DashboardEnv): Promise<ViewChoice[]> {
  const me = ctx.actor.userId;
  if (!me) return [];
  const rows = await ctx.db
    .select()
    .from(schema.savedView)
    .where(
      and(
        isNull(schema.savedView.deletedAt),
        or(eq(schema.savedView.ownerId, me), eq(schema.savedView.shared, true)),
      ),
    )
    .orderBy(asc(schema.savedView.entityType), asc(schema.savedView.name));
  const out: ViewChoice[] = [];
  for (const v of rows) {
    const def = env.registry.get(v.entityType);
    if (!def || !scopeOf(ctx, def.permissions.read)) continue;
    const numeric = def.attributes
      .filter((a) => a.type === "number" || a.type === "currency")
      .map((a) => ({ key: a.key, label: a.label }));
    out.push({
      id: v.id,
      name: v.name,
      entity: def.key,
      entityLabel: def.label.many,
      href: `${def.listPath}?pohled=${v.id}`,
      shared: v.shared,
      numericAttrs: numeric,
    });
  }
  return out;
}

function entityOf(ctx: Ctx, env: DashboardEnv, key: string): EntityDef {
  const def = env.registry.get(key);
  if (!def)
    throw new UserError("Zdroj dat tohoto widgetu není v systému dostupný (vypnutý modul).");
  if (!scopeOf(ctx, def.permissions.read))
    throw new PermissionError("Na data tohoto widgetu nemáte oprávnění.");
  return def;
}

/** Atribut typu uživatel / zakázka, který se bere z filtrů nástěnky, když ho widget neurčí výslovně. */
function autoAttr(e: ResolvedEntity, kind: "job" | "user"): string | undefined {
  const c = e.attributes.filter((a) =>
    kind === "job" ? a.type === "record" && a.record?.entityType === "job" : a.type === "user",
  );
  return c.length === 1 ? c[0]!.key : undefined;
}

function valueFormat(
  e: ResolvedEntity,
  src: EntitySource,
  override: ValueFormat | undefined,
): ValueFormat {
  if (override) return override;
  if (src.agg.fn === "count") return "number";
  const a = src.agg.attr ? e.byKey.get(src.agg.attr) : undefined;
  if (!a) return "number";
  if (MONEY_TYPES.includes(a.type)) return "money";
  if (a.unit) return "percent";
  return "number";
}

/** Hodnota uložená v setinách procenta (`percent_bp`) se pro zobrazení převádí na procenta. */
const scaleOf = (e: ResolvedEntity, src: EntitySource): number =>
  src.agg.attr && e.byKey.get(src.agg.attr)?.unit === "percent_bp" ? 0.01 : 1;

const meta = (period: DateRange | null, now: Date, truncated = false) => ({
  period,
  ...(truncated ? { truncated } : {}),
  generatedAt: now.toISOString(),
});

type Context = {
  ctx: Ctx;
  env: DashboardEnv;
  widget: DashboardWidget;
  filters: DashboardFilters;
  today: string;
  now: Date;
  range: DateRange | null;
};

/* ---------- zdroj: agregace entity ---------- */

function aggregateSpecOf(
  c: Context,
  e: ResolvedEntity,
  src: EntitySource,
  range: DateRange | null,
  extra: Partial<AggregateSpec> = {},
): AggregateSpec {
  const equals: { attr: string; value: string }[] = [];
  const jobAttr = src.jobAttr ?? autoAttr(e, "job");
  const personAttr = src.personAttr ?? autoAttr(e, "user");
  if (c.filters.jobId && jobAttr && e.byKey.has(jobAttr))
    equals.push({ attr: jobAttr, value: c.filters.jobId });
  if (c.filters.userId && personAttr && e.byKey.has(personAttr))
    equals.push({ attr: personAttr, value: c.filters.userId });
  return {
    filters: src.filters,
    fn: src.agg.fn,
    attr: src.agg.attr,
    ...(range && src.dateAttr ? { period: { attr: src.dateAttr, ...range } } : {}),
    ...(equals.length ? { equals } : {}),
    ...(c.filters.jobId && e.def.key === "job" ? { onlyIds: [c.filters.jobId] } : {}),
    ...extra,
  };
}

async function evalEntityAgg(c: Context, src: EntitySource): Promise<WidgetResult> {
  const def = entityOf(c.ctx, c.env, src.entity);
  const e = visibleTo(c.ctx, await resolveEntity(c.ctx.db, def));
  const w = c.widget;
  const fmt = valueFormat(e, src, w.options?.format);
  const scale = scaleOf(e, src);
  const now = c.now;

  if (w.type === "kpi" || w.type === "gauge") {
    const main = await aggregateRecords(
      c.ctx,
      c.env.registry,
      e,
      aggregateSpecOf(c, e, src, c.range),
    );
    const value = main.total.value === null ? null : main.total.value * scale;
    if (w.type === "gauge") return gaugeOf(value, fmt, w, c.range, now);
    const compare: CompareMode = w.options?.compare ?? "none";
    const cr = c.range && src.dateAttr ? comparisonRange(c.range, compare) : null;
    let previous: number | null = null;
    if (cr) {
      const prev = await aggregateRecords(c.ctx, c.env.registry, e, aggregateSpecOf(c, e, src, cr));
      previous = prev.total.value === null ? null : prev.total.value * scale;
    }
    const delta = cr ? deltaOf(value, previous) : undefined;
    return {
      kind: "kpi",
      format: fmt,
      value,
      ...(main.total.text ? { text: main.total.text } : {}),
      compare,
      ...(cr ? { previous } : {}),
      ...(delta ? { delta } : {}),
      meta: meta(c.range, now),
    };
  }

  // seskupené zdroje: graf, tabulka, souhrn podle stavu
  const gb = src.groupBy;
  if (!gb) throw new UserError("Widget potřebuje seskupení.");
  const isDate = e.byKey.get(gb.attr)?.type === "date";
  const bucket: Bucket | undefined = isDate ? (gb.bucket ?? defaultBucket(c.range)) : undefined;
  const chart: ChartKind = w.options?.chart ?? "bar";
  const wantSplit = w.type === "chart" && chart === "stacked" && !!src.splitBy;
  const res = await aggregateRecords(
    c.ctx,
    c.env.registry,
    e,
    aggregateSpecOf(c, e, src, c.range, {
      groupBy: { attr: gb.attr, ...(bucket ? { bucket } : {}) },
      ...(wantSplit && src.splitBy ? { splitBy: src.splitBy } : {}),
      sort: src.sort,
      limit: src.limit ?? (isDate ? 24 : 10),
    }),
  );
  let groups = res.groups;
  // časová řada bez děr: prázdná období uvnitř vybraného rozsahu se doplní nulou
  if (isDate && bucket && c.range && (w.type === "chart" || w.type === "table") && groups.length) {
    const have = new Map(groups.map((x) => [x.key, x]));
    const fill = bucketsBetween(c.range, bucket, 60);
    if (fill.length <= 60 && !src.sort)
      groups = fill.map(
        (k) =>
          have.get(k) ??
          ({
            key: k,
            label: "",
            value: src.agg.fn === "count" || src.agg.fn === "sum" ? 0 : null,
            count: 0,
          } as AggregateGroup),
      );
    for (const x of groups) if (!x.label && x.key) x.label = bucketLabel(x.key, bucket);
  }
  const val = (x: AggregateGroup) => (x.value === null ? null : x.value * scale);

  if (w.type === "status") {
    return {
      kind: "status",
      format: fmt,
      stages: groups.map((x) => ({
        id: x.key ?? "none",
        name: x.label,
        color: x.color ?? "gray",
        count: x.count,
        // u počtu je hodnota totéž co počet, nezobrazuje se dvakrát
        value: src.agg.fn === "count" ? null : val(x),
        href: def.listPath,
      })),
      meta: meta(c.range, now, res.truncated),
    };
  }
  if (w.type === "table") {
    return {
      kind: "table",
      format: fmt,
      columns: [
        { key: "label", label: e.byKey.get(gb.attr)?.label ?? "Skupina", type: "text" },
        {
          key: "value",
          label: aggLabel(e, src),
          type: fmt === "money" ? "money" : fmt === "percent" ? "percent" : "number",
        },
        ...(src.agg.fn === "count"
          ? []
          : [{ key: "count", label: "Počet", type: "number" as const }]),
      ],
      rows: groups.map((x, i) => ({
        id: x.key ?? `none-${i}`,
        cells: { label: x.label, value: val(x), count: x.count },
      })),
      meta: meta(c.range, now, res.truncated),
    };
  }
  // graf
  const categories = groups.map((x) => ({
    key: x.key ?? "none",
    label: x.label,
    ...(x.color && (chart === "pie" || chart === "donut") ? { color: x.color } : {}),
  }));
  if (wantSplit && res.splitKeys) {
    return {
      kind: "chart",
      chart: "stacked",
      format: fmt,
      categories,
      series: res.splitKeys.map((sk) => ({
        key: sk.key || "none",
        label: sk.label,
        values: groups.map((x) => (x.split?.[sk.key] ?? 0) * scale),
      })),
      meta: meta(c.range, now, res.truncated),
    };
  }
  return {
    kind: "chart",
    chart: w.type === "chart" ? (chart === "stacked" ? "bar" : chart) : "bar",
    format: fmt,
    categories,
    series: [{ key: "value", label: aggLabel(e, src), values: groups.map(val) }],
    meta: meta(c.range, now, res.truncated),
  };
}

const AGG_WORD = { count: "Počet", sum: "Součet", avg: "Průměr", min: "Minimum", max: "Maximum" };
function aggLabel(e: ResolvedEntity, src: EntitySource): string {
  const a = src.agg.attr ? e.byKey.get(src.agg.attr)?.label : undefined;
  return src.agg.fn === "count" || !a ? "Počet" : `${AGG_WORD[src.agg.fn]}: ${a}`;
}

function gaugeOf(
  value: number | null,
  format: ValueFormat,
  w: DashboardWidget,
  range: DateRange | null,
  now: Date,
): WidgetResult {
  const target = w.options?.target ?? 0;
  return {
    kind: "gauge",
    format,
    value,
    target,
    pct: value === null || target <= 0 ? null : (value / target) * 100,
    meta: meta(range, now),
  };
}

/* ---------- zdroj: seznam záznamů ---------- */

function recordsFilter(c: Context, e: ResolvedEntity, src: RecordsSource): FilterGroup | undefined {
  const conds: (Condition | FilterGroup)[] = [];
  if (src.filters?.conditions.length) conds.push(src.filters);
  if (c.range && src.dateAttr && e.byKey.has(src.dateAttr))
    conds.push({ attr: src.dateAttr, op: "between", value: [c.range.from, c.range.to] });
  const jobAttr = src.jobAttr ?? autoAttr(e, "job");
  const personAttr = src.personAttr ?? autoAttr(e, "user");
  if (c.filters.jobId && jobAttr && e.byKey.has(jobAttr))
    conds.push({ attr: jobAttr, op: "is", value: c.filters.jobId });
  if (c.filters.userId && personAttr && e.byKey.has(personAttr))
    conds.push({ attr: personAttr, op: "is", value: c.filters.userId });
  return conds.length ? { op: "and", conditions: conds } : undefined;
}

const COLUMN_TYPE: Record<string, TableColumn["type"]> = {
  currency: "money",
  number: "number",
  date: "date",
  status: "status",
};

async function evalRecords(c: Context, src: RecordsSource): Promise<WidgetResult> {
  const def = entityOf(c.ctx, c.env, src.entity);
  const e = visibleTo(c.ctx, await resolveEntity(c.ctx.db, def));
  const missing = src.columns.filter((k) => !e.byKey.has(k));
  if (missing.length) throw new UserError(`Sloupec „${missing[0]}“ není dostupný.`);
  const limit = src.limit ?? 10;
  const page = await queryRecords(c.ctx, c.env.registry, await resolveEntity(c.ctx.db, def), {
    ...(recordsFilter(c, e, src) ? { filters: recordsFilter(c, e, src)! } : {}),
    ...(src.sort?.length ? { sort: src.sort } : {}),
    limit,
  });
  const descriptor = await describeEntity(c.ctx, c.ctx.db, e, c.env.registry);
  const attrs = src.columns.map((k) => descriptor.attributes.find((a) => a.key === k)!);
  const text = (a: (typeof attrs)[number], v: unknown, labels: typeof page.labels): unknown => {
    if (v === null || v === undefined) return null;
    switch (a.type) {
      case "status":
        return a.stages?.find((s) => s.id === v)?.name ?? "";
      case "select":
        return a.choices?.find((x) => x.value === v)?.label ?? String(v);
      case "multiselect":
        return (v as string[])
          .map((x) => a.choices?.find((y) => y.value === x)?.label ?? x)
          .join(", ");
      case "user":
      case "record":
        return labels[a.key]?.[String(v)]?.label ?? "";
      case "checkbox":
        return v ? "ano" : "ne";
      case "number":
        return a.unit === "percent_bp" ? Number(v) / 100 : Number(v);
      default:
        return v;
    }
  };
  const base = { meta: meta(c.range, c.now, page.total > page.rows.length) };
  return {
    kind: "table",
    columns: attrs.map((a) => ({
      key: a.key,
      label: a.label,
      type: a.type === "number" && a.unit ? "percent" : (COLUMN_TYPE[a.type] ?? "text"),
    })),
    rows: page.rows.map((r) => ({
      id: r.id,
      href: def.url(r.id),
      cells: Object.fromEntries(attrs.map((a) => [a.key, text(a, r[a.key], page.labels)])),
    })),
    ...base,
  };
}

/** Seznam záznamů jako položky seznamu (nejbližší termíny, poslední doklady). */
async function evalList(c: Context, src: RecordsSource): Promise<WidgetResult> {
  const t = await evalRecords(c, src);
  if (t.kind !== "table") return t;
  const def = entityOf(c.ctx, c.env, src.entity);
  const dateKey = t.columns.find((x) => x.type === "date")?.key;
  const stateKey = t.columns.find((x) => x.type === "status")?.key;
  const titleKey = t.columns[0]!.key;
  const subKeys = t.columns.slice(1).filter((x) => x.key !== dateKey && x.key !== stateKey);
  return {
    kind: "list",
    items: t.rows.map((r) => {
      const due = dateKey ? (r.cells[dateKey] as string | null) : null;
      return {
        id: r.id,
        title: String(r.cells[titleKey] ?? ""),
        ...(subKeys.length
          ? {
              subtitle: subKeys
                .map((k) => r.cells[k.key])
                .filter((v) => v !== null && v !== "")
                .map((v) => (typeof v === "number" ? String(v) : String(v)))
                .join(" · "),
            }
          : {}),
        ...(stateKey && r.cells[stateKey] ? { badge: String(r.cells[stateKey]) } : {}),
        ...(due
          ? { date: due, tone: due < c.today ? ("danger" as const) : ("default" as const) }
          : {}),
        href: r.href ?? def.url(r.id),
      };
    }),
    meta: t.meta,
  };
}

/* ---------- zdroj: metrika modulu ---------- */

async function evalMetric(c: Context, src: MetricSource): Promise<WidgetResult> {
  const m = c.env.metrics.get(src.metric);
  if (!m) throw new UserError("Tato metrika není v systému dostupná (vypnutý modul).");
  if (!metricAvailable(c.ctx, m))
    throw new PermissionError("Tuto metriku nemáte oprávnění zobrazit.");
  const w = c.widget;
  const fmt = w.options?.format ?? m.format;
  const supports = m.supports ?? {};
  const params = Object.fromEntries(
    (m.params ?? []).flatMap((p) =>
      p.default !== undefined ? [[p.key, src.params?.[p.key] ?? p.default] as const] : [],
    ),
  );
  for (const [k, v] of Object.entries(src.params ?? {}))
    if ((m.params ?? []).some((p) => p.key === k)) params[k] = v;
  const run = (range: DateRange | null) =>
    m.compute(
      c.ctx,
      {
        from: supports.period && range ? range.from : null,
        to: supports.period && range ? range.to : null,
        jobId: supports.job ? (c.filters.jobId ?? null) : null,
        userId: supports.person ? (c.filters.userId ?? null) : null,
        bucket: supports.bucket ? (src.bucket ?? defaultBucket(range)) : null,
        limit: src.limit ?? 12,
        params,
        today: c.today,
      },
      c.env.deps,
    );
  const main = await run(c.range);
  if (main.kind === "list") {
    if (w.type !== "list") throw new UserError("Tato metrika je seznam, použijte widget Seznam.");
    return {
      kind: "list",
      items: main.items,
      ...(main.emptyText ? { emptyText: main.emptyText } : {}),
      meta: meta(c.range, c.now),
    };
  }
  if (w.type === "list") throw new UserError("Widget Seznam potřebuje metriku typu seznam.");
  if (main.kind === "scalar") {
    if (w.type === "gauge") return gaugeOf(main.value, fmt, w, c.range, c.now);
    if (w.type !== "kpi")
      throw new UserError("Tato metrika je jedno číslo, použijte KPI nebo měřidlo.");
    const compare: CompareMode = w.options?.compare ?? "none";
    const cr = supports.period && c.range ? comparisonRange(c.range, compare) : null;
    const previous = cr ? (((await run(cr)) as { value?: number | null }).value ?? null) : null;
    const delta = cr ? deltaOf(main.value, previous) : undefined;
    return {
      kind: "kpi",
      format: fmt,
      value: main.value,
      compare,
      ...(cr ? { previous } : {}),
      ...(delta ? { delta } : {}),
      meta: meta(c.range, c.now),
    };
  }
  if (w.type === "table") {
    return {
      kind: "table",
      format: fmt,
      columns: [
        { key: "label", label: "Název", type: "text" },
        ...main.series.map((s) => ({
          key: s.key,
          label: s.label,
          type: (fmt === "money"
            ? "money"
            : fmt === "minutes"
              ? "minutes"
              : fmt === "hours"
                ? "hours"
                : fmt === "percent"
                  ? "percent"
                  : "number") as TableColumn["type"],
        })),
      ],
      rows: main.categories.map((cat, i) => ({
        id: cat.key,
        ...(cat.href ? { href: cat.href } : {}),
        cells: {
          label: cat.label,
          ...Object.fromEntries(main.series.map((s) => [s.key, s.values[i] ?? null])),
        },
      })),
      meta: meta(c.range, c.now),
    };
  }
  if (w.type === "status") {
    const s = main.series[0];
    return {
      kind: "status",
      format: fmt,
      stages: main.categories.map((cat, i) => ({
        id: cat.key,
        name: cat.label,
        color: cat.color ?? "gray",
        count: 0,
        value: s?.values[i] ?? null,
        ...(cat.href ? { href: cat.href } : {}),
      })),
      meta: meta(c.range, c.now),
    };
  }
  const kind: ChartKind = w.options?.chart ?? "bar";
  return {
    kind: "chart",
    chart: kind,
    format: fmt,
    categories: main.categories,
    series: main.series,
    meta: meta(c.range, c.now),
  };
}

/* ---------- zdroj: uložený pohled ---------- */

/** Pohled, který aktér smí použít (jeho, nebo sdílený); jinak srozumitelná chyba. */
async function loadView(c: Context, viewId: string) {
  const me = c.ctx.actor.userId;
  const [v] = me
    ? await c.ctx.db
        .select()
        .from(schema.savedView)
        .where(
          and(
            eq(schema.savedView.id, viewId),
            isNull(schema.savedView.deletedAt),
            or(eq(schema.savedView.ownerId, me), eq(schema.savedView.shared, true)),
          ),
        )
    : [];
  if (!v) throw new UserError("Pohled už neexistuje nebo ho s vámi nikdo nesdílí.");
  return v;
}

/**
 * Číslo (`kpi`) a Seznam (`table`) z uloženého pohledu. Pohled se převede na obyčejný zdroj entity: filtr pohledu jde
 * stejnou datovou vrstvou jako seznam (oprávnění, rozsah „jen moje“, soukromé záznamy, skryté atributy), takže widget nikdy
 * neukáže víc, než by aktér viděl v seznamu.
 */
async function evalView(c: Context, src: ViewSource): Promise<WidgetResult> {
  const v = await loadView(c, src.viewId);
  const def = entityOf(c.ctx, c.env, v.entityType);
  const parsed = v.config.filters ? filterGroupSchema.safeParse(v.config.filters) : null;
  if (parsed && !parsed.success) throw new UserError("Filtr pohledu je poškozený.");
  const filters = parsed?.success ? parsed.data : undefined;
  if (c.widget.type === "kpi") {
    const agg =
      src.agg && (src.agg.fn === "count" || src.agg.attr) ? src.agg : { fn: "count" as const };
    return evalEntityAgg(c, {
      kind: "entity",
      entity: def.key,
      ...(filters ? { filters } : {}),
      agg,
    });
  }
  const e = visibleTo(c.ctx, await resolveEntity(c.ctx.db, def));
  const fromView = (v.config.columns ?? []).filter((k) => e.byKey.has(k)).slice(0, 8);
  const columns = fromView.length
    ? fromView
    : e.attributes
        .filter((a) => !["longtext", "multiselect"].includes(a.type))
        .map((a) => a.key)
        .slice(0, 4);
  if (!columns.length) throw new UserError("Pohled nemá žádné zobrazitelné sloupce.");
  const sort = (v.config.sort ?? []).filter((x) => e.byKey.has(x.attr)).slice(0, 3);
  const t = await evalRecords(c, {
    kind: "records",
    entity: def.key,
    ...(filters ? { filters } : {}),
    columns,
    ...(sort.length ? { sort } : {}),
    limit: Math.min(50, src.limit ?? 10),
  });
  return t;
}

/** Rychlé odkazy: vlastní odkazy a uložené pohledy (jen ty, které aktér smí otevřít). */
async function evalLinks(c: Context, src: LinksSource): Promise<WidgetResult> {
  const items: ListItem[] = src.links.map((l, i) => ({
    id: `link-${i}`,
    title: l.title,
    href: l.href,
  }));
  if (src.viewIds.length && c.ctx.actor.userId) {
    const rows = await c.ctx.db
      .select()
      .from(schema.savedView)
      .where(
        and(
          inArray(schema.savedView.id, src.viewIds),
          isNull(schema.savedView.deletedAt),
          or(eq(schema.savedView.ownerId, c.ctx.actor.userId), eq(schema.savedView.shared, true)),
        ),
      );
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of src.viewIds) {
      const v = byId.get(id);
      const def = v ? c.env.registry.get(v.entityType) : undefined;
      if (!v || !def || !scopeOf(c.ctx, def.permissions.read)) continue;
      items.push({
        id: `view-${id}`,
        title: v.name,
        subtitle: def.label.many,
        href: `${def.listPath}?pohled=${id}`,
      });
    }
  }
  return {
    kind: "list",
    items,
    emptyText: "Zatím žádné odkazy. V režimu Upravit je můžete přidat.",
    meta: meta(null, c.now),
  };
}

/* ---------- vestavěné zdroje ---------- */

async function evalBuiltin(
  c: Context,
  builtin: "attention" | "tiles" | "my_tasks",
  params: BuiltinParams = {},
): Promise<WidgetResult> {
  const m = meta(null, c.now);
  if (builtin === "attention") {
    const items = (await c.env.builtins?.attention?.(c.ctx)) ?? [];
    return {
      kind: "attention",
      items: items.map((i) => ({
        id: i.id,
        severity: i.severity,
        title: i.title,
        ...(i.detail ? { detail: i.detail } : {}),
        href: i.href,
      })),
      meta: m,
    };
  }
  if (builtin === "tiles") {
    const all = (await c.env.builtins?.tiles?.(c.ctx)) ?? [];
    const ids = params.tileIds;
    const tiles = ids?.length ? all.filter((t) => ids.includes(t.id)) : all;
    if (ids?.length && !tiles.length)
      return { kind: "empty", message: "Tento údaj teď není k dispozici.", meta: m };
    return {
      kind: "tiles",
      tiles: tiles.map((t) => ({
        id: t.id,
        title: t.title,
        value: t.value,
        ...(t.hint ? { hint: t.hint } : {}),
        ...(t.href ? { href: t.href } : {}),
        ...(t.tone ? { tone: t.tone } : {}),
      })),
      meta: m,
    };
  }
  const limit = params.limit ?? 8;
  const shown = (
    (await c.env.builtins?.myTasks?.(c.ctx, {
      includeDelegated: !!params.includeDelegated,
      limit,
    })) ?? []
  ).slice(0, limit);
  return {
    kind: "list",
    items: shown.map((t) => ({
      id: t.id,
      title: t.title,
      ...(t.subtitle ? { subtitle: t.subtitle } : {}),
      ...(t.dueDate
        ? {
            date: t.dueDate,
            tone: t.dueDate < c.today ? ("danger" as const) : ("default" as const),
          }
        : {}),
      // delegovaný úkol řeší někdo jiný: odškrtnout ho jde jen v seznamu úkolů
      ...(t.delegated ? { badge: "Delegované" } : { completeId: t.id }),
      href: t.href ?? "/ukoly",
    })),
    emptyText: "Na dnes nic nemáte. Hotovo.",
    meta: m,
  };
}

/* ---------- vstupní bod ---------- */

/** Spustí `fn` v transakci s časovým limitem dotazu (PostgreSQL ukončí dlouhý dotaz sám). */
async function withTimeout<T>(ctx: Ctx, ms: number, fn: (c: Ctx) => Promise<T>): Promise<T> {
  return ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('statement_timeout', ${String(ms)}, true)`);
    return fn({ ...ctx, db: tx });
  });
}

async function compute(
  ctx: Ctx,
  env: DashboardEnv,
  widget: DashboardWidget,
  filters: DashboardFilters,
): Promise<WidgetResult> {
  const now = (env.now ?? (() => new Date()))();
  const today = todayIso("Europe/Prague", now);
  const c: Context = { ctx, env, widget, filters, today, now, range: periodOf(filters, today) };
  const s = widget.source;
  switch (s.kind) {
    case "entity":
      return evalEntityAgg(c, s);
    case "records":
      return widget.type === "list" ? evalList(c, s) : evalRecords(c, s);
    case "metric":
      return evalMetric(c, s);
    case "builtin":
      return evalBuiltin(c, s.builtin, s.params);
    case "view":
      return evalView(c, s);
    case "links":
      return evalLinks(c, s);
  }
}

/**
 * Vyhodnotí jeden widget pro aktéra. Vždy přes datovou vrstvu s oprávněními aktéra (rozsah „jen moje“, skryté atributy,
 * oprávnění metrik): definice widgetu nemůže odhalit nic, co by aktér neviděl v seznamu. Chyba se nevyhazuje, vrací se
 * jako výsledek, takže jeden rozbitý widget nerozbije nástěnku. Výsledky se krátce (30 s) pamatují na uživatele.
 */
export async function evaluateWidget(
  ctx: Ctx,
  env: DashboardEnv,
  rawWidget: unknown,
  filters: DashboardFilters,
  opts: { fresh?: boolean } = {},
): Promise<WidgetOutcome> {
  let widget: DashboardWidget;
  try {
    const parsed = widgetSchema.safeParse(rawWidget);
    if (!parsed.success)
      return { ok: false, code: "invalid_input", error: "Definice widgetu je neplatná." };
    widget = parsed.data as DashboardWidget;
  } catch {
    return { ok: false, code: "invalid_input", error: "Definice widgetu je neplatná." };
  }
  const ttl = env.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const nowMs = (env.now ?? (() => new Date()))().getTime();
  const cacheKey =
    ttl > 0
      ? `${ctx.actor.userId ?? "-"}|${permissionSignature(ctx)}|${hash(JSON.stringify([widget, filters]))}`
      : "";
  if (ttl > 0 && !opts.fresh) {
    const hit = cache().get(cacheKey);
    if (hit && nowMs - hit.at < ttl) return hit.outcome;
  }
  let outcome: WidgetOutcome;
  try {
    const result = await withTimeout(ctx, env.timeoutMs ?? DEFAULT_TIMEOUT_MS, (c) =>
      compute(c, env, widget, filters),
    );
    outcome = { ok: true, result };
  } catch (err) {
    if (isTimeout(err))
      outcome = {
        ok: false,
        code: "timeout",
        error: "Výpočet widgetu trval příliš dlouho. Zúžte filtr nebo období.",
      };
    else {
      const r = toResult(err);
      outcome = {
        ok: false,
        error: r.ok ? "Widget se nepodařilo načíst." : r.error,
        code: r.ok ? "internal" : r.code,
      };
    }
  }
  if (ttl > 0 && outcome.ok) {
    const store = cache();
    if (store.size >= CACHE_MAX) store.delete(store.keys().next().value!);
    store.set(cacheKey, { at: nowMs, outcome });
  }
  return outcome;
}

function isTimeout(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause)
    if ((e as { code?: string }).code === "57014") return true;
  return false;
}

export type { AttributeDef };
