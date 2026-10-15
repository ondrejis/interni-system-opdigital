import { and, eq, isNotNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import type { ServiceMap } from "@rebar/core/contracts";
import {
  canSeePrivate,
  indexRecord,
  syncPrivateRecord,
  visibilityForInsert,
} from "@rebar/core/entities";
import type { ModuleDeps } from "@rebar/core/module-server";
import { inTx, PermissionError, type Ctx } from "@rebar/core/rbac";
import { localParts } from "@rebar/core/time";
import { newId } from "@rebar/core/db";
import { note, task } from "./schema";
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

    async createPrivateNote(ctx, input) {
      if (!canSeePrivate(ctx))
        throw new PermissionError("Soukromou poznámku smí vytvořit jen vlastník.");
      return inTx(ctx, async (c) => {
        const id = newId();
        const vis = await visibilityForInsert(c, deps.registry, "note", { id }, true);
        const [row] = await c.db
          .insert(note)
          .values({
            id,
            title: input.title,
            bodyJson: (input.bodyJson ?? null) as Record<string, unknown> | null,
            bodyText: plainText(input.bodyJson),
            isPrivate: vis.isPrivate,
            visibilitySource: vis.visibilitySource,
            createdBy: c.actor.userId,
            updatedBy: c.actor.userId,
          })
          .returning();
        await syncPrivateRecord(c.db, "note", id, vis.isPrivate);
        await recordAudit(c, {
          action: "create",
          entityType: "note",
          entityId: id,
          summary: input.title,
          entityTitle: input.title,
          isPrivate: vis.isPrivate,
          changes: [{ field: "Název", old: null, new: input.title }],
        });
        const def = deps.registry.get("note");
        if (def && row) await indexRecord(c.db, { def }, row as Record<string, unknown>);
        return { id };
      });
    },
  };
}
