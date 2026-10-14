import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "../audit/audit";
import { schema, type Executor } from "../db/client";
import { inTx } from "../rbac/context";
import { NotFoundError, UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

export type LookupDef = {
  key: string;
  name: string;
  items: readonly { value: string; label: string; color?: string }[];
};

/** Založí číselník z výchozí definice, pokud neexistuje (seed klienta). */
export async function ensureLookup(executor: Executor, def: LookupDef): Promise<string> {
  return executor.transaction(async (db) => {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`lookup:${def.key}`}))`);
    return createLookup(db, def);
  });
}

async function createLookup(db: Executor, def: LookupDef): Promise<string> {
  const [existing] = await db
    .select({ id: schema.lookupList.id })
    .from(schema.lookupList)
    .where(and(eq(schema.lookupList.key, def.key), isNull(schema.lookupList.deletedAt)));
  if (existing) return existing.id;
  const [l] = await db
    .insert(schema.lookupList)
    .values({ key: def.key, name: def.name })
    .returning({ id: schema.lookupList.id });
  if (def.items.length) {
    await db.insert(schema.lookupItem).values(
      def.items.map((it, i) => ({
        listId: l!.id,
        value: it.value,
        label: it.label,
        color: it.color ?? null,
        position: i,
      })),
    );
  }
  return l!.id;
}

/** Položky číselníku v pořadí; ve výchozím stavu jen aktivní. */
export async function getLookup(
  db: Executor,
  key: string,
  opts: { includeInactive?: boolean } = {},
) {
  return db
    .select({
      id: schema.lookupItem.id,
      value: schema.lookupItem.value,
      label: schema.lookupItem.label,
      color: schema.lookupItem.color,
      active: schema.lookupItem.active,
      position: schema.lookupItem.position,
    })
    .from(schema.lookupItem)
    .innerJoin(schema.lookupList, eq(schema.lookupItem.listId, schema.lookupList.id))
    .where(
      and(
        eq(schema.lookupList.key, key),
        isNull(schema.lookupList.deletedAt),
        isNull(schema.lookupItem.deletedAt),
        opts.includeInactive ? undefined : eq(schema.lookupItem.active, true),
      ),
    )
    .orderBy(asc(schema.lookupItem.position), asc(schema.lookupItem.label));
}

/** Přidá položku. `value` je stabilní klíč (nejde měnit), `label` jde přejmenovat. */
export async function addLookupItem(
  ctx: Ctx,
  key: string,
  item: { value: string; label: string; color?: string },
) {
  assertCan(ctx, "settings.manage");
  if (!/^[a-z0-9_]+$/.test(item.value))
    throw new UserError("Hodnota smí mít jen malá písmena, číslice a podtržítko.");
  if (!item.label.trim()) throw new UserError("Vyplňte název položky.");
  return inTx(ctx, async (c) => {
    const [list] = await c.db
      .select()
      .from(schema.lookupList)
      .where(and(eq(schema.lookupList.key, key), isNull(schema.lookupList.deletedAt)));
    if (!list) throw new NotFoundError("Číselník nenalezen.");
    const dup = await c.db
      .select({ id: schema.lookupItem.id })
      .from(schema.lookupItem)
      .where(and(eq(schema.lookupItem.listId, list.id), eq(schema.lookupItem.value, item.value)));
    if (dup.length) throw new UserError("Položka s touto hodnotou už existuje.");
    const items = await c.db
      .select({ id: schema.lookupItem.id, label: schema.lookupItem.label })
      .from(schema.lookupItem)
      .where(and(eq(schema.lookupItem.listId, list.id), isNull(schema.lookupItem.deletedAt)));
    if (items.some((i) => i.label.trim().toLowerCase() === item.label.trim().toLowerCase()))
      throw new UserError("Položka s tímto názvem už v číselníku je.");
    const [row] = await c.db
      .insert(schema.lookupItem)
      .values({
        listId: list.id,
        value: item.value,
        label: item.label.trim(),
        color: item.color ?? null,
        position: items.length,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "lookup_item",
      entityId: row!.id,
      summary: `${key}: ${item.label}`,
      changes: [{ field: "label", old: null, new: item.label }],
    });
    return row!;
  });
}

/** Přejmenuje nebo (de)aktivuje položku. Mazání se nedělá — záznamy se na hodnotu odkazují. */
export async function updateLookupItem(
  ctx: Ctx,
  itemId: string,
  patch: { label?: string; color?: string | null; active?: boolean },
) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [before] = await c.db
      .select()
      .from(schema.lookupItem)
      .where(and(eq(schema.lookupItem.id, itemId), isNull(schema.lookupItem.deletedAt)));
    if (!before) throw new NotFoundError("Položka nenalezena.");
    if (patch.label !== undefined && !patch.label.trim())
      throw new UserError("Vyplňte název položky.");
    if (patch.label !== undefined) {
      const siblings = await c.db
        .select({ id: schema.lookupItem.id, label: schema.lookupItem.label })
        .from(schema.lookupItem)
        .where(
          and(eq(schema.lookupItem.listId, before.listId), isNull(schema.lookupItem.deletedAt)),
        );
      if (
        siblings.some(
          (i) =>
            i.id !== itemId && i.label.trim().toLowerCase() === patch.label!.trim().toLowerCase(),
        )
      )
        throw new UserError("Položka s tímto názvem už v číselníku je.");
    }
    const after = {
      label: patch.label?.trim() || before.label,
      color: patch.color === undefined ? before.color : patch.color,
      active: patch.active ?? before.active,
    };
    await c.db
      .update(schema.lookupItem)
      .set({ ...after, updatedBy: c.actor.userId })
      .where(eq(schema.lookupItem.id, itemId));
    const changes = (["label", "color", "active"] as const)
      .filter((f) => after[f] !== before[f])
      .map((f) => ({ field: f, old: before[f], new: after[f] }));
    if (changes.length)
      await recordAudit(c, {
        action: "update",
        entityType: "lookup_item",
        entityId: itemId,
        changes,
      });
  });
}

/** Všechny číselníky s položkami včetně neaktivních (pro správu v administraci). */
export async function listLookups(db: Executor) {
  const lists = await db
    .select()
    .from(schema.lookupList)
    .where(isNull(schema.lookupList.deletedAt))
    .orderBy(asc(schema.lookupList.name));
  const out = [];
  for (const l of lists) {
    out.push({
      id: l.id,
      key: l.key,
      name: l.name,
      items: await getLookup(db, l.key, { includeInactive: true }),
    });
  }
  return out;
}

/** Přeuspořádá položky číselníku; `orderedIds` musí obsahovat všechny položky (i neaktivní) právě jednou. */
export async function reorderLookupItems(ctx: Ctx, key: string, orderedIds: readonly string[]) {
  assertCan(ctx, "settings.manage");
  await inTx(ctx, async (c) => {
    const [list] = await c.db
      .select()
      .from(schema.lookupList)
      .where(and(eq(schema.lookupList.key, key), isNull(schema.lookupList.deletedAt)));
    if (!list) throw new NotFoundError("Číselník nenalezen.");
    const current = await c.db
      .select({ id: schema.lookupItem.id })
      .from(schema.lookupItem)
      .where(and(eq(schema.lookupItem.listId, list.id), isNull(schema.lookupItem.deletedAt)));
    const same =
      current.length === orderedIds.length &&
      new Set(orderedIds).size === orderedIds.length &&
      current.every((s) => orderedIds.includes(s.id));
    if (!same) throw new UserError("Pořadí musí obsahovat všechny položky právě jednou.");
    for (const [i, id] of orderedIds.entries()) {
      await c.db
        .update(schema.lookupItem)
        .set({ position: i, updatedBy: c.actor.userId })
        .where(eq(schema.lookupItem.id, id));
    }
    await recordAudit(c, {
      action: "reorder",
      entityType: "lookup_list",
      entityId: list.id,
      summary: `Změněno pořadí položek číselníku „${list.name}“`,
    });
  });
}
