import { and, desc, eq, lt, sql } from "drizzle-orm";
import { schema } from "../db/client";
import { visibleRecordTitles, type EntityRegistry } from "../entities/engine";
import type { Ctx } from "../rbac/types";

/** Kolik naposledy otevřených záznamů se pamatuje na uživatele (HLE-02). */
export const RECENT_LIMIT = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Zapamatuje otevřený záznam pro „Nedávné“ v paletě (`recent_record`): jeden řádek na záznam, drží se posledních
 * `RECENT_LIMIT`. Opakované otevření v krátké době (obnovení dat, realtime) řádek nepřepisuje. Neukládá nic pro
 * neznámý typ a pro záznam bez id ve tvaru UUID.
 */
export async function trackRecent(
  ctx: Ctx,
  registry: EntityRegistry,
  entityType: string,
  entityId: string,
): Promise<void> {
  const me = ctx.actor.userId;
  if (!me || !UUID.test(entityId) || !registry.get(entityType)) return;
  const r = schema.recentRecord;
  const written = await ctx.db
    .insert(r)
    .values({ userId: me, entityType, entityId })
    .onConflictDoUpdate({
      target: [r.userId, r.entityType, r.entityId],
      set: { visitedAt: new Date() },
      setWhere: lt(r.visitedAt, sql`now() - interval '20 seconds'`),
    })
    .returning({ id: r.entityId });
  if (!written.length) return; // znovu načtený záznam v krátké době: nic se nemění
  // nad limit se starší řádky smažou
  const keep = await ctx.db
    .select({ t: r.entityType, id: r.entityId })
    .from(r)
    .where(eq(r.userId, me))
    .orderBy(desc(r.visitedAt))
    .limit(RECENT_LIMIT);
  if (keep.length < RECENT_LIMIT) return;
  const oldest = keep[keep.length - 1]!;
  await ctx.db
    .delete(r)
    .where(
      and(
        eq(r.userId, me),
        sql`${r.visitedAt} < (select visited_at from recent_record where user_id = ${me} and entity_type = ${oldest.t} and entity_id = ${oldest.id})`,
      ),
    );
}

/** Naposledy otevřený záznam pro paletu Cmd+K (název, typ a adresa). */
export type RecentItem = {
  entityType: string;
  id: string;
  title: string;
  label: string;
  url: string;
};

/**
 * Posledních `RECENT_LIMIT` otevřených záznamů uživatele. Názvy se načítají přes engine s viditelností: záznam, který
 * uživatel už nesmí vidět (zamčený, smazaný), se v nabídce neobjeví.
 */
export async function listRecent(ctx: Ctx, registry: EntityRegistry): Promise<RecentItem[]> {
  const me = ctx.actor.userId;
  if (!me) return [];
  const r = schema.recentRecord;
  const rows = await ctx.db
    .select({ t: r.entityType, id: r.entityId })
    .from(r)
    .where(eq(r.userId, me))
    .orderBy(desc(r.visitedAt))
    .limit(RECENT_LIMIT);
  const byType = new Map<string, string[]>();
  for (const x of rows) byType.set(x.t, [...(byType.get(x.t) ?? []), x.id]);
  const titles = new Map<string, string>();
  for (const [type, ids] of byType)
    for (const [id, title] of Object.entries(await visibleRecordTitles(ctx, registry, type, ids)))
      titles.set(`${type}:${id}`, title);
  return rows.flatMap((x) => {
    const def = registry.get(x.t);
    const title = titles.get(`${x.t}:${x.id}`);
    return def && title !== undefined
      ? [{ entityType: x.t, id: x.id, title, label: def.label.one, url: def.url(x.id) }]
      : [];
  });
}
