import { and, count, desc, eq, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getTableColumns } from "drizzle-orm";
import { recordAudit } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import type { EntityRegistry } from "../entities/engine";
import { childLinks } from "../entities/links";
import { privateScope } from "../entities/visibility";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { assertCan, canSeePrivate, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { TRASH_RETENTION_DAYS } from "./tree";
import type { EntityDef } from "../entities/types";

type Row = Record<string, unknown>;
const cols = (d: EntityDef) => getTableColumns(d.table) as Record<string, AnyPgColumn>;
const titleField = (d: EntityDef) => d.attributes.find((a) => a.key === d.titleKey)?.field;

/** Položka koše: smazaný záznam (kořen dávky) a kolik podřízených záznamů smazal s sebou. */
export type TrashItem = {
  entityType: string;
  entityLabel: string;
  id: string;
  title: string;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName: string | null;
  /** Kolik podřízených záznamů se smazalo spolu s ním (obnova je vrátí). */
  children: number;
  /** Kolik dní zbývá do trvalého smazání. */
  daysLeft: number;
  isPrivate: boolean;
};

/**
 * Kořeny smazaných záznamů pro koš. Vlastník (`private.read`) vidí všechny, ostatní jen záznamy, které sami smazali a
 * které nejsou soukromé (`trash.read`). Filtr `entity` (typ) a `q` (v názvu); řazeno od nejnověji smazaných.
 */
export async function listTrash(
  ctx: Ctx,
  registry: EntityRegistry,
  opts: { entity?: string; q?: string; limit?: number; offset?: number } = {},
): Promise<{ items: TrashItem[]; total: number }> {
  assertCan(ctx, "trash.read");
  const seeAll = canSeePrivate(ctx);
  const limit = Math.min(opts.limit ?? 50, 200);
  const all: TrashItem[] = [];
  let total = 0;
  const now = Date.now();
  for (const def of registry.all()) {
    if (opts.entity && def.key !== opts.entity) continue;
    if (!scopeOf(ctx, def.permissions.read)) continue;
    const c = cols(def);
    if (!c.deletedAt) continue;
    const tf = titleField(def);
    const where: (SQL | undefined)[] = [
      isNotNull(c.deletedAt),
      c.deletedBatch ? or(sql`${c.deletedBatch} is null`, eq(c.deletedBatch, c.id!)) : undefined,
      seeAll ? undefined : c.deletedBy ? eq(c.deletedBy, ctx.actor.userId ?? "") : sql`false`,
      def.visibility && c.isPrivate ? privateScope(ctx, { isPrivate: c.isPrivate }) : undefined,
      opts.q && tf && c[tf]
        ? sql`lower(f_unaccent(${c[tf]}::text)) like lower(f_unaccent(${"%" + opts.q.replace(/[\\%_]/g, "\\$&") + "%"})) escape '\\'`
        : undefined,
    ];
    const w = and(...where);
    const [n] = await ctx.db.select({ n: count() }).from(def.table).where(w);
    total += Number(n?.n ?? 0);
    const rows = (await ctx.db
      .select({
        id: c.id!,
        title: tf && c[tf] ? c[tf]! : sql<string>`''`,
        deletedAt: c.deletedAt,
        deletedBy: c.deletedBy ?? sql<string | null>`null`,
        isPrivate: def.visibility && c.isPrivate ? c.isPrivate : sql<boolean>`false`,
      })
      .from(def.table)
      .where(w)
      .orderBy(desc(c.deletedAt))
      .limit(limit)) as Row[];
    for (const r of rows) {
      const at = r.deletedAt as Date;
      all.push({
        entityType: def.key,
        entityLabel: def.label.one,
        id: String(r.id),
        title: String(r.title ?? ""),
        deletedAt: at.toISOString(),
        deletedBy: (r.deletedBy as string | null) ?? null,
        deletedByName: null,
        children: 0,
        daysLeft: Math.max(0, TRASH_RETENTION_DAYS - Math.floor((now - at.getTime()) / 86_400_000)),
        isPrivate: r.isPrivate === true,
      });
    }
  }
  all.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const page = all.slice(opts.offset ?? 0, (opts.offset ?? 0) + limit);
  const userIds = [...new Set(page.map((p) => p.deletedBy).filter((x): x is string => !!x))];
  if (userIds.length) {
    const users = await ctx.db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .where(inArray(schema.user.id, userIds));
    for (const p of page) p.deletedByName = users.find((u) => u.id === p.deletedBy)?.name ?? null;
  }
  // počet podřízených záznamů dávky
  for (const p of page) {
    const def = registry.get(p.entityType)!;
    let n = 0;
    for (const l of childLinks(registry, def.key)) {
      if (!l.columns.deletedBatch) continue;
      const [x] = await ctx.db
        .select({ n: count() })
        .from(l.table)
        .where(eq(l.columns.deletedBatch, p.id));
      n += Number(x?.n ?? 0);
    }
    p.children = n;
  }
  return { items: page, total };
}

/** Tabulky, jejichž řádky patří záznamu přes `typ + id` (komentáře, přílohy, indexy) a smažou se s ním. */
async function dropPolymorphic(db: Executor, entityType: string, id: string) {
  await db
    .delete(schema.comment)
    .where(and(eq(schema.comment.entityType, entityType), eq(schema.comment.entityId, id)));
  await db
    .delete(schema.attachment)
    .where(and(eq(schema.attachment.entityType, entityType), eq(schema.attachment.entityId, id)));
  await db
    .delete(schema.searchDocument)
    .where(
      and(eq(schema.searchDocument.entityType, entityType), eq(schema.searchDocument.entityId, id)),
    );
  await db
    .delete(schema.privateRecord)
    .where(
      and(eq(schema.privateRecord.entityType, entityType), eq(schema.privateRecord.entityId, id)),
    );
  await db
    .delete(schema.recentRecord)
    .where(
      and(eq(schema.recentRecord.entityType, entityType), eq(schema.recentRecord.entityId, id)),
    );
}

/** Natvrdo smaže záznam a všechno podřízené (nejdřív děti). Volat v transakci; vrací počet smazaných řádků. */
export async function purgeTree(
  c: Ctx,
  registry: EntityRegistry,
  def: EntityDef,
  id: string,
  depth = 0,
): Promise<number> {
  if (depth > 5) return 0;
  let n = 0;
  for (const l of childLinks(registry, def.key)) {
    if (!l.def) {
      await c.db.delete(l.table).where(eq(l.fk, id)); // tabulka, která není entita (fáze, účastníci, historie)
      continue;
    }
    const rows = (await c.db
      .select({ id: l.columns.id! })
      .from(l.table)
      .where(eq(l.fk, id))) as Row[];
    for (const r of rows) {
      if (l.def.key === def.key && String(r.id) === id) continue;
      n += await purgeTree(c, registry, l.def, String(r.id), depth + 1);
    }
  }
  const dc = cols(def);
  await dropPolymorphic(c.db, def.key, id);
  await c.db.delete(def.table).where(eq(dc.id!, id));
  return n + 1;
}

/**
 * Trvale smaže záznam z koše (včetně podřízených). Jen s `trash.purge` a jen záznam, který v koši je; historie změn
 * zůstává (s názvem záznamu). UI před voláním vyžaduje potvrzení.
 */
export async function purgeRecord(
  ctx: Ctx,
  registry: EntityRegistry,
  entityType: string,
  id: string,
): Promise<void> {
  assertCan(ctx, "trash.purge");
  const def = registry.get(entityType);
  if (!def) throw new UserError("Neznámý typ záznamu.");
  const dc = cols(def);
  await inTx(ctx, async (c) => {
    const [raw] = (await c.db
      .select()
      .from(def.table)
      .where(and(eq(dc.id!, id), isNotNull(dc.deletedAt!)))) as Row[];
    if (!raw) throw new NotFoundError();
    if (raw.isPrivate === true && !canSeePrivate(c)) throw new PermissionError();
    const tf = titleField(def);
    await recordAudit(c, {
      action: "purge",
      entityType: def.key,
      entityId: id,
      summary: tf ? String(raw[tf] ?? "") : "",
      entityTitle: tf ? String(raw[tf] ?? "") : null,
      isPrivate: raw.isPrivate === true,
    });
    await purgeTree(c, registry, def, id);
  });
}

/**
 * Úklid koše: smaže natrvalo kořeny smazané před více než 30 dny (nejdřív děti). Selhání jednoho záznamu (vazba z cizí
 * tabulky) neshodí ostatní. Vrací počet smazaných kořenů.
 */
export async function purgeExpiredTrash(
  ctx: Ctx,
  registry: EntityRegistry,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 86_400_000);
  let purged = 0;
  for (const def of registry.all()) {
    const c = cols(def);
    if (!c.deletedAt) continue;
    const roots = (await ctx.db
      .select({ id: c.id!, p: def.visibility && c.isPrivate ? c.isPrivate : sql<boolean>`false` })
      .from(def.table)
      .where(
        and(
          lt(c.deletedAt, cutoff),
          c.deletedBatch
            ? or(sql`${c.deletedBatch} is null`, eq(c.deletedBatch, c.id!))
            : undefined,
        ),
      )
      .limit(500)) as Row[];
    for (const r of roots) {
      try {
        await inTx(ctx, async (t) => {
          await recordAudit(t, {
            action: "purge",
            entityType: def.key,
            entityId: String(r.id),
            summary: "Trvale smazáno po 30 dnech v koši",
            isPrivate: r.p === true,
          });
          await purgeTree(t, registry, def, String(r.id));
        });
        purged++;
      } catch {
        /* záznam drží cizí vazba; zkusí se příště */
      }
    }
  }
  return purged;
}
