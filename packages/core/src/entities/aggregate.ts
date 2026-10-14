import { sql, type SQL } from "drizzle-orm";
import { getPipeline } from "../config-data";
import { bucketLabel } from "../dashboards/periods";
import { type AggFn, type Bucket } from "../dashboards/types";
import { UserError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";
import {
  buildEntityWhere,
  loadEntityLabels,
  queryInput,
  visibleTo,
  withBareKey,
  type EntityRegistry,
  type ResolvedEntity,
} from "./engine";
import { makeExprs } from "./expr";
import type { FilterGroup } from "./operators";
import type { AttributeDef, AttributeType, RecordRow } from "./types";

/** Dotaz „spočítej / sečti / zprůměruj … seskupeně“ nad entitou. Základ widgetů vlastních nástěnek (žádné ruční SQL). */
export type AggregateSpec = {
  filters?: FilterGroup | undefined;
  q?: string | undefined;
  fn: AggFn;
  /** Číselný (`sum`, `avg`) nebo číselný / datumový (`min`, `max`) atribut; u `count` se nepoužije. */
  attr?: string | undefined;
  groupBy?: { attr: string; bucket?: Bucket | undefined } | undefined;
  /** Druhé seskupení (skládaný graf): hodnotový atribut; má smysl jen u `count` a `sum`. */
  splitBy?: string | undefined;
  sort?: { by: "value" | "label"; dir: "asc" | "desc" } | undefined;
  limit?: number | undefined;
  /** Omezení na období podle datumového atributu (včetně obou konců). */
  period?: { attr: string; from: string; to: string } | undefined;
  /** Další omezení bez ohledu na filtry widgetu (zakázka, osoba z filtrů nástěnky): atribut = hodnota. */
  equals?: readonly { attr: string; value: string }[] | undefined;
  /** Jen záznamy s těmito id (zakázka vybraná ve filtru nástěnky u entity zakázky). */
  onlyIds?: readonly string[] | undefined;
};

export type AggregateGroup = {
  /** Surová hodnota skupiny (id, kód, začátek období `YYYY-MM-DD`); `null` = bez hodnoty. */
  key: string | null;
  label: string;
  color?: string | undefined;
  value: number | null;
  /** Hodnota jako text, když není číslo (nejdřívější / nejpozdější datum). */
  text?: string | undefined;
  count: number;
  /** Rozpad podle `splitBy`: klíč → hodnota. */
  split?: Record<string, number> | undefined;
};

export type AggregateResult = {
  groups: AggregateGroup[];
  total: { value: number | null; text?: string | undefined; count: number };
  /** Klíče a popisky druhého seskupení v pořadí podle významu (nejvýše 8 + „Ostatní“). */
  splitKeys?: { key: string; label: string; color?: string | undefined }[] | undefined;
  /** Skupin bylo víc, než se vrací. */
  truncated: boolean;
};

export const AGG_MAX_GROUPS = 100;
const FETCH_GROUPS = 500;
const SPLIT_MAX = 8;
const NUMERIC: AttributeType[] = ["number", "currency"];
const CATEGORICAL: AttributeType[] = [
  "status",
  "select",
  "user",
  "record",
  "checkbox",
  "text",
  "email",
  "phone",
];

/** Atributy, které se smí seskupovat (pro editor widgetů i kontrolu na serveru). */
export const GROUPABLE_TYPES: readonly AttributeType[] = [...CATEGORICAL, "date"];
export const AGGREGATABLE_TYPES: readonly AttributeType[] = NUMERIC;

/** Koše jako pevné literály (hodnota nikdy nepochází z textu od uživatele; bez `sql.raw`). */
const BUCKET_SQL: Record<Bucket, SQL> = {
  day: sql`'day'`,
  week: sql`'week'`,
  month: sql`'month'`,
  quarter: sql`'quarter'`,
  year: sql`'year'`,
};
const bucketSql = (b: Bucket): SQL => {
  const lit = BUCKET_SQL[b];
  if (!lit) throw new UserError("Neplatné období seskupení.");
  return lit;
};

function need(e: ResolvedEntity, key: string, what: string): AttributeDef {
  const a = e.byKey.get(key);
  if (!a) throw new UserError(`${what}: neznámý nebo nedostupný atribut „${key}“.`);
  return a;
}

/**
 * Agregace entity. Oprávnění a viditelnost řádků hlídá stejná datová vrstva jako seznam: bez práva ke čtení entity chyba,
 * rozsah „jen moje“ zúží řádky, atributy skryté oprávněním (ceny, marže) pro aktéra neexistují, takže se nedají
 * sečíst ani změnou definice widgetu.
 */
export async function aggregateRecords(
  ctx: Ctx,
  registry: EntityRegistry,
  entity: ResolvedEntity,
  spec: AggregateSpec,
): Promise<AggregateResult> {
  const e = visibleTo(ctx, entity);
  const x = (a: AttributeDef) => makeExprs(withBareKey(a), e.columns, e.customColumn);

  // hodnotový výraz
  let valueExpr: SQL;
  let valueIsDate = false;
  if (spec.fn === "count") valueExpr = sql`count(*)::float8`;
  else {
    if (!spec.attr) throw new UserError("Vyberte atribut, ze kterého se hodnota počítá.");
    const a = need(e, spec.attr, "Hodnota");
    const ok =
      spec.fn === "sum" || spec.fn === "avg"
        ? NUMERIC.includes(a.type)
        : [...NUMERIC, "date"].includes(a.type);
    if (!ok)
      throw new UserError(
        `Z atributu „${a.label}“ nejde spočítat ${{ sum: "součet", avg: "průměr", min: "minimum", max: "maximum", count: "počet" }[spec.fn]}.`,
      );
    valueIsDate = a.type === "date";
    const col = valueIsDate ? x(a).date : x(a).num;
    valueExpr =
      spec.fn === "sum"
        ? sql`coalesce(sum(${col}), 0)::float8`
        : spec.fn === "avg"
          ? sql`avg(${col})::float8`
          : spec.fn === "min"
            ? valueIsDate
              ? sql`min(${col})`
              : sql`min(${col})::float8`
            : valueIsDate
              ? sql`max(${col})`
              : sql`max(${col})::float8`;
  }
  const textValue = valueIsDate && (spec.fn === "min" || spec.fn === "max");
  const valueSelect = textValue
    ? sql<string | null>`(${valueExpr})::text`
    : sql<number | null>`${valueExpr}`;

  // podmínky: filtry widgetu + období + omezení z filtrů nástěnky
  const input = queryInput.parse({
    ...(spec.filters ? { filters: spec.filters } : {}),
    ...(spec.q ? { q: spec.q } : {}),
  });
  const parts: SQL[] = [buildEntityWhere(ctx, e, input)];
  if (spec.period) {
    const d = need(e, spec.period.attr, "Období");
    if (d.type !== "date") throw new UserError(`Podle atributu „${d.label}“ nejde omezit období.`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(spec.period.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(spec.period.to)
    )
      throw new UserError("Období musí být ve tvaru RRRR-MM-DD.");
    parts.push(sql`${x(d).date} between ${spec.period.from}::date and ${spec.period.to}::date`);
  }
  for (const eq of spec.equals ?? []) {
    const a = need(e, eq.attr, "Filtr");
    if (!["record", "user", "select", "status"].includes(a.type))
      throw new UserError(`Podle atributu „${a.label}“ nejde omezit.`);
    parts.push(sql`${x(a).text} = ${eq.value}`);
  }
  if (spec.onlyIds?.length)
    parts.push(
      sql`${e.columns.id} in (${sql.join(
        spec.onlyIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  const where = sql.join(parts, sql` and `);

  // celkem
  const [totalRow] = await ctx.db
    .select({ v: valueSelect, c: sql<number>`count(*)::int` })
    .from(e.def.table)
    .where(where);
  const total = {
    value: textValue ? null : ((totalRow?.v as number | null) ?? null),
    ...(textValue ? { text: (totalRow?.v as string | null) ?? undefined } : {}),
    count: Number(totalRow?.c ?? 0),
  };
  if (!spec.groupBy) return { groups: [], total, truncated: false };

  // seskupení
  const g = need(e, spec.groupBy.attr, "Seskupení");
  if (!GROUPABLE_TYPES.includes(g.type))
    throw new UserError(`Podle atributu „${g.label}“ nejde seskupovat.`);
  const isDate = g.type === "date";
  const bucket = spec.groupBy.bucket ?? "month";
  const gx = x(g);
  const groupExpr: SQL = isDate
    ? sql`(date_trunc(${bucketSql(bucket)}, ${gx.date}::timestamp)::date)::text`
    : g.type === "checkbox"
      ? sql`${gx.bool}::text`
      : gx.text;
  const limit = Math.min(Math.max(spec.limit ?? (isDate ? 24 : 10), 1), AGG_MAX_GROUPS);
  const rows = await ctx.db
    .select({ k: sql<string | null>`${groupExpr}`, v: valueSelect, c: sql<number>`count(*)::int` })
    .from(e.def.table)
    .where(isDate ? sql`${where} and ${gx.date} is not null` : where)
    .groupBy(groupExpr)
    // období: nejnovějších FETCH_GROUPS; ostatní: největší hodnoty (u textových hodnot abecedně)
    .orderBy(isDate ? sql`${groupExpr} desc` : sql`${valueExpr} desc nulls last, ${groupExpr} asc`)
    .limit(FETCH_GROUPS);

  const groups: AggregateGroup[] = rows.map((r) => ({
    key: r.k,
    label: "",
    value: textValue ? null : (r.v as number | null),
    ...(textValue ? { text: (r.v as string | null) ?? undefined } : {}),
    count: Number(r.c),
  }));
  await labelGroups(ctx, registry, e, g, groups, isDate ? bucket : null);

  // řazení a limit
  const sort = spec.sort ?? { by: isDate ? "label" : "value", dir: isDate ? "asc" : "desc" };
  const dir = sort.dir === "asc" ? 1 : -1;
  const keyed = (a: AggregateGroup) =>
    sort.by === "value" ? (a.value ?? Number.NEGATIVE_INFINITY) : (a.key ?? "￿");
  const byLabel = !isDate && sort.by === "label";
  groups.sort((a, b) => {
    if (byLabel) return a.label.localeCompare(b.label, "cs") * dir;
    const ka = keyed(a);
    const kb = keyed(b);
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
  });
  let truncated = rows.length >= FETCH_GROUPS || groups.length > limit;
  let shown = groups;
  if (groups.length > limit) {
    // u období zůstává nejnovějších `limit`, jinak prvních `limit` v daném řazení
    shown =
      isDate && sort.by === "label" && sort.dir === "asc"
        ? groups.slice(-limit)
        : groups.slice(0, limit);
    truncated = true;
  }

  const result: AggregateResult = { groups: shown, total, truncated };

  // druhé seskupení pro skládané grafy
  if (spec.splitBy) {
    if (spec.fn !== "count" && spec.fn !== "sum")
      throw new UserError("Rozpad (skládaný graf) jde jen pro počet a součet.");
    const sAttr = need(e, spec.splitBy, "Rozpad");
    if (!CATEGORICAL.includes(sAttr.type) || ["text", "email", "phone"].includes(sAttr.type))
      throw new UserError(`Podle atributu „${sAttr.label}“ nejde rozpadat.`);
    const sx = x(sAttr);
    const sExpr = sAttr.type === "checkbox" ? sql`${sx.bool}::text` : sx.text;
    const keys = shown.map((s) => s.key).filter((k): k is string => k !== null);
    const inGroup = keys.length
      ? sql`${groupExpr} in (${sql.join(
          keys.map((k) => sql`${k}`),
          sql`, `,
        )})`
      : sql`false`;
    const split = await ctx.db
      .select({
        g: sql<string | null>`${groupExpr}`,
        s: sql<string | null>`${sExpr}`,
        v: sql<number>`${valueExpr}`,
      })
      .from(e.def.table)
      .where(sql`${where} and ${inGroup}`)
      .groupBy(groupExpr, sExpr)
      .limit(5000);
    // nejvýznamnější hodnoty rozpadu, zbytek do „Ostatní“
    const totals = new Map<string, number>();
    for (const r of split) totals.set(r.s ?? "", (totals.get(r.s ?? "") ?? 0) + Number(r.v ?? 0));
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const keep = ranked.slice(0, SPLIT_MAX);
    const other = ranked.length > SPLIT_MAX;
    const sGroups: AggregateGroup[] = keep.map((k) => ({
      key: k === "" ? null : k,
      label: "",
      value: totals.get(k) ?? 0,
      count: 0,
    }));
    await labelGroups(ctx, registry, e, sAttr, sGroups, null);
    result.splitKeys = [
      ...sGroups.map((s) => ({
        key: s.key ?? "",
        label: s.label,
        ...(s.color ? { color: s.color } : {}),
      })),
      ...(other ? [{ key: "__other", label: "Ostatní" }] : []),
    ];
    const keepSet = new Set(keep);
    for (const grp of shown) {
      grp.split = {};
      for (const r of split) {
        if (r.g !== grp.key) continue;
        const sk = keepSet.has(r.s ?? "") ? (r.s ?? "") : "__other";
        grp.split[sk] = (grp.split[sk] ?? 0) + Number(r.v ?? 0);
      }
    }
  }
  return result;
}

/** Popisky skupin: stavy, volby, uživatelé a záznamy podle typu atributu; období podle koše. */
async function labelGroups(
  ctx: Ctx,
  registry: EntityRegistry,
  e: ResolvedEntity,
  a: AttributeDef,
  groups: AggregateGroup[],
  bucket: Bucket | null,
): Promise<void> {
  const none = "Nezadáno";
  switch (a.type) {
    case "date": {
      for (const g of groups) g.label = g.key ? bucketLabel(g.key, bucket ?? "month") : none;
      return;
    }
    case "checkbox":
      for (const g of groups) g.label = g.key === "true" ? "Ano" : g.key === "false" ? "Ne" : none;
      return;
    case "status": {
      const stages = a.pipeline
        ? ((await getPipeline(ctx.db, a.pipeline.entityType, a.pipeline.key))?.stages ?? [])
        : [];
      for (const g of groups) {
        const s = stages.find((x) => x.id === g.key);
        g.label = s?.name ?? (g.key ? "Neznámý stav" : none);
        if (s?.color) g.color = s.color;
      }
      return;
    }
    case "select":
      for (const g of groups) {
        const c = a.choices?.find((x) => x.value === g.key);
        g.label = c?.label ?? g.key ?? none;
        if (c?.color) g.color = c.color;
      }
      return;
    case "user":
    case "record": {
      const rows: RecordRow[] = groups
        .filter((g) => g.key)
        .map((g) => ({ id: "", updatedAt: "", [a.key]: g.key }));
      const labels =
        (await loadEntityLabels(ctx.db, registry, { ...e, attributes: [a] }, rows))[a.key] ?? {};
      for (const g of groups)
        g.label = (g.key && labels[g.key]?.label) || (g.key ? "Neznámý záznam" : none);
      return;
    }
    default:
      for (const g of groups) g.label = g.key || none;
  }
}
