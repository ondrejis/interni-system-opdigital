import { and, eq, getTableColumns, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import "../zod-locale";
import { auditChange, recordAudit } from "../audit/audit";
import { getLookup, getPipeline } from "../config-data";
import { listFieldDefs, normalizeValue } from "../custom-fields";
import { schema, type Executor } from "../db/client";
import { newId } from "../db/ids";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { can, canSeePrivate, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { deleteTree, restoreTree } from "../trash/tree";
import { registryOrSelf, setActiveRegistry } from "./active-registry";
import { deleteBlockMessage } from "./delete-blockers";
import { makeExprs } from "./expr";
import { buildFilter, filterGroupSchema } from "./filters";
import type { FilterGroup } from "./operators";
import { hasVisibility, parentLinks } from "./links";
import { registerEntityPolicy } from "./policy";
import { formatMinor } from "./shared";
import { indexRecord } from "./search";
import type { AttributeDef, AttributeType, EntityDef, Labels, RecordRow } from "./types";
import {
  PRIVATE_LABEL,
  privateScope,
  refreshInherited,
  syncPrivateRecord,
  validateVisibility,
  visibilityForInsert,
} from "./visibility";

const TEXT_TYPES: AttributeType[] = ["text", "longtext", "email", "phone", "url"];
const MAX_LIMIT = 200;

/** Entita se zjištěnými vlastními poli (z administrace) připravená k dotazům. */
export type ResolvedEntity = {
  def: EntityDef;
  attributes: AttributeDef[];
  byKey: Map<string, AttributeDef>;
  columns: Record<string, AnyPgColumn>;
  customColumn: AnyPgColumn | undefined;
};

export type EntityRegistry = {
  get(key: string): EntityDef | undefined;
  all(): EntityDef[];
};

export function createEntityRegistry(defs: readonly EntityDef[]): EntityRegistry {
  const map = new Map<string, EntityDef>();
  for (const d of defs) {
    if (map.has(d.key)) throw new Error(`Entita „${d.key}“ je zaregistrovaná dvakrát.`);
    const cols = getTableColumns(d.table) as Record<string, AnyPgColumn>;
    for (const required of ["id", "updatedAt", "deletedAt"]) {
      if (!cols[required]) throw new Error(`Tabulka entity „${d.key}“ nemá sloupec „${required}“.`);
    }
    for (const a of d.attributes) {
      if (!a.custom && (!a.field || !cols[a.field]))
        throw new Error(
          `Entita „${d.key}“: atribut „${a.key}“ odkazuje na neexistující sloupec „${a.field}“.`,
        );
    }
    if (!d.attributes.some((a) => a.key === d.titleKey))
      throw new Error(`Entita „${d.key}“: chybí atribut názvu „${d.titleKey}“.`);
    map.set(d.key, d);
  }
  validateVisibility(defs);
  return { get: (k) => map.get(k), all: () => [...map.values()] };
}

/** Přidá vlastní pole z administrace jako další atributy entity. */
export async function resolveEntity(db: Executor, def: EntityDef): Promise<ResolvedEntity> {
  const columns = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const defs = await listFieldDefs(db, def.key);
  const custom: AttributeDef[] = defs
    .filter((f) => !f.options.hidden)
    .map((f) => ({
      key: `custom.${f.key}`,
      label: f.label,
      type: f.type as AttributeType,
      custom: true,
      ...(f.options.defaultValue !== undefined ? { default: f.options.defaultValue } : {}),
      ...(f.options.choices ? { choices: f.options.choices } : {}),
      ...(f.options.entityType ? { record: { entityType: f.options.entityType } } : {}),
      required: f.required,
      defaultVisible: f.showInTable,
      showInForm: f.showInForm,
    }));
  const resolvedNative = await Promise.all(
    def.attributes.map(async (a): Promise<AttributeDef> => {
      if (!a.lookup) return a;
      const items = await getLookup(db, a.lookup, { includeInactive: true });
      return {
        ...a,
        choices: items
          // štítky platí jen pro entity ze svého rozsahu (prázdný rozsah = všude)
          .filter(
            (i) =>
              !a.lookupScope || !i.scopes?.length || i.scopes.includes(a.lookupScope) || !i.active,
          )
          .map((i) => ({
            value: i.value,
            label: i.label,
            ...(i.color ? { color: i.color } : {}),
            ...(i.active ? {} : { archived: true }),
          })),
      };
    }),
  );
  const attributes = [...resolvedNative, ...custom, ...visibilityAttributes(def)];
  return {
    def,
    attributes,
    byKey: new Map(attributes.map((a) => [a.key, a])),
    columns,
    customColumn: columns.custom,
  };
}

/**
 * Zámek jako atributy záznamu (`isPrivate`, `visibilitySource`): jen pro čtení a jen pro ty, kdo smí vidět soukromé
 * (`private.read`), takže pro ostatní neexistují v řádcích, filtrech, řazení ani exportu. Umožňují filtr „Soukromé“,
 * sloupec se zámkem a hromadnou změnu viditelnosti; zapisuje je výhradně `setVisibility`.
 */
function visibilityAttributes(def: EntityDef): AttributeDef[] {
  if (!hasVisibility(def)) return [];
  const taken = new Set(def.attributes.map((a) => a.key));
  const out: AttributeDef[] = [];
  if (!taken.has("isPrivate"))
    out.push({
      key: "isPrivate",
      label: "Soukromé",
      type: "checkbox",
      field: "isPrivate",
      readonly: true,
      permission: "private.read",
      width: 90,
    });
  if (!taken.has("visibilitySource"))
    out.push({
      key: "visibilitySource",
      label: "Zámek",
      type: "select",
      field: "visibilitySource",
      readonly: true,
      permission: "private.read",
      choices: [
        { value: "own", label: "Zvolený" },
        { value: "inherited", label: "Zděděný" },
      ],
      width: 110,
    });
  return out;
}

/**
 * Entita zúžená na atributy, které aktér smí vidět (`AttributeDef.permission`). Skryté atributy pak pro aktéra
 * neexistují: nejsou v řádcích, součtech, filtrech ani řazení a nejdou zapsat (neznámý atribut).
 */
export function visibleTo(ctx: Ctx, e: ResolvedEntity): ResolvedEntity {
  const hidden = (a: AttributeDef) => !!a.permission && !scopeOf(ctx, a.permission);
  if (!e.attributes.some(hidden)) return e;
  const attributes = e.attributes.filter((a) => !hidden(a));
  return { ...e, attributes, byKey: new Map(attributes.map((a) => [a.key, a])) };
}

/** Klíč vlastního pole v `custom` jsonb: atribut `custom.xyz` → `xyz`. */
const customKey = (a: AttributeDef) => a.key.slice("custom.".length);

/** Pro výrazy nad vlastními poli se do SQL předává holý klíč. */
const withBareKey = (a: AttributeDef): AttributeDef => (a.custom ? { ...a, key: customKey(a) } : a);

function scopeWhere(ctx: Ctx, e: ResolvedEntity): SQL | undefined {
  const scope = scopeOf(ctx, e.def.permissions.read);
  if (!scope) throw new PermissionError();
  if (scope === "all") return undefined;
  if (e.def.scope) return e.def.scope(ctx);
  const me = ctx.actor.userId;
  const cols = e.def.ownerColumns ?? [];
  if (!me || !cols.length) return sql`false`;
  return or(...cols.map((c) => eq(c, me)));
}

/** Podmínka zámku: aktér bez `private.read` nevidí soukromé záznamy (jen u entit se zámkem). */
function privateWhere(ctx: Ctx, e: Pick<ResolvedEntity, "def" | "columns">): SQL | undefined {
  if (!hasVisibility(e.def) || !e.columns.isPrivate) return undefined;
  return privateScope(ctx, { isPrivate: e.columns.isPrivate });
}

/**
 * Hodnoty atributů v podobě pro člověka (do auditu a časové osy): název stavu, popisek možnosti,
 * jméno uživatele nebo záznamu, částka s měnou. Klíč výsledku je název atributu.
 */
async function humanView(
  db: Executor,
  registry: EntityRegistry,
  e: ResolvedEntity,
  row: RecordRow,
  keys: string[],
): Promise<Record<string, unknown>> {
  // popisky soukromých záznamů se do historie nikdy nezapisují (čte ji i ten, kdo je nesmí vidět)
  const labels = await loadLabels(db, registry, e, [row], true);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const a = e.byKey.get(key)!;
    const v = row[key];
    if (v === null || v === undefined) {
      out[a.label] = null;
      continue;
    }
    switch (a.type) {
      case "status": {
        const pl = a.pipeline && (await getPipeline(db, a.pipeline.entityType, a.pipeline.key));
        out[a.label] = pl?.stages.find((s) => s.id === v)?.name ?? String(v);
        break;
      }
      case "select":
        out[a.label] = a.choices?.find((c) => c.value === v)?.label ?? String(v);
        break;
      case "multiselect":
        out[a.label] = (v as string[])
          .map((x) => a.choices?.find((c) => c.value === x)?.label ?? x)
          .join(", ");
        break;
      case "user":
      case "record":
        out[a.label] = labels[a.key]?.[String(v)]?.label ?? String(v);
        break;
      case "currency":
        out[a.label] = formatMinor(v as number);
        break;
      default:
        out[a.label] = v;
    }
  }
  return out;
}

export const queryInput = z.object({
  filters: filterGroupSchema.optional(),
  sort: z
    .array(z.object({ attr: z.string().min(1).max(80), dir: z.enum(["asc", "desc"]) }))
    .max(5)
    .optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  offset: z.number().int().min(0).max(1_000_000).optional(),
  /** Seskupení: atribut typu stav, výběr, uživatel, záznam nebo ano/ne. */
  group: z.string().max(80).nullish(),
});
export type QueryInput = z.input<typeof queryInput>;

function whereOf(ctx: Ctx, e: ResolvedEntity, input: z.output<typeof queryInput>): SQL {
  const x = (a: AttributeDef) => makeExprs(withBareKey(a), e.columns, e.customColumn);
  const filter = buildFilter(ctx, input.filters as FilterGroup | undefined, {
    attrOf: (k) => e.byKey.get(k),
    exprOf: x,
  });
  let q: SQL | undefined;
  if (input.q) {
    const pattern = "%" + input.q.replace(/[\\%_]/g, "\\$&") + "%";
    const searchable = e.attributes.filter(
      (a) => TEXT_TYPES.includes(a.type) && a.searchable !== false && a.type !== "longtext",
    );
    // bez coalesce: NULL ve sloupci hledání nenajde, a výraz tak přesně odpovídá trigramovým indexům (`*_trgm_idx`)
    q = or(
      ...searchable.map(
        (a) => sql`lower(f_unaccent(${x(a).text})) like lower(f_unaccent(${pattern})) escape '\\'`,
      ),
    );
  }
  return (
    and(isNull(e.columns.deletedAt!), scopeWhere(ctx, e), privateWhere(ctx, e), filter, q) ??
    sql`true`
  );
}

function toRow(e: ResolvedEntity, raw: Record<string, unknown>): RecordRow {
  const row: RecordRow = { id: String(raw.id), updatedAt: (raw.updatedAt as Date).toISOString() };
  const custom = (raw.custom ?? {}) as Record<string, unknown>;
  for (const a of e.attributes) {
    const v = a.custom ? custom[customKey(a)] : raw[a.field!];
    // sloupce `numeric` vrací ovladač jako řetězec; číselné atributy jdou do UI jako číslo
    row[a.key] =
      v instanceof Date
        ? v.toISOString()
        : a.type === "number" && typeof v === "string"
          ? Number(v)
          : (v ?? null);
  }
  return row;
}

/** Popisky odkazovaných uživatelů a záznamů, aby tabulka ukázala jména místo ID. */
async function loadLabels(
  db: Executor,
  registry: EntityRegistry,
  e: ResolvedEntity,
  rows: RecordRow[],
  /** Popisky soukromých záznamů se nahradí textem „Soukromý záznam“ (aktér bez `private.read`, historie). */
  maskPrivate = false,
): Promise<Labels> {
  const labels: Labels = {};
  for (const a of e.attributes) {
    if (a.type !== "user" && a.type !== "record") continue;
    const ids = [
      ...new Set(rows.map((r) => r[a.key]).filter((v): v is string => typeof v === "string")),
    ];
    if (!ids.length) continue;
    const out: Labels[string] = {};
    if (a.type === "user") {
      for (const u of await db
        .select({ id: schema.user.id, name: schema.user.name })
        .from(schema.user)
        .where(inArray(schema.user.id, ids)))
        out[u.id] = { label: u.name };
    } else {
      const target = a.record && registry.get(a.record.entityType);
      if (target) {
        const cols = getTableColumns(target.table) as Record<string, AnyPgColumn>;
        const titleField = target.attributes.find((t) => t.key === target.titleKey)?.field;
        if (titleField && cols[titleField]) {
          for (const r of await db
            .select({
              id: cols.id!,
              title: cols[titleField]!,
              isPrivate:
                hasVisibility(target) && cols.isPrivate ? cols.isPrivate : sql<boolean>`false`,
            })
            .from(target.table)
            .where(inArray(cols.id!, ids)))
            out[String(r.id)] = {
              label: maskPrivate && r.isPrivate ? PRIVATE_LABEL : String(r.title),
            };
        }
      }
    }
    labels[a.key] = out;
  }
  return labels;
}

/**
 * Názvy záznamů podle id (např. zakázky u řádků docházky) bez oprávnění a bez závislosti na modulu entity: když entita
 * v registru není (modul vypnutý), vrátí prázdný objekt. Jen pro popisky; data záznamu to nevydá. První parametr je
 * kontext aktéra (soukromé záznamy se pak pro toho, kdo je nesmí vidět, ukážou jako „Soukromý záznam“), nebo samotná
 * databáze (úlohy a interní použití, bez maskování).
 */
export async function recordTitles(
  viewer: Executor | Ctx,
  registry: EntityRegistry,
  entityKey: string,
  ids: readonly string[],
): Promise<Record<string, string>> {
  const target = registry.get(entityKey);
  if (!target || !ids.length) return {};
  // s kontextem aktéra se názvy soukromých záznamů pro toho, kdo je nesmí vidět, nahradí textem „Soukromý záznam“
  const ctx = "actor" in viewer ? (viewer as Ctx) : null;
  const db = ctx ? ctx.db : (viewer as Executor);
  const cols = getTableColumns(target.table) as Record<string, AnyPgColumn>;
  const titleField = target.attributes.find((t) => t.key === target.titleKey)?.field;
  if (!titleField || !cols[titleField]) return {};
  const masked = !!ctx && !canSeePrivate(ctx) && hasVisibility(target) && !!cols.isPrivate;
  const rows = await db
    .select({
      id: cols.id!,
      title: cols[titleField]!,
      isPrivate: masked ? cols.isPrivate! : sql<boolean>`false`,
    })
    .from(target.table)
    .where(inArray(cols.id!, [...ids]));
  return Object.fromEntries(
    rows.map((r) => [String(r.id), masked && r.isPrivate ? PRIVATE_LABEL : String(r.title)]),
  );
}

/**
 * Názvy záznamů podle id jen z těch záznamů, které aktér smí vidět (oprávnění i rozsah „jen moje“). Cizí záznam se
 * v popisku neobjeví, takže montér nepozná název zakázky, ke které nepatří. Pro popisky u řádků docházky, skladu,
 * strojů a kalendáře; místo `recordTitles` všude, kde odpověď čte uživatel s omezeným rozsahem.
 */
export async function visibleRecordTitles(
  ctx: Ctx,
  registry: EntityRegistry,
  entityKey: string,
  ids: readonly string[],
): Promise<Record<string, string>> {
  const target = registry.get(entityKey);
  if (!target || !ids.length || !scopeOf(ctx, target.permissions.read)) return {};
  const cols = getTableColumns(target.table) as Record<string, AnyPgColumn>;
  const titleField = target.attributes.find((t) => t.key === target.titleKey)?.field;
  if (!titleField || !cols[titleField]) return {};
  const scope = scopeWhere(ctx, {
    def: target,
    attributes: [],
    byKey: new Map(),
    columns: cols,
    customColumn: cols.custom,
  });
  const rows = await ctx.db
    .select({ id: cols.id!, title: cols[titleField]! })
    .from(target.table)
    .where(
      and(
        inArray(cols.id!, [...ids]),
        isNull(cols.deletedAt!),
        scope,
        privateWhere(ctx, { def: target, columns: cols }),
      ),
    );
  return Object.fromEntries(rows.map((r) => [String(r.id), String(r.title)]));
}

function orderBy(
  e: ResolvedEntity,
  sort: z.output<typeof queryInput>["sort"],
  group: string | null | undefined,
) {
  const parts: SQL[] = [];
  const add = (key: string, dir: "asc" | "desc") => {
    const a = e.byKey.get(key);
    if (!a || a.sortable === false) throw new UserError(`Podle atributu „${key}“ nejde řadit.`);
    const x = makeExprs(withBareKey(a), e.columns, e.customColumn);
    const expr =
      a.type === "number" || a.type === "currency"
        ? x.num
        : a.type === "date"
          ? x.sort
          : TEXT_TYPES.includes(a.type)
            ? sql`lower(f_unaccent(${x.text}))`
            : x.text;
    parts.push(dir === "asc" ? sql`${expr} asc nulls last` : sql`${expr} desc nulls last`);
  };
  if (group) add(group, "asc");
  for (const s of sort ?? []) add(s.attr, s.dir);
  parts.push(sql`${e.columns.id} asc`);
  return parts;
}

const AGG_TYPES: AttributeType[] = ["number", "currency"];
/** Součty jsou v SELECT pod aliasem `sum:<atribut>`, aby se nikdy nepřekryly s ostatními sloupci výsledku. */
const SUM = "sum:";
function sumSelects(e: ResolvedEntity) {
  const out: Record<string, SQL<number>> = {};
  for (const a of e.attributes.filter(
    (a) => a.aggregate?.includes("sum") && AGG_TYPES.includes(a.type),
  )) {
    out[SUM + a.key] =
      sql<number>`coalesce(sum(${makeExprs(withBareKey(a), e.columns, e.customColumn).num}), 0)::float8`;
  }
  return out;
}

/** Stránka záznamů: řádky, celkový počet, součty za celou filtrovanou sadu a popisky odkazů. */
export async function queryRecords(
  ctx: Ctx,
  registry: EntityRegistry,
  entity: ResolvedEntity,
  raw: QueryInput = {},
) {
  const e = visibleTo(ctx, entity);
  const input = queryInput.parse(raw);
  const where = whereOf(ctx, e, input);
  const limit = input.limit ?? 100;
  const [rows, [agg]] = await Promise.all([
    ctx.db
      .select()
      .from(e.def.table)
      .where(where)
      .orderBy(...orderBy(e, input.sort, input.group))
      .limit(limit)
      .offset(input.offset ?? 0),
    ctx.db
      .select({ __count: sql<number>`count(*)::int`, ...sumSelects(e) })
      .from(e.def.table)
      .where(where),
  ]);
  const mapped = rows.map((r) => toRow(e, r as Record<string, unknown>));
  const { total, totals } = unpackAggregates(agg);
  return {
    rows: mapped,
    total,
    totals,
    labels: await loadLabels(ctx.db, registry, e, mapped, !canSeePrivate(ctx)),
  };
}

/**
 * Id záznamů, které aktér vidí (s oprávněním a rozsahem, bez smazaných), případně zúžená filtrem. Pro moduly,
 * které z dat jiné entity potřebují jen „kterých se týká“ (fáze viditelných zakázek, vady…); strop chrání paměť.
 */
export async function visibleIds(
  ctx: Ctx,
  entity: ResolvedEntity,
  input: QueryInput = {},
  max = 5000,
): Promise<string[]> {
  const e = visibleTo(ctx, entity);
  const parsed = queryInput.parse(input);
  const rows = await ctx.db
    .select({ id: e.columns.id! })
    .from(e.def.table)
    .where(whereOf(ctx, e, parsed))
    .limit(max);
  return rows.map((r) => String(r.id));
}

/** Rozdělí řádek agregací na počet a součty podle atributů (alias `sum:<atribut>`). */
function unpackAggregates(row: Record<string, unknown> | undefined) {
  const totals: Record<string, number> = {};
  let total = 0;
  for (const [k, v] of Object.entries(row ?? {})) {
    if (k === "__count") total = Number(v);
    else if (k.startsWith(SUM)) totals[k.slice(SUM.length)] = Number(v);
  }
  return { total, totals };
}

export type GroupRow = {
  value: string | boolean | null;
  count: number;
  sums: Record<string, number>;
};

/** Skupiny podle atributu (počet a součty) — záhlaví skupin v tabulce a sloupce kanbanu. */
export async function queryGroups(
  ctx: Ctx,
  entity: ResolvedEntity,
  groupKey: string,
  raw: QueryInput = {},
): Promise<GroupRow[]> {
  const e = visibleTo(ctx, entity);
  const a = e.byKey.get(groupKey);
  if (!a || !["status", "select", "user", "record", "checkbox"].includes(a.type))
    throw new UserError("Podle tohoto atributu nejde seskupovat.");
  const input = queryInput.parse(raw);
  const x = makeExprs(withBareKey(a), e.columns, e.customColumn);
  const valueExpr = a.type === "checkbox" ? x.bool : x.text;
  const rows = await ctx.db
    .select({
      __value: sql<string | boolean | null>`${valueExpr}`,
      __count: sql<number>`count(*)::int`,
      ...sumSelects(e),
    })
    .from(e.def.table)
    .where(whereOf(ctx, e, input))
    .groupBy(valueExpr)
    .orderBy(sql`${valueExpr} asc nulls last`);
  return rows.map((r) => {
    const raw = r as Record<string, unknown>;
    return {
      value: raw.__value as string | boolean | null,
      count: unpackAggregates(raw).total,
      sums: unpackAggregates(raw).totals,
    };
  });
}

type Owners = { ownerIds: (string | null)[]; isPrivate: boolean };

/** Vlastníci a zámek záznamu (bez ověřování oprávnění); `null`, když záznam neexistuje nebo je smazaný. */
async function ownersOf(db: Executor, e: ResolvedEntity, id: string): Promise<Owners | null> {
  const lock = hasVisibility(e.def) && e.columns.isPrivate ? e.columns.isPrivate : undefined;
  if (e.def.owners) {
    const ownerIds = await e.def.owners(db, id);
    if (!ownerIds) return null;
    let isPrivate = false;
    if (lock) {
      const [r] = await db.select({ p: lock }).from(e.def.table).where(eq(e.columns.id!, id));
      isPrivate = r?.p === true;
    }
    return { ownerIds, isPrivate };
  }
  const cols = e.def.ownerColumns ?? [];
  const select = Object.fromEntries(cols.map((c, i) => [`o${i}`, c]));
  const [row] = await db
    .select({ id: e.columns.id!, p: lock ?? sql<boolean>`false`, ...select })
    .from(e.def.table)
    .where(and(eq(e.columns.id!, id), isNull(e.columns.deletedAt!)));
  return row
    ? {
        ownerIds: cols.map(
          (_, i) => ((row as Record<string, unknown>)[`o${i}`] as string | null) ?? null,
        ),
        isPrivate: (row as Record<string, unknown>).p === true,
      }
    : null;
}

/** Načte surový řádek; soukromý záznam pro aktéra bez `private.read` se tváří jako neexistující. */
async function loadRaw(ctx: Ctx, e: ResolvedEntity, id: string) {
  const [raw] = await ctx.db
    .select()
    .from(e.def.table)
    .where(and(eq(e.columns.id!, id), isNull(e.columns.deletedAt!), privateWhere(ctx, e)));
  if (!raw) throw new NotFoundError();
  return raw as Record<string, unknown>;
}

/** Jeden záznam. Záznam, který aktér nesmí vidět, se tváří jako neexistující. */
export async function getRecord(
  ctx: Ctx,
  registry: EntityRegistry,
  entity: ResolvedEntity,
  id: string,
) {
  const e = visibleTo(ctx, entity);
  if (!scopeOf(ctx, e.def.permissions.read)) throw new PermissionError();
  const raw = await loadRaw(ctx, e, id);
  const owners = await ownersOf(ctx.db, e, id);
  if (!can(ctx, e.def.permissions.read, { ownerIds: owners?.ownerIds ?? [] }))
    throw new NotFoundError();
  const row = toRow(e, raw);
  return { row, labels: await loadLabels(ctx.db, registry, e, [row], !canSeePrivate(ctx)) };
}

/** Zkontroluje a normalizuje hodnotu atributu; ověří i existenci odkazovaného záznamu, uživatele či stavu. */
async function checkValue(
  ctx: Ctx,
  registry: EntityRegistry,
  e: ResolvedEntity,
  a: AttributeDef,
  v: unknown,
): Promise<unknown> {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
    if (a.required) throw new UserError(`Pole „${a.label}“ je povinné.`);
    return null;
  }
  let out: unknown;
  try {
    out = normalizeValue(
      {
        type: a.type,
        options: {
          ...(a.choices ? { choices: [...a.choices] } : {}),
          ...(a.record ? { entityType: a.record.entityType } : {}),
        },
      },
      v,
    );
  } catch (err) {
    if (typeof err !== "string") throw err;
    throw new UserError(`Pole „${a.label}“ ${err}.`);
  }
  if ((a.type === "number" || a.type === "currency") && typeof out === "number") {
    if (a.min !== undefined && out < a.min)
      throw new UserError(
        a.min === 0
          ? `Pole „${a.label}“ nesmí být záporné.`
          : `Pole „${a.label}“ nesmí být menší než ${a.type === "currency" ? formatMinor(a.min) : a.min}.`,
      );
    if (a.max !== undefined && out > a.max)
      throw new UserError(
        `Pole „${a.label}“ nesmí být větší než ${a.type === "currency" ? formatMinor(a.max) : a.max}.`,
      );
  }
  if (a.type === "user") {
    const [u] = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(
        and(
          eq(schema.user.id, out as string),
          eq(schema.user.active, true),
          isNull(schema.user.deletedAt),
        ),
      );
    if (!u) throw new UserError(`Pole „${a.label}“: uživatel neexistuje nebo je deaktivovaný.`);
  } else if (a.type === "record") {
    const target = a.record && registry.get(a.record.entityType);
    if (!target) throw new UserError(`Pole „${a.label}“: neznámý typ záznamu.`);
    const cols = getTableColumns(target.table) as Record<string, AnyPgColumn>;
    // soukromý záznam pro toho, kdo ho nesmí vidět, neexistuje (ani jeho id nejde ověřit odkazem)
    const [r] = await ctx.db
      .select({ id: cols.id! })
      .from(target.table)
      .where(
        and(
          eq(cols.id!, out as string),
          isNull(cols.deletedAt!),
          privateWhere(ctx, { def: target, columns: cols }),
        ),
      );
    if (!r) throw new UserError(`Pole „${a.label}“: záznam neexistuje.`);
  } else if (a.type === "status") {
    const pl = a.pipeline && (await getPipeline(ctx.db, a.pipeline.entityType, a.pipeline.key));
    if (!pl || !pl.stages.some((s) => s.id === out))
      throw new UserError(`Pole „${a.label}“: neplatný stav.`);
  }
  return out;
}

function splitPatch(
  e: ResolvedEntity,
  patch: Record<string, unknown>,
  opts: { creating: boolean },
) {
  const native: [AttributeDef, unknown][] = [];
  const custom: [AttributeDef, unknown][] = [];
  for (const [key, value] of Object.entries(patch)) {
    const a = e.byKey.get(key);
    if (!a) throw new UserError(`Neznámý atribut „${key}“.`);
    if (a.readonly && !opts.creating) throw new UserError(`Atribut „${a.label}“ nejde upravit.`);
    (a.custom ? custom : native).push([a, value]);
  }
  return { native, custom };
}

export type UpdateOptions = {
  /** Čas poslední úpravy, ze kterého uživatel vycházel; při neshodě se změna odmítne (kolize úprav). */
  expectedUpdatedAt?: string;
};

/** Názvy vlastností tabulky, které jsou u entity sloupcem rodiče zámku (`visibility.parents`). */
function parentFieldNames(registry: EntityRegistry, def: EntityDef): Set<string> {
  return new Set(parentLinks(registry, def).map((p) => p.fkName));
}

/** Změna atributů záznamu (inline editace). Oprávnění zápisu se ověřuje pro konkrétní záznam. */
export async function updateRecord(
  ctx: Ctx,
  registry: EntityRegistry,
  entity: ResolvedEntity,
  id: string,
  patch: Record<string, unknown>,
  opts: UpdateOptions = {},
) {
  const e = visibleTo(ctx, entity);
  if (!Object.keys(patch).length) throw new UserError("Není co uložit.");
  return inTx(ctx, async (c) => {
    const before = await loadRaw(c, e, id);
    const owners = await ownersOf(c.db, e, id);
    if (!can(c, e.def.permissions.read, { ownerIds: owners?.ownerIds ?? [] }))
      throw new NotFoundError();
    if (!can(c, e.def.permissions.write, { ownerIds: owners?.ownerIds ?? [] }))
      throw new PermissionError();
    if (
      opts.expectedUpdatedAt &&
      (before.updatedAt as Date).toISOString() !== opts.expectedUpdatedAt
    ) {
      throw new UserError("Záznam mezitím někdo změnil. Obnovte stránku a zkuste to znovu.");
    }

    const { native, custom } = splitPatch(e, patch, { creating: false });
    const set: Record<string, unknown> = {};
    const touched: AttributeDef[] = [];
    for (const [a, v] of native) {
      set[a.field!] = await checkValue(c, registry, e, a, v);
      touched.push(a);
    }
    if (custom.length) {
      const merged = { ...((before.custom ?? {}) as Record<string, unknown>) };
      for (const [a, v] of custom) {
        const value = await checkValue(c, registry, e, a, v);
        if (value === null) delete merged[customKey(a)];
        else merged[customKey(a)] = value;
        touched.push(a);
      }
      set.custom = merged;
    }
    const extra = await e.def.beforeUpdate?.(c, before, set);
    if (extra) Object.assign(set, extra);
    if (e.columns.updatedBy) set.updatedBy = c.actor.userId;
    await c.db.update(e.def.table).set(set).where(eq(e.columns.id!, id));

    // změna rodiče (zakázka úkolu, obchod poznámky…) přepočítá zděděný zámek záznamu a jeho potomků
    let after = await loadRaw(c, e, id);
    if (
      hasVisibility(e.def) &&
      Object.keys(set).some((k) => parentFieldNames(registry, e.def).has(k))
    ) {
      if (await refreshInherited(c, registry, e.def, id)) after = await loadRaw(c, e, id);
    }
    const beforeRow = toRow(e, before);
    const row = toRow(e, after);
    const keys = touched.map((a) => a.key);
    await auditChange(c, {
      entityType: e.def.key,
      entityId: id,
      before: await humanView(c.db, registry, e, beforeRow, keys),
      after: await humanView(c.db, registry, e, row, keys),
      summary: String(row[e.def.titleKey] ?? ""),
      isPrivate: after.isPrivate === true,
      entityTitle: String(row[e.def.titleKey] ?? ""),
    });
    await indexRecord(c.db, e, after);
    await e.def.afterUpdate?.(c, before, after);
    return { row, labels: await loadLabels(c.db, registry, e, [row], !canSeePrivate(c)) };
  });
}

/**
 * Založí záznam. Bez zadaných hodnot se doplní výchozí; povinné atributy se kontrolují. Entita se zámkem: hodnota
 * `isPrivate` (jen se `private.read`) určí, zda je záznam soukromý; tvůrce bez `private.read` zakládá vždy sdílené,
 * dítě soukromého rodiče je soukromé samo.
 */
export async function createRecord(
  ctx: Ctx,
  registry: EntityRegistry,
  e: ResolvedEntity,
  values: Record<string, unknown>,
) {
  const key = e.def.permissions.create ?? e.def.permissions.write;
  const scope = scopeOf(ctx, key);
  if (!scope) throw new PermissionError();
  if (e.def.noCreate)
    throw new UserError(
      typeof e.def.noCreate === "string"
        ? e.def.noCreate
        : `${e.def.label.many}: záznamy se zakládají jinde než v seznamu.`,
    );

  return inTx(ctx, async (c) => {
    // zámek se při založení nastavuje zvlášť (`isPrivate`), ne jako běžný atribut
    const { isPrivate: requestedPrivate, ...plain } = values;
    if (requestedPrivate !== undefined && typeof requestedPrivate !== "boolean")
      throw new UserError("Viditelnost záznamu musí být ano/ne.");
    // Atributy jen pro čtení (číslo zakázky…) klient při vytvoření zadat nesmí; doplní je `beforeCreate`.
    let input = Object.fromEntries(
      Object.entries(plain).filter(([k]) => !e.byKey.get(k)?.readonly),
    );
    if (e.def.beforeCreate) input = await e.def.beforeCreate(c, input);
    if (scope === "own" && e.def.ownerDefaults) {
      for (const [k, v] of Object.entries(e.def.ownerDefaults(c)))
        if (input[k] === undefined || input[k] === null) input[k] = v;
    }
    for (const a of e.attributes)
      if (a.default !== undefined && !a.readonly && (input[a.key] ?? null) === null)
        input[a.key] = a.default;
    const { native, custom } = splitPatch(e, input, { creating: true });
    const insert: Record<string, unknown> = {};
    const provided = new Set(Object.keys(input));
    for (const a of e.attributes) {
      if (a.required && !provided.has(a.key) && !a.readonly)
        throw new UserError(`Pole „${a.label}“ je povinné.`);
    }
    for (const [a, v] of native) {
      const value = await checkValue(c, registry, e, a, v);
      if (value !== null) insert[a.field!] = value;
    }
    const customValues: Record<string, unknown> = {};
    for (const [a, v] of custom) {
      const value = await checkValue(c, registry, e, a, v);
      if (value !== null) customValues[customKey(a)] = value;
    }
    if (e.customColumn) insert.custom = customValues;
    if (e.columns.createdBy) insert.createdBy = c.actor.userId;
    if (e.columns.updatedBy) insert.updatedBy = c.actor.userId;
    insert.id = newId();
    if (hasVisibility(e.def))
      Object.assign(
        insert,
        await visibilityForInsert(
          c,
          registry,
          e.def.key,
          insert,
          requestedPrivate as boolean | undefined,
        ),
      );

    const [raw] = await c.db
      .insert(e.def.table)
      .values(insert as never)
      .returning();
    const created = raw as Record<string, unknown>;
    const createdRow = toRow(e, created);
    const isPrivate = created.isPrivate === true;
    if (isPrivate) await syncPrivateRecord(c.db, e.def.key, String(created.id), true);
    const shown = await humanView(
      c.db,
      registry,
      e,
      createdRow,
      e.attributes
        .map((a) => a.key)
        .filter((k) => createdRow[k] !== null && k !== "isPrivate" && k !== "visibilitySource"),
    );
    await recordAudit(c, {
      action: "create",
      entityType: e.def.key,
      entityId: String(created.id),
      summary: String(createdRow[e.def.titleKey] ?? ""),
      changes: Object.entries(shown).map(([field, v]) => ({ field, old: null, new: v })),
      isPrivate,
      entityTitle: String(createdRow[e.def.titleKey] ?? ""),
    });
    await indexRecord(c.db, e, created);

    // tvůrce s rozsahem „jen moje“ musí svůj záznam vidět; jinak by mu hned zmizel
    if (scope === "own") {
      const owners = await ownersOf(c.db, e, String(created.id));
      if (!can(c, e.def.permissions.read, { ownerIds: owners?.ownerIds ?? [] }))
        throw new UserError(
          "Záznam musí mít vás jako vlastníka (máte oprávnění jen k vlastním záznamům).",
        );
    }
    await e.def.afterCreate?.(c, created);
    const seen = visibleTo(c, e);
    const row = toRow(seen, created);
    return { row, labels: await loadLabels(c.db, registry, seen, [row], !canSeePrivate(c)) };
  });
}

/**
 * Smaže záznam (měkce, do koše na 30 dní). Smaže se i všechno podřízené (`children`), které záznam má: jedna dávka
 * (`deleted_batch` = id záznamu), takže obnova vrátí celou dávku.
 */
export async function deleteRecord(ctx: Ctx, e: ResolvedEntity, id: string) {
  if (e.def.noDelete)
    throw new UserError(
      typeof e.def.noDelete === "string"
        ? e.def.noDelete
        : `${e.def.label.many}: záznamy se nemažou.`,
    );
  await inTx(ctx, async (c) => {
    const raw = await loadRaw(c, e, id);
    const owners = await ownersOf(c.db, e, id);
    if (!can(c, e.def.permissions.read, { ownerIds: owners?.ownerIds ?? [] }))
      throw new NotFoundError();
    if (
      !can(c, e.def.permissions.delete ?? e.def.permissions.write, {
        ownerIds: owners?.ownerIds ?? [],
      })
    )
      throw new PermissionError();
    await e.def.beforeDelete?.(c, raw);
    const blocked = await deleteBlockMessage(c, e.def.key, id, e.def.label.one);
    if (blocked) throw new UserError(blocked);
    await deleteTree(c, registryOrSelf(e.def), e.def, id);
  });
}

/**
 * Obnoví smazaný záznam i s podřízenými záznamy, které smazala tatáž dávka. Vyžaduje právo zápisu v rozsahu „vše“
 * (smazaný záznam už vlastníky nepozná); soukromý záznam obnoví jen ten, kdo ho smí vidět.
 */
export async function restoreRecord(ctx: Ctx, e: ResolvedEntity, id: string) {
  if (scopeOf(ctx, e.def.permissions.write) !== "all") throw new PermissionError();
  await inTx(ctx, async (c) => {
    const [raw] = await c.db
      .select()
      .from(e.def.table)
      .where(and(eq(e.columns.id!, id), privateWhere(c, e)));
    if (!raw || !(raw as Record<string, unknown>).deletedAt) throw new NotFoundError();
    await restoreTree(c, registryOrSelf(e.def), e.def, id, async (def, row) => {
      const resolved = def.key === e.def.key ? e : await resolveEntity(c.db, def);
      await indexRecord(c.db, resolved, row);
    });
  });
}

/** Zjistí vlastníky záznamu bez ověřování oprávnění — pro politiku přístupu komentářů, úkolů a souborů. */
export async function recordOwners(db: Executor, e: ResolvedEntity, id: string) {
  const owners = await ownersOf(db, e, id);
  return owners ? { ownerIds: owners.ownerIds, isPrivate: owners.isPrivate } : null;
}

/** Zaregistruje politiky přístupu všech entit (komentáře, úkoly a soubory se řídí oprávněním k záznamu). */
export function registerEntityPolicies(registry: EntityRegistry): void {
  setActiveRegistry(registry);
  for (const def of registry.all()) {
    const columns = getTableColumns(def.table) as Record<string, AnyPgColumn>;
    const e: ResolvedEntity = {
      def,
      attributes: [...def.attributes],
      byKey: new Map(def.attributes.map((a) => [a.key, a])),
      columns,
      customColumn: columns.custom,
    };
    registerEntityPolicy({
      entityType: def.key,
      read: def.permissions.read,
      write: def.permissions.write,
      owners: (db, id) => ownersOf(db, e, id),
      url: def.url,
    });
  }
}

/**
 * Stavební kameny dotazů pro agregace nástěnek (`aggregate.ts`): podmínka (smazané, rozsah „jen moje“, filtry),
 * SQL výrazy atributu a popisky odkazů. Mimo jádro se nepoužívají, aby oprávnění šla vždy přes jedno místo.
 */
export { whereOf as buildEntityWhere, withBareKey, loadLabels as loadEntityLabels };
