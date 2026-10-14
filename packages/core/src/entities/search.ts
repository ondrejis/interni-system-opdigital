import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { schema, type Executor } from "../db/client";
import { can, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import type { AttributeDef, EntityDef } from "./types";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

type Indexed = { def: EntityDef; attributes?: readonly AttributeDef[] };

/** Typy vlastních polí, jejichž hodnota se dá hledat jako text. */
const SEARCHABLE_CUSTOM = ["text", "longtext", "email", "phone", "url", "select", "multiselect"];

/** Text z vlastních polí záznamu (hodnoty textových polí a popisky vybraných možností) pro hledání. */
function customSearchText(e: Indexed, raw: Record<string, unknown>): string {
  const values = (raw.custom ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  for (const a of e.attributes ?? []) {
    if (!a.custom || !SEARCHABLE_CUSTOM.includes(a.type) || a.searchable === false) continue;
    const v = values[a.key.slice("custom.".length)];
    if (v === null || v === undefined) continue;
    const label = (x: unknown) => a.choices?.find((c) => c.value === x)?.label ?? String(x);
    if (Array.isArray(v)) parts.push(...v.map(label));
    else parts.push(a.type === "select" ? label(v) : String(v));
  }
  return parts.join(" ");
}

/** Zapíše záznam do indexu pro hledání (ve stejné transakci jako změna záznamu). */
export async function indexRecord(
  db: Executor,
  e: Indexed,
  raw: Record<string, unknown>,
): Promise<void> {
  if (!e.def.search || raw.deletedAt) return;
  const doc = e.def.search(raw);
  const text = normalize(
    [doc.title, doc.subtitle, doc.extra, customSearchText(e, raw)].filter(Boolean).join(" "),
  );
  await db
    .insert(schema.searchDocument)
    .values({
      entityType: e.def.key,
      entityId: String(raw.id),
      title: doc.title,
      subtitle: doc.subtitle ?? null,
      searchText: text,
    })
    .onConflictDoUpdate({
      target: [schema.searchDocument.entityType, schema.searchDocument.entityId],
      set: {
        title: doc.title,
        subtitle: doc.subtitle ?? null,
        searchText: text,
        updatedAt: new Date(),
      },
    });
}

/**
 * Znovu zaindexuje všechny záznamy entity (po změně vlastních polí: nový popisek možnosti, skryté nebo smazané pole).
 * Po dávkách, aby se nenačetla celá tabulka najednou.
 */
export async function reindexEntity(
  db: Executor,
  e: Indexed & { columns: Record<string, AnyPgColumn> },
) {
  if (!e.def.search) return 0;
  const idCol = e.columns.id!;
  let done = 0;
  for (let offset = 0; ; offset += 500) {
    const rows = await db
      .select()
      .from(e.def.table)
      .where(isNull(e.columns.deletedAt!))
      .orderBy(idCol)
      .limit(500)
      .offset(offset);
    if (!rows.length) break;
    for (const r of rows) await indexRecord(db, e, r as Record<string, unknown>);
    done += rows.length;
    if (rows.length < 500) break;
  }
  return done;
}

export async function removeFromIndex(db: Executor, entityType: string, id: string): Promise<void> {
  await db
    .delete(schema.searchDocument)
    .where(
      and(eq(schema.searchDocument.entityType, entityType), eq(schema.searchDocument.entityId, id)),
    );
}

export type SearchHit = {
  entityType: string;
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
  label: string;
};

/**
 * Hledání napříč entitami (Cmd+K) bez ohledu na diakritiku a velikost písmen. Kandidáty vybere trigramový
 * index, potom se každý ověří proti oprávnění a rozsahu aktéra — v nálezech jsou jen záznamy, které smí vidět.
 */
export async function searchAll(
  ctx: Ctx,
  defs: readonly EntityDef[],
  query: string,
  limit = 12,
): Promise<SearchHit[]> {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  const readable = defs.filter((d) => scopeOf(ctx, d.permissions.read));
  if (!readable.length) return [];

  const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  const candidates = await ctx.db
    .select()
    .from(schema.searchDocument)
    .where(
      and(
        inArray(
          schema.searchDocument.entityType,
          readable.map((d) => d.key),
        ),
        sql`${schema.searchDocument.searchText} like ${pattern} escape '\\'`,
      ),
    )
    .orderBy(
      sql`similarity(${schema.searchDocument.searchText}, ${q}) desc`,
      schema.searchDocument.title,
    )
    .limit(limit * 4);

  const hits: SearchHit[] = [];
  for (const def of readable) {
    const mine = candidates.filter((c) => c.entityType === def.key);
    if (!mine.length) continue;
    const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
    const scope = scopeOf(ctx, def.permissions.read);
    let allowed: Set<string>;
    if (scope === "all") {
      const rows = await ctx.db
        .select({ id: cols.id! })
        .from(def.table)
        .where(
          and(
            inArray(
              cols.id!,
              mine.map((m) => m.entityId),
            ),
            isNull(cols.deletedAt!),
          ),
        );
      allowed = new Set(rows.map((r) => String(r.id)));
    } else {
      const me = ctx.actor.userId;
      const ownerCols = def.ownerColumns ?? [];
      const pred = def.scope
        ? def.scope(ctx)
        : me && ownerCols.length
          ? or(...ownerCols.map((c) => eq(c, me)))
          : sql`false`;
      const rows = await ctx.db
        .select({ id: cols.id! })
        .from(def.table)
        .where(
          and(
            inArray(
              cols.id!,
              mine.map((m) => m.entityId),
            ),
            isNull(cols.deletedAt!),
            pred,
          ),
        );
      allowed = new Set(rows.map((r) => String(r.id)));
    }
    for (const m of mine) {
      if (allowed.has(m.entityId))
        hits.push({
          entityType: def.key,
          id: m.entityId,
          title: m.title,
          subtitle: m.subtitle,
          url: def.url(m.entityId),
          label: def.label.one,
        });
    }
  }
  const order = new Map(candidates.map((c, i) => [`${c.entityType}:${c.entityId}`, i]));
  return hits
    .sort(
      (a, b) =>
        (order.get(`${a.entityType}:${a.id}`) ?? 0) - (order.get(`${b.entityType}:${b.id}`) ?? 0),
    )
    .slice(0, limit);
}

export { can };
