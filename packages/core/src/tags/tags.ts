import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { ensureLookup, getLookup } from "../config-data";
import { schema, type Executor } from "../db/client";
import type { EntityRegistry } from "../entities/engine";
import { inTx } from "../rbac/context";
import { NotFoundError, UserError } from "../rbac/errors";
import { assertCan } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { getTableColumns } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/** Klíč společného číselníku štítků (jeden pro všechny entity; rozsah řeší `lookup_item.scopes`). */
export const TAG_LIST = "tag";
const PERM = "settings.tags";

/** Štítek s rozsahem, barvou a využitím. */
export type TagInfo = {
  id: string;
  value: string;
  label: string;
  color: string | null;
  /** Klíče entit, pro které štítek platí; prázdné = všude. */
  scopes: string[];
  active: boolean;
  /** Kolik záznamů štítek používá (podle entit). */
  usage: Record<string, number>;
};

/** Entity, které mají atribut štítků (`lookup: "tag"`), s polem, kam se hodnoty ukládají. */
export function taggableEntities(registry: EntityRegistry) {
  return registry.all().flatMap((d) => {
    const a = d.attributes.find((x) => x.lookup === TAG_LIST);
    return a?.field ? [{ key: d.key, label: d.label.many, def: d, field: a.field }] : [];
  });
}

/** Všechny štítky (i archivované) a kolik záznamů každý používá. */
export async function listTags(
  ctx: Ctx,
  registry: EntityRegistry,
): Promise<{ tags: TagInfo[]; entities: { key: string; label: string }[] }> {
  assertCan(ctx, PERM);
  const items = await getLookup(ctx.db, TAG_LIST, { includeInactive: true });
  const taggable = taggableEntities(registry);
  const usage = new Map<string, Record<string, number>>();
  for (const e of taggable) {
    const cols = getTableColumns(e.def.table) as Record<string, AnyPgColumn>;
    const col = cols[e.field]!;
    const rows = (await ctx.db.execute(
      sql`select t as tag, count(*)::int as n from ${e.def.table}, unnest(${col}) as t where ${cols.deletedAt!} is null group by t`,
    )) as unknown as { tag: string; n: number }[];
    for (const r of rows) {
      const u = usage.get(r.tag) ?? {};
      u[e.key] = r.n;
      usage.set(r.tag, u);
    }
  }
  return {
    tags: items.map((i) => ({
      id: i.id,
      value: i.value,
      label: i.label,
      color: i.color,
      scopes: i.scopes,
      active: i.active,
      usage: usage.get(i.value) ?? {},
    })),
    entities: taggable.map((e) => ({ key: e.key, label: e.label })),
  };
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "stitek";

const tagInput = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Vyplňte název štítku.")
    .max(40, "Název štítku je příliš dlouhý."),
  color: z.string().max(20).nullish(),
  scopes: z.array(z.string().min(1).max(40)).max(40).default([]),
});

async function listId(db: Executor): Promise<string> {
  return ensureLookup(db, { key: TAG_LIST, name: "Štítky", items: [] });
}

/** Založí štítek (stabilní klíč se vyrobí z názvu a už se nemění). Vyžaduje `settings.tags`. */
export async function createTag(ctx: Ctx, raw: z.input<typeof tagInput>) {
  assertCan(ctx, PERM);
  const d = tagInput.parse(raw);
  return inTx(ctx, async (c) => {
    const id = await listId(c.db);
    const all = await c.db
      .select()
      .from(schema.lookupItem)
      .where(and(eq(schema.lookupItem.listId, id), isNull(schema.lookupItem.deletedAt)));
    if (all.some((i) => i.label.trim().toLowerCase() === d.label.toLowerCase()))
      throw new UserError("Štítek s tímto názvem už existuje.");
    let value = slug(d.label);
    for (let n = 2; all.some((i) => i.value === value); n++) value = `${slug(d.label)}_${n}`;
    const [row] = await c.db
      .insert(schema.lookupItem)
      .values({
        listId: id,
        value,
        label: d.label,
        color: d.color ?? "gray",
        scopes: d.scopes,
        position: all.length,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "lookup_item",
      entityId: row!.id,
      summary: `Štítek ${d.label}`,
      changes: [{ field: "label", old: null, new: d.label }],
    });
    return row!;
  });
}

/** Změní název, barvu, rozsah nebo archivaci štítku (záznamy se štítkem se nemění). Vyžaduje `settings.tags`. */
export async function updateTag(
  ctx: Ctx,
  id: string,
  patch: { label?: string; color?: string | null; scopes?: string[]; active?: boolean },
) {
  assertCan(ctx, PERM);
  await inTx(ctx, async (c) => {
    const [before] = await c.db
      .select()
      .from(schema.lookupItem)
      .where(and(eq(schema.lookupItem.id, id), isNull(schema.lookupItem.deletedAt)));
    if (!before) throw new NotFoundError("Štítek nenalezen.");
    const label =
      patch.label === undefined ? before.label : tagInput.shape.label.parse(patch.label);
    const siblings = await c.db
      .select()
      .from(schema.lookupItem)
      .where(and(eq(schema.lookupItem.listId, before.listId), isNull(schema.lookupItem.deletedAt)));
    if (siblings.some((i) => i.id !== id && i.label.toLowerCase() === label.toLowerCase()))
      throw new UserError("Štítek s tímto názvem už existuje.");
    const after = {
      label,
      color: patch.color === undefined ? before.color : patch.color,
      scopes: patch.scopes ?? before.scopes,
      active: patch.active ?? before.active,
    };
    await c.db
      .update(schema.lookupItem)
      .set({ ...after, updatedBy: c.actor.userId })
      .where(eq(schema.lookupItem.id, id));
    const changes = (["label", "color", "scopes", "active"] as const)
      .filter((f) => JSON.stringify(after[f]) !== JSON.stringify(before[f]))
      .map((f) => ({ field: f, old: before[f], new: after[f] }));
    if (changes.length)
      await recordAudit(c, {
        action: "update",
        entityType: "lookup_item",
        entityId: id,
        summary: `Štítek ${after.label}`,
        changes,
      });
  });
}

/** Smaže nepoužitý štítek; použitý jen archivuje (záznamy o hodnotu nepřijdou). */
export async function deleteTag(
  ctx: Ctx,
  registry: EntityRegistry,
  id: string,
): Promise<{ archived: boolean }> {
  assertCan(ctx, PERM);
  const { tags } = await listTags(ctx, registry);
  const tag = tags.find((t) => t.id === id);
  if (!tag) throw new NotFoundError("Štítek nenalezen.");
  const used = Object.values(tag.usage).reduce((a, b) => a + b, 0) > 0;
  if (used) {
    await updateTag(ctx, id, { active: false });
    return { archived: true };
  }
  await inTx(ctx, async (c) => {
    await c.db
      .update(schema.lookupItem)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(schema.lookupItem.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "lookup_item",
      entityId: id,
      summary: `Štítek ${tag.label} smazán`,
    });
  });
  return { archived: false };
}
