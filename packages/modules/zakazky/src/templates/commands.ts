import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { inTx, NotFoundError, PermissionError, scopeOf, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { jobTemplate } from "../schema";
import { templatePayload, stripPrices, summarizePayload } from "./payload";
import { applyTemplateTx, buildPayloadFromJob } from "./service";

const uuid = z.uuid();
const name = z.string().trim().min(2, "Pojmenujte šablonu.").max(120);
const description = z
  .string()
  .trim()
  .max(1000)
  .nullish()
  .transform((v) => v || null);

function needBudget(ctx: Ctx) {
  if (!scopeOf(ctx, "zakazky.budget")) throw new PermissionError();
}

async function load(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(jobTemplate)
    .where(and(eq(jobTemplate.id, id), isNull(jobTemplate.deletedAt)));
  if (!row) throw new NotFoundError("Šablona nenalezena.");
  return row;
}

const view = (r: typeof jobTemplate.$inferSelect, canSeePrices: boolean) => {
  const payload = templatePayload.parse(r.payload);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    summary: summarizePayload(payload),
    payload: canSeePrices ? payload : stripPrices(payload),
  };
};

export const templateList = defineCommand({
  name: "zakazky.template.list",
  permission: "zakazky.read",
  input: z.object({}),
  handler: async (ctx) => {
    const rows = await ctx.db
      .select()
      .from(jobTemplate)
      .where(isNull(jobTemplate.deletedAt))
      .orderBy(desc(jobTemplate.createdAt));
    return rows.map((r) => {
      const { payload: _payload, ...rest } = view(r, false);
      void _payload;
      return rest;
    });
  },
});

export const templateGet = defineCommand({
  name: "zakazky.template.get",
  permission: "zakazky.read",
  input: z.object({ id: uuid }),
  handler: async (ctx, i) => view(await load(ctx, i.id), !!scopeOf(ctx, "zakazky.economics")),
});

/** Vytvoří šablonu z existující zakázky (nebo přepíše šablonu `replaceId`). */
export const templateCreateFromJob = defineCommand({
  name: "zakazky.template.createFromJob",
  permission: "zakazky.budget",
  input: z.object({
    jobId: uuid,
    name,
    description: description.optional(),
    versionId: uuid.nullish(),
    withPrices: z.boolean().default(false),
    includeBudget: z.boolean().default(true),
    includeTasks: z.boolean().default(true),
    includeRoles: z.boolean().default(true),
    replaceId: uuid.optional(),
  }),
  handler: async (ctx, i) => {
    needBudget(ctx);
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    if ((i.includeBudget || i.withPrices) && !scopeOf(ctx, "zakazky.economics"))
      throw new PermissionError();
    return inTx(ctx, async (c) => {
      const payload = await buildPayloadFromJob(c, i.jobId, i);
      const s = summarizePayload(payload);
      if (!s.hasBudget && !s.tasks && !s.roles)
        throw new UserError(
          "Zakázka nemá nic, co by šlo uložit do šablony (rozpočet, úkoly, role).",
        );
      const values = {
        name: i.name,
        description: i.description ?? null,
        payload: payload as unknown as Record<string, unknown>,
        updatedBy: c.actor.userId,
      };
      let id = i.replaceId;
      if (id) {
        await load(c, id);
        await c.db.update(jobTemplate).set(values).where(eq(jobTemplate.id, id));
      } else {
        const [r] = await c.db
          .insert(jobTemplate)
          .values({ ...values, createdBy: c.actor.userId })
          .returning({ id: jobTemplate.id });
        id = r!.id;
      }
      await recordAudit(c, {
        action: i.replaceId ? "update" : "create",
        entityType: "job",
        entityId: i.jobId,
        summary: `Uložena šablona zakázky „${i.name}“ (oddílů ${s.sections}, položek ${s.items}, úkolů ${s.tasks})`,
      });
      return { id, summary: s };
    });
  },
});

export const templateSave = defineCommand({
  name: "zakazky.template.save",
  permission: "zakazky.budget",
  input: z.object({ id: uuid, name: name.optional(), description: description.optional() }),
  handler: async (ctx, i) => {
    needBudget(ctx);
    await load(ctx, i.id);
    await ctx.db
      .update(jobTemplate)
      .set({
        ...(i.name !== undefined ? { name: i.name } : {}),
        ...(i.description !== undefined ? { description: i.description } : {}),
        updatedBy: ctx.actor.userId,
      })
      .where(eq(jobTemplate.id, i.id));
    return { id: i.id };
  },
});

export const templateDelete = defineCommand({
  name: "zakazky.template.delete",
  permission: "zakazky.budget",
  input: z.object({ id: uuid }),
  handler: async (ctx, i) => {
    needBudget(ctx);
    const r = await load(ctx, i.id);
    await ctx.db
      .update(jobTemplate)
      .set({ deletedAt: new Date(), updatedBy: ctx.actor.userId })
      .where(eq(jobTemplate.id, i.id));
    return { id: r.id };
  },
});

export const templateApply = defineCommand({
  name: "zakazky.template.apply",
  permission: "zakazky.budget",
  input: z.object({ jobId: uuid, templateId: uuid, versionId: uuid.nullish() }),
  handler: async (ctx, i) => {
    needBudget(ctx);
    await assertEntityAccess(ctx, "job", i.jobId, "write");
    return inTx(ctx, (c) => applyTemplateTx(c, i.jobId, i.templateId, { versionId: i.versionId }));
  },
});

export const commands = [
  templateList,
  templateGet,
  templateCreateFromJob,
  templateSave,
  templateDelete,
  templateApply,
];
