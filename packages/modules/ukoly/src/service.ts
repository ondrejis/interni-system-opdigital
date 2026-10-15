import { and, asc, eq, inArray, isNotNull, isNull, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { ServiceMap } from "@rebar/core/contracts";
import { resolveEntity, updateRecord } from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, type Ctx } from "@rebar/core/rbac";
import { localParts } from "@rebar/core/time";
import { task } from "./schema";
import { createPrivateNote } from "./notes/service";
import { overdueCond } from "./tasks/queries";
import { visibleTasks } from "./tasks/scope";
import { createTaskId } from "./tasks/write";
import { OPEN_STATUSES } from "./tasks/constants";

/*
  Služba `tasks` pro ostatní moduly (D §2.3). Konzument ji bere přes `deps.services.optional("tasks")`. Volání jsou
  interní kroky jiných modulů (vznik zakázky ze šablony, logování e-mailu, schůzka z kalendáře), proto se úkoly zakládají
  s oprávněním systému; kdo je založil (`createdBy`, historie) zůstává aktér volání.
*/

/** Kontext, který smí založit úkol bez ohledu na role aktéra (volající modul oprávnění vyřešil sám). */
const elevate = (ctx: Ctx): Ctx => ({ ...ctx, actor: { ...ctx.actor, unrestricted: true } });

/** Prostý text z dokumentu Tiptapu (pro hledání): texty uzlů, bloky oddělené novým řádkem. */
export function plainText(doc: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (typeof node.text === "string") out.push(node.text);
    node.content?.forEach(walk);
    if (node.type && node.type !== "text" && node.type !== "doc") out.push("\n");
  };
  walk(doc);
  return out
    .join("")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Služba `tasks`: `createFromTemplate`, `overdueJobIds`, `openCounts`, `logDoneActivity`, `createMeeting`,
 * `createPrivateNote`.
 */
export function createTasksService(deps: ModuleDeps): ServiceMap["tasks"] {
  return {
    async createFromTemplate(ctx, input) {
      const ec = elevate(ctx);
      const taskIds: string[] = [];
      await inTx(ec, async (c) => {
        for (const [i, item] of input.items.entries()) {
          taskIds.push(
            await createTaskId(c, deps, {
              title: item.title,
              ...(item.description !== undefined ? { description: item.description } : {}),
              typeKey: item.typeKey ?? "task",
              ...(item.priority ? { priority: item.priority } : {}),
              assigneeId:
                item.assigneeId === undefined ? (input.leadId ?? input.ownerId) : item.assigneeId,
              dueDate: item.dueDate ?? null,
              ...(item.estimateMin !== undefined ? { estimateMin: item.estimateMin } : {}),
              jobId: input.jobId,
              jobPhaseId: item.phaseId ?? null,
              sourceTemplateTask: `šablona #${i + 1}: ${item.title}`.slice(0, 300),
            }),
          );
        }
      });
      return { taskIds };
    },

    async overdueJobIds(ctx) {
      const rows = await ctx.db
        .selectDistinct({ jobId: task.jobId })
        .from(task)
        .where(
          and(visibleTasks(ctx, { lenient: true }), isNotNull(task.jobId), overdueCond(new Date())),
        );
      return rows.map((r) => r.jobId!).filter(Boolean);
    },

    async openCounts(ctx, scope) {
      const link = scope.jobId
        ? eq(task.jobId, scope.jobId)
        : scope.dealId
          ? eq(task.dealId, scope.dealId)
          : sql`false`;
      const [r] = await ctx.db
        .select({
          open: sql<number>`count(*) filter (where ${task.status} in (${sql.join(
            OPEN_STATUSES.map((s) => sql`${s}`),
            sql`, `,
          )}))::int`,
          overdue: sql<number>`count(*) filter (where ${overdueCond(new Date())})::int`,
        })
        .from(task)
        .where(and(visibleTasks(ctx, { lenient: true }), link));
      return { open: r?.open ?? 0, overdue: r?.overdue ?? 0 };
    },

    async logDoneActivity(ctx, input) {
      const id = await createTaskId(elevate(ctx), deps, {
        title: input.subject,
        typeKey: input.typeKey,
        done: true,
        dueDate: localParts(new Date()).date,
        ...(input.dealId ? { dealId: input.dealId } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.personId ? { personId: input.personId } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
      });
      return { id };
    },

    async createMeeting(ctx, input) {
      const start = new Date(input.startsAt);
      const end = new Date(input.endsAt);
      const s = localParts(start);
      const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
      const allDay = input.allDay === true;
      const id = await createTaskId(elevate(ctx), deps, {
        title: input.title,
        typeKey: "meeting",
        dueDate: s.date,
        dueTime: allDay ? null : s.time,
        allDay,
        durationMin: !allDay && minutes > 0 ? Math.min(minutes, 1440) : null,
        place: input.place ?? null,
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.dealId ? { dealId: input.dealId } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.personId ? { personId: input.personId } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...(input.isPrivate !== undefined ? { isPrivate: input.isPrivate } : {}),
        attendees: (input.attendeeEmails ?? []).map((ref) => ({ kind: "email" as const, ref })),
      });
      return { taskId: id };
    },

    async estimateByJob(ctx, jobId) {
      const child = alias(task, "child");
      const [r] = await ctx.db
        .select({
          estimateMin: sql<number>`coalesce(sum(${task.estimateMin}), 0)::int`,
          tasks: sql<number>`count(*)::int`,
        })
        .from(task)
        .where(
          and(
            visibleTasks(ctx, { lenient: true }),
            eq(task.jobId, jobId),
            ne(task.status, "canceled"),
            sql`${task.estimateMin} is not null`,
            // nadřazený úkol, jehož podúkol má odhad, se nepočítá (počítá se podúkol)
            notExists(
              ctx.db
                .select({ one: sql`1` })
                .from(child)
                .where(
                  and(
                    eq(child.parentId, task.id),
                    isNull(child.deletedAt),
                    ne(child.status, "canceled"),
                    sql`${child.estimateMin} is not null`,
                  ),
                ),
            ),
          ),
        );
      return { estimateMin: r?.estimateMin ?? 0, tasks: r?.tasks ?? 0 };
    },

    async openCountsByPhase(ctx, input) {
      const rows = input.phaseIds.length
        ? await ctx.db
            .select({ phaseId: task.jobPhaseId, n: sql<number>`count(*)::int` })
            .from(task)
            .where(
              and(
                visibleTasks(ctx, { lenient: true }),
                eq(task.jobId, input.jobId),
                inArray(task.jobPhaseId, input.phaseIds),
                inArray(task.status, [...OPEN_STATUSES]),
              ),
            )
            .groupBy(task.jobPhaseId)
        : [];
      const counts = Object.fromEntries(input.phaseIds.map((id) => [id, 0]));
      for (const r of rows) if (r.phaseId) counts[r.phaseId] = r.n;
      return counts;
    },

    async completeOpenInPhases(ctx, input) {
      if (!input.phaseIds.length) return { completed: 0 };
      const ec = elevate(ctx);
      return inTx(ec, async (c) => {
        const rows = await c.db
          .select({ id: task.id })
          .from(task)
          .where(
            and(
              isNull(task.deletedAt),
              eq(task.jobId, input.jobId),
              inArray(task.jobPhaseId, input.phaseIds),
              inArray(task.status, [...OPEN_STATUSES]),
            ),
          );
        const def = deps.registry.get("task");
        if (!def || !rows.length) return { completed: 0 };
        const resolved = await resolveEntity(c.db, def);
        for (const r of rows)
          await updateRecord(c, deps.registry, resolved, r.id, { status: "done" });
        return { completed: rows.length };
      });
    },

    async listForTemplate(ctx, input) {
      const rows = await ctx.db
        .select()
        .from(task)
        .where(
          and(
            visibleTasks(ctx, { lenient: true }),
            eq(task.jobId, input.jobId),
            isNull(task.parentId),
            inArray(task.status, [...OPEN_STATUSES]),
          ),
        )
        .orderBy(sql`${task.dueDate} asc nulls last`, asc(task.createdAt));
      return rows.map((r) => ({
        phaseId: r.jobPhaseId,
        title: r.title,
        typeKey: r.typeKey,
        priority: r.priority,
        assigneeId: r.assigneeId,
        dueDate: r.dueDate,
        estimateMin: r.estimateMin,
        description: r.description,
      }));
    },

    createPrivateNote: (ctx, input) => createPrivateNote(ctx, deps, input),
  };
}
