import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { schema, type Executor } from "../db/client";
import { can, canSeePrivate, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import type { AttributeDef, EntityDef } from "./types";
import { findActiveRegistry } from "./active-registry";
import { phoneKeysInText, phoneQueryKey } from "./phone-index";
import { privateScope } from "./visibility";

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
  // text, který není ve sloupcích záznamu (všechny telefony a e-maily osoby): `searchLoad` z registru entit (C3)
  const load = findActiveRegistry()?.get(e.def.key)?.searchLoad ?? e.def.searchLoad;
  const loaded = load ? ((await load(db, [raw]))[String(raw.id)] ?? "") : "";
  const base = [doc.title, doc.subtitle, doc.extra, customSearchText(e, raw), loaded]
    .filter(Boolean)
    .join(" ");
  // každý telefon v textu dostane klíč bez předvolby a mezer, aby „777 12“ našlo „+420 777 123 456“
  const text = normalize([base, ...phoneKeysInText(base)].join(" "));
  await db
    .insert(schema.searchDocument)
    .values({
      entityType: e.def.key,
      entityId: String(raw.id),
      title: doc.title,
      subtitle: doc.subtitle ?? null,
      searchText: text,
      isPrivate: raw.isPrivate === true,
    })
    .onConflictDoUpdate({
      target: [schema.searchDocument.entityType, schema.searchDocument.entityId],
      set: {
        title: doc.title,
        subtitle: doc.subtitle ?? null,
        searchText: text,
        isPrivate: raw.isPrivate === true,
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
  /** Množné číslo názvu typu (nadpis skupiny v paletě). */
  labelMany: string;
  /** Telefon, e-mail a složka na Disku záznamu (akce v paletě bez otevření záznamu: zavolat, napsat, otevřít Disk). */
  phone: string | null;
  email: string | null;
  driveFolderId: string | null;
  /** Soukromý záznam (vidí ho jen ten, kdo smí vidět soukromé). */
  isPrivate: boolean;
};

/** Sloupce záznamu, ze kterých se berou akce v paletě (první existující). */
const PHONE_COLS = ["primaryPhone", "phone"];
const EMAIL_COLS = ["primaryEmail", "email"];
const firstCol = (cols: Record<string, AnyPgColumn>, names: string[]) =>
  names.map((n) => cols[n]).find((c) => !!c);

/**
 * Hledání napříč entitami (Cmd+K) bez ohledu na diakritiku a velikost písmen; telefon bez ohledu na mezery a předvolbu
 * („777 12“ najde „+420 777 123 456“). Kandidáty vybere trigramový index, potom se každý ověří proti oprávnění, rozsahu
 * a zámku aktéra (`privateScope`), takže v nálezech jsou jen záznamy, které smí vidět. Výsledky jsou seřazené: shoda
 * začátku názvu, pak podobnost; z jednoho typu nejvýše `perType` (skupiny v paletě).
 */
export async function searchAll(
  ctx: Ctx,
  defs: readonly EntityDef[],
  query: string,
  limit = 12,
  opts: { perType?: number } = {},
): Promise<SearchHit[]> {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  const readable = defs.filter((d) => scopeOf(ctx, d.permissions.read));
  if (!readable.length) return [];

  const seePrivate = canSeePrivate(ctx);
  const esc = (x: string) => "%" + x.replace(/[\\%_]/g, "\\$&") + "%";
  const phoneKey = phoneQueryKey(query);
  const textMatch = sql`${schema.searchDocument.searchText} like ${esc(q)} escape '\\'`;
  const match = phoneKey
    ? or(textMatch, sql`${schema.searchDocument.searchText} like ${esc(phoneKey)} escape '\\'`)
    : textMatch;
  const candidates = await ctx.db
    .select()
    .from(schema.searchDocument)
    .where(
      and(
        inArray(
          schema.searchDocument.entityType,
          readable.map((d) => d.key),
        ),
        match,
        // soukromé záznamy se bez `private.read` nenajdou (ani pořadím výsledků neprozradí)
        seePrivate ? undefined : sql`not ${schema.searchDocument.isPrivate}`,
      ),
    )
    .orderBy(
      sql`(lower(f_unaccent(${schema.searchDocument.title})) like ${q.replace(/[\\%_]/g, "\\$&") + "%"}) desc`,
      sql`similarity(${schema.searchDocument.searchText}, ${q}) desc`,
      schema.searchDocument.title,
    )
    .limit(limit * 6);

  const hits: SearchHit[] = [];
  for (const def of readable) {
    const mine = candidates.filter((c) => c.entityType === def.key);
    if (!mine.length) continue;
    const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
    const scope = scopeOf(ctx, def.permissions.read);
    const lock =
      def.visibility && cols.isPrivate
        ? privateScope(ctx, { isPrivate: cols.isPrivate })
        : undefined;
    let pred: SQL | undefined;
    if (scope !== "all") {
      const me = ctx.actor.userId;
      const ownerCols = def.ownerColumns ?? [];
      pred = def.scope
        ? def.scope(ctx)
        : me && ownerCols.length
          ? or(...ownerCols.map((c) => eq(c, me)))
          : sql`false`;
    }
    const phoneCol = firstCol(cols, PHONE_COLS);
    const emailCol = firstCol(cols, EMAIL_COLS);
    const driveCol = cols.driveFolderId;
    const rows = await ctx.db
      .select({
        id: cols.id!,
        phone: phoneCol ?? sql<string | null>`null`,
        email: emailCol ?? sql<string | null>`null`,
        drive: driveCol ?? sql<string | null>`null`,
        isPrivate: def.visibility && cols.isPrivate ? cols.isPrivate : sql<boolean>`false`,
      })
      .from(def.table)
      .where(
        and(
          inArray(
            cols.id!,
            mine.map((m) => m.entityId),
          ),
          isNull(cols.deletedAt!),
          pred,
          lock,
        ),
      );
    const allowed = new Map(rows.map((r) => [String(r.id), r]));
    for (const m of mine) {
      const r = allowed.get(m.entityId);
      if (!r) continue;
      hits.push({
        entityType: def.key,
        id: m.entityId,
        title: m.title,
        subtitle: m.subtitle,
        url: def.url(m.entityId),
        label: def.label.one,
        labelMany: def.label.many,
        phone: (r.phone as string | null) ?? null,
        email: (r.email as string | null) ?? null,
        driveFolderId: (r.drive as string | null) ?? null,
        isPrivate: r.isPrivate === true,
      });
    }
  }
  const order = new Map(candidates.map((c, i) => [`${c.entityType}:${c.entityId}`, i]));
  const perType = opts.perType ?? limit;
  const used = new Map<string, number>();
  return hits
    .sort(
      (a, b) =>
        (order.get(`${a.entityType}:${a.id}`) ?? 0) - (order.get(`${b.entityType}:${b.id}`) ?? 0),
    )
    .filter((h) => {
      const n = (used.get(h.entityType) ?? 0) + 1;
      used.set(h.entityType, n);
      return n <= perType;
    })
    .slice(0, limit);
}

export { can };
