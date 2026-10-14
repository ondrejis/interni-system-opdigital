import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { UserError } from "../rbac/errors";
import type { Ctx } from "../rbac/types";
import type { Exprs } from "./expr";
import { OPERATORS, OPERATORS_BY_TYPE, type Condition, type FilterGroup } from "./operators";
import type { AttributeDef } from "./types";

const conditionSchema = z.object({
  attr: z.string().min(1).max(80),
  op: z.enum(OPERATORS),
  value: z.unknown().optional(),
});
export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    op: z.enum(["and", "or"]),
    conditions: z.array(z.union([conditionSchema, filterGroupSchema])).max(50),
  }),
);

const MAX_DEPTH = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const bad = (attr: AttributeDef, what: string): never => {
  throw new UserError(`Filtr „${attr.label}“: ${what}.`);
};

const str = (attr: AttributeDef, v: unknown) =>
  typeof v === "string" ? v : bad(attr, "hodnota musí být text");
const num = (attr: AttributeDef, v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : bad(attr, "hodnota musí být číslo");
const date = (attr: AttributeDef, v: unknown) =>
  typeof v === "string" && ISO_DATE.test(v) ? v : bad(attr, "datum musí být RRRR-MM-DD");
const int = (attr: AttributeDef, v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3650
    ? v
    : bad(attr, "počet dnů musí být celé číslo");
const list = (attr: AttributeDef, v: unknown, check: (x: unknown) => string) => {
  if (!Array.isArray(v) || v.length === 0 || v.length > 100)
    return bad(attr, "hodnota musí být neprázdný seznam");
  return v.map(check);
};
const refId = (attr: AttributeDef) => (x: unknown) =>
  typeof x === "string" && (attr.type === "select" || attr.type === "multiselect" || UUID.test(x))
    ? x
    : bad(attr, "neplatná hodnota");

/** Dnešní den v české zóně (nezávisí na časovém pásmu databáze). */
const TODAY = sql`(now() at time zone 'Europe/Prague')::date`;

const like = (v: string) => v.replace(/[\\%_]/g, "\\$&");
const norm = (s: SQL) => sql`lower(f_unaccent(coalesce(${s}, '')))`;
const joinList = (xs: string[]) =>
  sql.join(
    xs.map((x) => sql`${x}`),
    sql`, `,
  );

function condition(ctx: Ctx, attr: AttributeDef, c: Condition, x: Exprs): SQL {
  const allowed = OPERATORS_BY_TYPE[attr.type];
  if (!allowed.includes(c.op)) bad(attr, `operátor „${c.op}“ pro tento typ není povolen`);
  const v = c.value;

  switch (c.op) {
    case "empty":
      return attr.type === "multiselect"
        ? sql`coalesce(${x.arrayLength}, 0) = 0`
        : ["text", "longtext", "email", "phone", "url"].includes(attr.type)
          ? sql`(${x.text} is null or ${x.text} = '')`
          : sql`${x.text} is null`;
    case "not_empty":
      return attr.type === "multiselect"
        ? sql`coalesce(${x.arrayLength}, 0) > 0`
        : ["text", "longtext", "email", "phone", "url"].includes(attr.type)
          ? sql`(${x.text} is not null and ${x.text} <> '')`
          : sql`${x.text} is not null`;
    case "contains":
      return sql`${norm(x.text)} like lower(f_unaccent(${"%" + like(str(attr, v)) + "%"})) escape '\\'`;
    case "not_contains":
      return sql`${norm(x.text)} not like lower(f_unaccent(${"%" + like(str(attr, v)) + "%"})) escape '\\'`;
    case "starts_with":
      return sql`${norm(x.text)} like lower(f_unaccent(${like(str(attr, v)) + "%"})) escape '\\'`;
    case "equals":
      return sql`${norm(x.text)} = lower(f_unaccent(${str(attr, v)}))`;
    case "not_equals":
      return sql`${norm(x.text)} <> lower(f_unaccent(${str(attr, v)}))`;
    case "eq":
      return attr.type === "date"
        ? sql`${x.date} = ${date(attr, v)}::date`
        : sql`${x.num} = ${num(attr, v)}`;
    case "neq":
      return sql`${x.num} <> ${num(attr, v)}`;
    case "gt":
      return sql`${x.num} > ${num(attr, v)}`;
    case "gte":
      return sql`${x.num} >= ${num(attr, v)}`;
    case "lt":
      return sql`${x.num} < ${num(attr, v)}`;
    case "lte":
      return sql`${x.num} <= ${num(attr, v)}`;
    case "between": {
      if (!Array.isArray(v) || v.length !== 2) return bad(attr, "rozsah musí mít dvě hodnoty");
      return attr.type === "date"
        ? sql`${x.date} between ${date(attr, v[0])}::date and ${date(attr, v[1])}::date`
        : sql`${x.num} between ${num(attr, v[0])} and ${num(attr, v[1])}`;
    }
    case "before":
      return sql`${x.date} < ${date(attr, v)}::date`;
    case "after":
      return sql`${x.date} > ${date(attr, v)}::date`;
    case "in_last_days":
      return sql`${x.date} between current_date - ${int(attr, v)}::int and current_date`;
    case "in_next_days":
      return sql`${x.date} between current_date and current_date + ${int(attr, v)}::int`;
    // starší než N dní: den před dneškem minus N (dnešek a mladší se nepočítají); prázdné datum nevyhovuje
    case "older_than_days":
      return sql`${x.date} < ${TODAY} - ${int(attr, v)}::int`;
    // tento týden (od pondělí) a tento měsíc v české zóně
    case "in_this_week":
      return sql`${x.date} >= date_trunc('week', ${TODAY})::date and ${x.date} < (date_trunc('week', ${TODAY}) + interval '7 days')::date`;
    case "in_this_month":
      return sql`${x.date} >= date_trunc('month', ${TODAY})::date and ${x.date} < (date_trunc('month', ${TODAY}) + interval '1 month')::date`;
    case "is":
      return sql`${x.text} = ${typeof v === "string" ? refId(attr)(v) : bad(attr, "hodnota je povinná")}`;
    case "is_not":
      return sql`${x.text} is distinct from ${typeof v === "string" ? refId(attr)(v) : bad(attr, "hodnota je povinná")}`;
    case "is_any_of":
      return sql`${x.text} in (${joinList(list(attr, v, refId(attr)))})`;
    case "is_none_of":
      return sql`(${x.text} is null or ${x.text} not in (${joinList(list(attr, v, refId(attr)))}))`;
    case "is_me":
      return sql`${x.text} = ${ctx.actor.userId ?? "00000000-0000-0000-0000-000000000000"}`;
    case "is_not_me":
      return sql`${x.text} is distinct from ${ctx.actor.userId ?? "00000000-0000-0000-0000-000000000000"}`;
    case "contains_any":
      return sql`${x.array} && ARRAY[${joinList(list(attr, v, refId(attr)))}]::text[]`;
    case "contains_all":
      return sql`${x.array} @> ARRAY[${joinList(list(attr, v, refId(attr)))}]::text[]`;
    case "is_true":
      return sql`coalesce(${x.bool}, false) = true`;
    case "is_false":
      return sql`coalesce(${x.bool}, false) = false`;
  }
}

/** Ze stromu podmínek udělá SQL. Neznámý atribut, nepovolený operátor nebo špatná hodnota = srozumitelná chyba. */
export type FilterEnv = {
  attrOf: (key: string) => AttributeDef | undefined;
  exprOf: (attr: AttributeDef) => Exprs;
};

export function buildFilter(
  ctx: Ctx,
  group: FilterGroup | undefined,
  env: FilterEnv,
  depth = 0,
): SQL | undefined {
  if (!group || group.conditions.length === 0) return undefined;
  if (depth >= MAX_DEPTH) throw new UserError("Filtr je příliš zanořený.");
  const parts: SQL[] = [];
  for (const item of group.conditions) {
    if ("conditions" in item) {
      const inner = buildFilter(ctx, item, env, depth + 1);
      if (inner) parts.push(inner);
      continue;
    }
    const attr = env.attrOf(item.attr);
    if (!attr || attr.filterable === false)
      throw new UserError(`Podle atributu „${item.attr}“ nejde filtrovat.`);
    parts.push(condition(ctx, attr, item, env.exprOf(attr)));
  }
  if (!parts.length) return undefined;
  const joined = sql.join(parts, group.op === "and" ? sql` and ` : sql` or `);
  return sql`(${joined})`;
}
