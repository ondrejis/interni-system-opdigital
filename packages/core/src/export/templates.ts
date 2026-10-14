import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { recordAudit } from "../audit/audit";
import { schema } from "../db/client";
import { resolveEntity } from "../entities/engine";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { can, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { exportColumns } from "./entity-export";
import type { ExportRuntime } from "./runtime";
import { exportSpecSchema, type ExportSpec } from "./spec";

export type TemplateInfo = {
  id: string;
  name: string;
  entity: string;
  entityLabel: string;
  shared: boolean;
  mine: boolean;
  ownerName: string;
  spec: ExportSpec;
};

const templateInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Vyplňte název šablony.").max(60),
  shared: z.boolean().default(false),
  spec: exportSpecSchema,
});
export type TemplateInput = z.input<typeof templateInput>;

const userId = (ctx: Ctx) => {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
};

/** Ověří, že aktér entitu smí exportovat a že všechny sloupce existují (a nejsou skryté oprávněním). */
export async function assertSpecUsable(
  ctx: Ctx,
  rt: Pick<ExportRuntime, "registry">,
  spec: ExportSpec,
) {
  const def = rt.registry.get(spec.entity);
  if (!def) throw new UserError("Tento typ záznamů v systému není (vypnutý modul).");
  if (!scopeOf(ctx, def.permissions.export ?? def.permissions.read)) throw new PermissionError();
  const entity = await resolveEntity(ctx.db, def);
  await exportColumns(ctx, rt.registry, entity, spec.columns);
  return def;
}

/** Šablony, které aktér vidí: vlastní a sdílené, jen pro entity, které smí exportovat. */
export async function listTemplates(
  ctx: Ctx,
  rt: Pick<ExportRuntime, "registry">,
  filter: { entity?: string } = {},
): Promise<TemplateInfo[]> {
  const me = userId(ctx);
  const rows = await ctx.db
    .select({ t: schema.exportTemplate, owner: schema.user.name })
    .from(schema.exportTemplate)
    .innerJoin(schema.user, eq(schema.user.id, schema.exportTemplate.ownerId))
    .where(
      and(
        isNull(schema.exportTemplate.deletedAt),
        or(eq(schema.exportTemplate.ownerId, me), eq(schema.exportTemplate.shared, true)),
        filter.entity ? eq(schema.exportTemplate.entityType, filter.entity) : undefined,
      ),
    )
    .orderBy(asc(schema.exportTemplate.name));
  const out: TemplateInfo[] = [];
  for (const { t, owner } of rows) {
    const def = rt.registry.get(t.entityType);
    if (!def || !scopeOf(ctx, def.permissions.export ?? def.permissions.read)) continue;
    const parsed = exportSpecSchema.safeParse(t.config);
    if (!parsed.success) continue;
    out.push({
      id: t.id,
      name: t.name,
      entity: t.entityType,
      entityLabel: def.label.many,
      shared: t.shared,
      mine: t.ownerId === me,
      ownerName: owner,
      spec: parsed.data,
    });
  }
  return out;
}

export async function saveTemplate(
  ctx: Ctx,
  rt: Pick<ExportRuntime, "registry">,
  raw: TemplateInput,
): Promise<{ id: string }> {
  const me = userId(ctx);
  const input = templateInput.parse(raw);
  const def = await assertSpecUsable(ctx, rt, input.spec);
  // sdílet v týmu smí ten, kdo smí plánovat exporty
  if (input.shared && !can(ctx, "exports.schedule"))
    throw new PermissionError(
      "Sdílet šablonu s týmem smí jen uživatel s oprávněním plánovat exporty.",
    );
  return inTx(ctx, async (c) => {
    if (input.id) {
      const [t] = await c.db
        .select()
        .from(schema.exportTemplate)
        .where(
          and(eq(schema.exportTemplate.id, input.id), isNull(schema.exportTemplate.deletedAt)),
        );
      if (!t || (t.ownerId !== me && !can(c, "exports.manage")))
        throw new NotFoundError("Šablona nenalezena.");
      await c.db
        .update(schema.exportTemplate)
        .set({
          name: input.name,
          shared: input.shared,
          entityType: def.key,
          config: input.spec,
          updatedBy: me,
        })
        .where(eq(schema.exportTemplate.id, input.id));
      await recordAudit(c, {
        action: "update",
        entityType: "export_template",
        entityId: input.id,
        summary: `Šablona exportu „${input.name}“ (${def.key})`,
      });
      return { id: input.id };
    }
    const [row] = await c.db
      .insert(schema.exportTemplate)
      .values({
        name: input.name,
        ownerId: me,
        entityType: def.key,
        shared: input.shared,
        config: input.spec,
        createdBy: me,
        updatedBy: me,
      })
      .returning({ id: schema.exportTemplate.id });
    await recordAudit(c, {
      action: "create",
      entityType: "export_template",
      entityId: row!.id,
      summary: `Šablona exportu „${input.name}“ (${def.key})`,
    });
    return { id: row!.id };
  });
}

export async function deleteTemplate(ctx: Ctx, id: string): Promise<void> {
  const me = userId(ctx);
  await inTx(ctx, async (c) => {
    const [t] = await c.db
      .select()
      .from(schema.exportTemplate)
      .where(and(eq(schema.exportTemplate.id, id), isNull(schema.exportTemplate.deletedAt)));
    if (!t || (t.ownerId !== me && !can(c, "exports.manage")))
      throw new NotFoundError("Šablona nenalezena.");
    await c.db
      .update(schema.exportTemplate)
      .set({ deletedAt: new Date(), updatedBy: me })
      .where(eq(schema.exportTemplate.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "export_template",
      entityId: id,
      summary: `Šablona exportu „${t.name}“`,
    });
  });
}
