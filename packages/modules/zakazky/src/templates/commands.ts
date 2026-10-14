import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { inTx, NotFoundError, UserError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { jobTemplate } from "../schema";
import { templatePayload, summarizePayload } from "./payload";
import { applyTemplateTx, buildPayloadFromJob } from "./service";

const uuid = z.uuid();
const name = z.string().trim().min(2, "Pojmenujte šablonu.").max(120);
const description = z
  .string()
  .trim()
  .max(1000)
  .nullish()
  .transform((v) => v || null);

async function load(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(jobTemplate)
    .where(and(eq(jobTemplate.id, id), isNull(jobTemplate.deletedAt)));
  if (!row) throw new NotFoundError("Šablona nenalezena.");
  return row;
}

const view = (r: typeof jobTemplate.$inferSelect) => {
  const payload = templatePayload.parse(r.payload);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    summary: summarizePayload(payload),
    payload,
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
      const { payload: _payload, ...rest } = view(r);
      void _payload;
      return rest;
    });
  },
});

export const templateGet = defineCommand({
  name: "zakazky.template.get",
  permission: "zakazky.read",
  input: z.object({ id: uuid }),
  handler: async (ctx, i) => view(await load(ctx, i.id)),
});

/** Vytvoří šablonu z existující zakázky (nebo přepíše šablonu `replaceId`). */
export const templateCreateFromJob = defineCommand({
  name: "zakazky.template.createFromJob",
  permission: "zakazky.write",
  input: z.object({
    jobId: uuid,
    name,
    description: description.optional(),
    includeTasks: z.boolean().default(true),
    includeRoles: z.boolean().default(true),
    replaceId: uuid.optional(),
  }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "read");
    return inTx(ctx, async (c) => {
      const payload = await buildPayloadFromJob(c, i.jobId, i);
      const s = summarizePayload(payload);
      if (!s.tasks && !s.roles)
        throw new UserError("Zakázka nemá nic, co by šlo uložit do šablony (úkoly, role).");
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
        summary: `Uložena šablona zakázky „${i.name}“ (úkolů ${s.tasks}, rolí ${s.roles})`,
      });
      return { id, summary: s };
    });
  },
});

export const templateSave = defineCommand({
  name: "zakazky.template.save",
  permission: "zakazky.write",
  input: z.object({ id: uuid, name: name.optional(), description: description.optional() }),
  handler: async (ctx, i) => {
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
  permission: "zakazky.write",
  input: z.object({ id: uuid }),
  handler: async (ctx, i) => {
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
  permission: "zakazky.write",
  input: z.object({ jobId: uuid, templateId: uuid }),
  handler: async (ctx, i) => {
    await assertEntityAccess(ctx, "job", i.jobId, "write");
    return inTx(ctx, (c) => applyTemplateTx(c, i.jobId, i.templateId));
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
