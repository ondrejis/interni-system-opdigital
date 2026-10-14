import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { schema } from "../db/client";
import type { SavedViewConfig } from "../db/schema/views";
import { filterGroupSchema } from "../entities/filters";
import type { EntityDef } from "../entities/types";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { can, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";

export const viewConfigSchema = z.object({
  viewType: z.enum(["table", "kanban"]),
  filters: filterGroupSchema.optional(),
  sort: z
    .array(z.object({ attr: z.string().min(1).max(80), dir: z.enum(["asc", "desc"]) }))
    .max(5)
    .optional(),
  group: z.string().max(80).nullish(),
  columns: z.array(z.string().max(80)).max(60).optional(),
  columnWidths: z.record(z.string(), z.number().int().min(60).max(800)).optional(),
  cardAttributes: z.array(z.string().max(80)).max(10).optional(),
});

const viewInput = z.object({
  name: z.string().trim().min(1, "Vyplňte název pohledu.").max(60),
  shared: z.boolean().default(false),
  config: viewConfigSchema,
});

function me(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
}

function assertEntityReadable(ctx: Ctx, def: EntityDef) {
  if (!scopeOf(ctx, def.permissions.read)) throw new PermissionError();
}

/** Pohledy musí odkazovat jen na existující atributy (nebo vlastní pole) — jinak by se rozbily při načtení. */
function checkConfig(config: SavedViewConfig, knownAttrs: ReadonlySet<string>) {
  const keys = [
    ...(config.columns ?? []),
    ...(config.cardAttributes ?? []),
    ...(config.sort ?? []).map((s) => s.attr),
    ...(config.group ? [config.group] : []),
  ];
  const unknown = keys.filter((k) => !knownAttrs.has(k));
  if (unknown.length)
    throw new UserError(`Pohled odkazuje na neznámé atributy: ${unknown.join(", ")}.`);
}

/** Pohledy entity: vlastní a sdílené, s příznakem oblíbeného. */
export async function listViews(ctx: Ctx, def: EntityDef) {
  assertEntityReadable(ctx, def);
  const userId = me(ctx);
  const rows = await ctx.db
    .select({ view: schema.savedView, favorite: schema.viewFavorite.userId })
    .from(schema.savedView)
    .leftJoin(
      schema.viewFavorite,
      and(
        eq(schema.viewFavorite.viewId, schema.savedView.id),
        eq(schema.viewFavorite.userId, userId),
      ),
    )
    .where(
      and(
        eq(schema.savedView.entityType, def.key),
        isNull(schema.savedView.deletedAt),
        or(eq(schema.savedView.ownerId, userId), eq(schema.savedView.shared, true)),
      ),
    )
    .orderBy(asc(schema.savedView.position), asc(schema.savedView.createdAt));
  return rows.map((r) => ({
    id: r.view.id,
    name: r.view.name,
    shared: r.view.shared,
    mine: r.view.ownerId === userId,
    favorite: !!r.favorite,
    config: r.view.config,
  }));
}

export async function createView(
  ctx: Ctx,
  def: EntityDef,
  knownAttrs: ReadonlySet<string>,
  raw: z.input<typeof viewInput>,
) {
  assertEntityReadable(ctx, def);
  const userId = me(ctx);
  const d = viewInput.parse(raw);
  checkConfig(d.config, knownAttrs);
  return inTx(ctx, async (c) => {
    const [row] = await c.db
      .insert(schema.savedView)
      .values({
        entityType: def.key,
        name: d.name,
        ownerId: userId,
        shared: d.shared,
        config: d.config,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "saved_view",
      entityId: row!.id,
      summary: `Pohled „${d.name}“ (${def.key})`,
    });
    return row!;
  });
}

async function loadEditable(ctx: Ctx, id: string) {
  const [v] = await ctx.db
    .select()
    .from(schema.savedView)
    .where(and(eq(schema.savedView.id, id), isNull(schema.savedView.deletedAt)));
  if (!v) throw new NotFoundError("Pohled nenalezen.");
  const userId = me(ctx);
  if (!v.shared && v.ownerId !== userId) throw new NotFoundError("Pohled nenalezen.");
  if (v.ownerId !== userId && !can(ctx, "settings.manage"))
    throw new PermissionError("Cizí sdílený pohled může upravit jen jeho autor nebo správce.");
  return v;
}

export async function updateView(
  ctx: Ctx,
  id: string,
  knownAttrs: ReadonlySet<string>,
  patch: Partial<z.input<typeof viewInput>>,
) {
  const d = viewInput.partial().parse(patch);
  if (d.config) checkConfig(d.config, knownAttrs);
  await inTx(ctx, async (c) => {
    const v = await loadEditable(c, id);
    await c.db
      .update(schema.savedView)
      .set({
        ...(d.name ? { name: d.name } : {}),
        ...(d.shared === undefined ? {} : { shared: d.shared }),
        ...(d.config ? { config: d.config } : {}),
        updatedBy: c.actor.userId,
      })
      .where(eq(schema.savedView.id, id));
    await recordAudit(c, {
      action: "update",
      entityType: "saved_view",
      entityId: id,
      summary: `Pohled „${d.name ?? v.name}“`,
    });
  });
}

export async function deleteView(ctx: Ctx, id: string) {
  await inTx(ctx, async (c) => {
    const v = await loadEditable(c, id);
    await c.db
      .update(schema.savedView)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(schema.savedView.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "saved_view",
      entityId: id,
      summary: `Pohled „${v.name}“`,
    });
  });
}

/** Oblíbený pohled se ukazuje v postranním panelu; je to věc uživatele, ne pohledu. */
export async function setFavorite(ctx: Ctx, id: string, favorite: boolean) {
  const userId = me(ctx);
  const [v] = await ctx.db
    .select()
    .from(schema.savedView)
    .where(
      and(
        eq(schema.savedView.id, id),
        isNull(schema.savedView.deletedAt),
        or(eq(schema.savedView.ownerId, userId), eq(schema.savedView.shared, true)),
      ),
    );
  if (!v) throw new NotFoundError("Pohled nenalezen.");
  if (favorite)
    await ctx.db.insert(schema.viewFavorite).values({ userId, viewId: id }).onConflictDoNothing();
  else
    await ctx.db
      .delete(schema.viewFavorite)
      .where(and(eq(schema.viewFavorite.userId, userId), eq(schema.viewFavorite.viewId, id)));
}
