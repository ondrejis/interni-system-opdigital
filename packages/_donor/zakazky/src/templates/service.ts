import { and, asc, eq, isNull } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { createTask } from "@rebar/core/collab";
import { schema } from "@rebar/core/db";
import { can, NotFoundError } from "@rebar/core/rbac";
import type { Ctx } from "@rebar/core/rbac";
import { job, jobMember, jobTemplate } from "../schema";
import { templatePayload, type TemplatePayload } from "./payload";

export type BuildOptions = {
  includeTasks: boolean;
  includeRoles: boolean;
};

const DAY = 86_400_000;
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);

/** Kostra zakázky pro šablonu: otevřené úkoly a role týmu. */
export async function buildPayloadFromJob(
  c: Ctx,
  jobId: string,
  o: BuildOptions,
): Promise<TemplatePayload> {
  const [j] = await c.db
    .select()
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)));
  if (!j) throw new NotFoundError("Zakázka nenalezena.");
  const payload: TemplatePayload = { v: 1, tasks: [], roles: [] };

  if (o.includeTasks) {
    const tasks = await c.db
      .select()
      .from(schema.task)
      .where(
        and(
          eq(schema.task.entityType, "job"),
          eq(schema.task.entityId, jobId),
          isNull(schema.task.doneAt),
          isNull(schema.task.deletedAt),
        ),
      )
      .orderBy(asc(schema.task.createdAt));
    payload.tasks = tasks.map((t) => ({
      title: t.title,
      description: t.description,
      daysFromStart:
        j.startDate && t.dueDate && days(j.startDate, t.dueDate) >= 0
          ? days(j.startDate, t.dueDate)
          : null,
      priority: t.priority,
    }));
  }

  if (o.includeRoles) {
    const members = await c.db
      .select({ role: jobMember.role })
      .from(jobMember)
      .where(eq(jobMember.jobId, jobId));
    payload.roles = [
      ...new Set(members.map((m) => m.role?.trim()).filter((r): r is string => !!r)),
    ];
  }
  return payload;
}

export type ApplyTemplateResult = {
  tasks: number;
  roles: string[];
};

/**
 * Použije šablonu na zakázku: úkoly a role se založí jen jednou, dokud zakázka nemá `templateId` (při vzniku zakázky
 * ze šablony vždy). Volající ověřuje oprávnění.
 */
export async function applyTemplateTx(
  c: Ctx,
  jobId: string,
  templateId: string,
  opts: { initial?: boolean } = {},
): Promise<ApplyTemplateResult> {
  const [row] = await c.db
    .select()
    .from(job)
    .where(and(eq(job.id, jobId), isNull(job.deletedAt)))
    .for("update");
  if (!row) throw new NotFoundError("Zakázka nenalezena.");
  const [tpl] = await c.db
    .select()
    .from(jobTemplate)
    .where(and(eq(jobTemplate.id, templateId), isNull(jobTemplate.deletedAt)));
  if (!tpl) throw new NotFoundError("Šablona nenalezena.");
  const payload = templatePayload.parse(tpl.payload);
  const out: ApplyTemplateResult = { tasks: 0, roles: [] };

  if (opts.initial || !row.templateId) {
    const assignee = row.managerId && can(c, "tasks.assign") ? row.managerId : c.actor.userId;
    for (const t of payload.tasks) {
      const due =
        t.daysFromStart !== null && row.startDate
          ? new Date(Date.parse(`${row.startDate}T12:00:00Z`) + t.daysFromStart * DAY)
              .toISOString()
              .slice(0, 10)
          : null;
      await createTask(c, {
        title: t.title,
        description: t.description,
        priority: t.priority,
        dueDate: due,
        assigneeId: assignee,
        entityType: "job",
        entityId: jobId,
      });
      out.tasks++;
    }
    for (const r of payload.roles) {
      await createTask(c, {
        title: `Obsadit roli v týmu: ${r}`,
        priority: "normal",
        assigneeId: assignee,
        entityType: "job",
        entityId: jobId,
      });
      out.roles.push(r);
    }
    await c.db.update(job).set({ templateId, updatedBy: c.actor.userId }).where(eq(job.id, jobId));
  }

  await recordAudit(c, {
    action: "update",
    entityType: "job",
    entityId: jobId,
    summary: `Použita šablona „${tpl.name}“ (úkolů ${out.tasks + out.roles.length})`,
  });
  return out;
}
