import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { recordAudit } from "@rebar/core/audit";
import { schema } from "@rebar/core/db";
import { assertEntityAccess } from "@rebar/core/entities";
import { defineCommand } from "@rebar/core/module-server";
import { notify } from "@rebar/core/notifications";
import { inTx, NotFoundError, PermissionError, UserError } from "@rebar/core/rbac";
import { scopeOf } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { JOB_TEAM } from "./notifications";
import { job, jobMember } from "./schema";

const jobId = z.uuid();

/** Čtení zakázky vyžaduje přístup k záznamu; údaje o penězích navíc `zakazky.economics`. */
async function readJob(ctx: Ctx, id: string, opts: { economics?: boolean } = {}) {
  await assertEntityAccess(ctx, "job", id, "read");
  if (opts.economics && !scopeOf(ctx, "zakazky.economics")) throw new PermissionError();
}
async function writeJob(ctx: Ctx, id: string, opts: { economics?: boolean } = {}) {
  await assertEntityAccess(ctx, "job", id, "write");
  if (opts.economics && !scopeOf(ctx, "zakazky.economics")) throw new PermissionError();
}

async function loadJob(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(job)
    .where(and(eq(job.id, id), isNull(job.deletedAt)));
  if (!row) throw new NotFoundError("Zakázka nenalezena.");
  return row;
}

/* ---------- tým ---------- */

export const teamList = defineCommand({
  name: "zakazky.team.list",
  input: z.object({ jobId }),
  handler: async (ctx, i) => {
    await readJob(ctx, i.jobId);
    const j = await loadJob(ctx, i.jobId);
    const members = await ctx.db
      .select({ userId: jobMember.userId, role: jobMember.role, name: schema.user.name })
      .from(jobMember)
      .innerJoin(schema.user, eq(jobMember.userId, schema.user.id))
      .where(eq(jobMember.jobId, i.jobId))
      .orderBy(asc(schema.user.name));
    return { managerId: j.managerId, members };
  },
});

export const teamAdd = defineCommand({
  name: "zakazky.team.add",
  permission: "zakazky.write",
  input: z.object({ jobId, userId: z.uuid(), role: z.string().trim().max(60).nullish() }),
  handler: async (ctx, i) => {
    await writeJob(ctx, i.jobId);
    await inTx(ctx, async (c) => {
      const j = await loadJob(c, i.jobId);
      const [u] = await c.db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(
          and(
            eq(schema.user.id, i.userId),
            eq(schema.user.active, true),
            isNull(schema.user.deletedAt),
          ),
        );
      if (!u) throw new UserError("Uživatel nenalezen.");
      await c.db
        .insert(jobMember)
        .values({ jobId: i.jobId, userId: i.userId, role: i.role || null })
        .onConflictDoUpdate({
          target: [jobMember.jobId, jobMember.userId],
          set: { role: i.role || null },
        });
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: i.jobId,
        summary: `${u.name} přidán(a) do týmu${i.role ? ` (${i.role})` : ""}`,
      });
      await notify(c.db, JOB_TEAM, {
        params: { number: j.number, title: j.title, role: i.role || null },
        to: { member: [i.userId] },
        record: { type: "job", id: i.jobId },
        actorId: c.actor.userId,
      });
    });
  },
});

export const teamRemove = defineCommand({
  name: "zakazky.team.remove",
  permission: "zakazky.write",
  input: z.object({ jobId, userId: z.uuid() }),
  handler: async (ctx, i) => {
    await writeJob(ctx, i.jobId);
    await inTx(ctx, async (c) => {
      await c.db
        .delete(jobMember)
        .where(and(eq(jobMember.jobId, i.jobId), eq(jobMember.userId, i.userId)));
      await recordAudit(c, {
        action: "update",
        entityType: "job",
        entityId: i.jobId,
        summary: "Člen odebrán z týmu",
      });
    });
  },
});

export const commands = [teamList, teamAdd, teamRemove];
