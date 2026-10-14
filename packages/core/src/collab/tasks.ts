import { and, asc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import "../zod-locale";
import { auditChange, recordAudit } from "../audit/audit";
import { schema } from "../db/client";
import { assertEntityAccess } from "../entities/policy";
import { formatDate } from "../entities/shared";
import { inTx } from "../rbac/context";
import { NotFoundError, PermissionError, UserError } from "../rbac/errors";
import { can, scopeOf } from "../rbac/permissions";
import type { Ctx } from "../rbac/types";
import { TASK_ASSIGNED, TASK_DONE, TASK_DUE_CHANGED } from "../notifications/catalog";
import { notify } from "../notifications/notify";

function actorId(ctx: Ctx): string {
  if (!ctx.actor.userId) throw new PermissionError();
  return ctx.actor.userId;
}

export const taskInput = z.object({
  title: z.string().trim().min(2, "Napište, co je potřeba udělat.").max(300),
  description: z.string().trim().max(5000).nullish(),
  assigneeId: z.uuid().nullish(),
  dueDate: z.iso.date("Neplatné datum.").nullish(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  entityType: z.string().min(1).nullish(),
  entityId: z.uuid().nullish(),
});

type TaskRow = typeof schema.task.$inferSelect;

/** Které úkoly aktér vidí: `tasks.read` v rozsahu `all` všechny, jinak jen přidělené nebo zadané jím. */
function visibleWhere(ctx: Ctx): SQL | undefined {
  if (scopeOf(ctx, "tasks.read") === "all") return undefined;
  const me = actorId(ctx);
  return or(eq(schema.task.assigneeId, me), eq(schema.task.createdBy, me));
}

function canTouch(ctx: Ctx, t: TaskRow) {
  const me = ctx.actor.userId;
  return can(ctx, "tasks.assign") || t.assigneeId === me || t.createdBy === me;
}

export async function createTask(ctx: Ctx, raw: z.input<typeof taskInput>) {
  const input = taskInput.parse(raw);
  const me = actorId(ctx);
  const assigneeId = input.assigneeId ?? me;
  if (assigneeId !== me && !can(ctx, "tasks.assign")) {
    throw new UserError("Úkoly můžete zadávat jen sobě. Přidělování ostatním vyžaduje oprávnění.");
  }
  if (!!input.entityType !== !!input.entityId)
    throw new UserError("Vazba na záznam musí mít typ i id.");

  return inTx(ctx, async (c) => {
    const policy =
      input.entityType && input.entityId
        ? await assertEntityAccess(c, input.entityType, input.entityId, "read")
        : null;
    const [assignee] = await c.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(
        and(
          eq(schema.user.id, assigneeId),
          eq(schema.user.active, true),
          isNull(schema.user.deletedAt),
        ),
      );
    if (!assignee) throw new UserError("Řešitel úkolu neexistuje nebo je deaktivovaný.");

    const [row] = await c.db
      .insert(schema.task)
      .values({
        title: input.title,
        description: input.description ?? null,
        assigneeId,
        dueDate: input.dueDate ?? null,
        priority: input.priority,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        createdBy: me,
        updatedBy: me,
      })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "task",
      entityId: row!.id,
      summary: input.title,
      changes: [
        { field: "title", old: null, new: input.title },
        { field: "assigneeId", old: null, new: assigneeId },
        { field: "dueDate", old: null, new: input.dueDate ?? null },
      ],
    });
    if (assigneeId !== me) {
      const [author] = await c.db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, me));
      await notify(c.db, TASK_ASSIGNED, {
        params: {
          title: input.title,
          due: input.dueDate ? formatDate(input.dueDate) : null,
          author: author?.name ?? "kolega",
        },
        to: { assignee: [assigneeId] },
        record: { type: "task", id: row!.id },
        url: policy?.url?.(input.entityId!) ?? "/ukoly",
        actorId: me,
      });
    }
    return row!;
  });
}

export async function listTasks(
  ctx: Ctx,
  filter: { assigneeId?: string; open?: boolean; entityType?: string; entityId?: string } = {},
) {
  return ctx.db
    .select()
    .from(schema.task)
    .where(
      and(
        isNull(schema.task.deletedAt),
        visibleWhere(ctx),
        filter.assigneeId ? eq(schema.task.assigneeId, filter.assigneeId) : undefined,
        filter.open === undefined
          ? undefined
          : filter.open
            ? isNull(schema.task.doneAt)
            : sql`${schema.task.doneAt} is not null`,
        filter.entityType ? eq(schema.task.entityType, filter.entityType) : undefined,
        filter.entityId ? eq(schema.task.entityId, filter.entityId) : undefined,
      ),
    )
    .orderBy(
      asc(schema.task.doneAt),
      sql`${schema.task.dueDate} asc nulls last`,
      asc(schema.task.createdAt),
    )
    .limit(500);
}

/** „Moje úkoly“: otevřené úkoly přihlášeného, termínované první. */
export function listMyTasks(ctx: Ctx) {
  return listTasks(ctx, { assigneeId: actorId(ctx), open: true });
}

async function loadTouchable(ctx: Ctx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(schema.task)
    .where(and(eq(schema.task.id, id), isNull(schema.task.deletedAt), visibleWhere(ctx)));
  if (!row) throw new NotFoundError("Úkol nenalezen.");
  if (!canTouch(ctx, row)) throw new PermissionError();
  return row;
}

export async function completeTask(ctx: Ctx, id: string, done = true) {
  const me = actorId(ctx);
  await inTx(ctx, async (c) => {
    const before = await loadTouchable(c, id);
    const doneAt = done ? new Date() : null;
    await c.db.update(schema.task).set({ doneAt, updatedBy: me }).where(eq(schema.task.id, id));
    await auditChange(c, {
      entityType: "task",
      entityId: id,
      before: { doneAt: before.doneAt },
      after: { doneAt },
      summary: done ? "Úkol splněn" : "Úkol znovu otevřen",
    });
    if (
      done &&
      before.createdBy &&
      before.createdBy !== before.assigneeId &&
      before.createdBy !== me
    ) {
      await notify(c.db, TASK_DONE, {
        params: { title: before.title },
        to: { author: [before.createdBy] },
        record: { type: "task", id },
        actorId: me,
      });
    }
  });
}

export async function updateTask(ctx: Ctx, id: string, raw: Partial<z.input<typeof taskInput>>) {
  const me = actorId(ctx);
  const patch = taskInput.partial().parse(raw);
  await inTx(ctx, async (c) => {
    const before = await loadTouchable(c, id);
    if (
      patch.assigneeId &&
      patch.assigneeId !== before.assigneeId &&
      patch.assigneeId !== me &&
      !can(c, "tasks.assign")
    ) {
      throw new UserError("Přidělování ostatním vyžaduje oprávnění.");
    }
    const after = {
      title: patch.title ?? before.title,
      description:
        patch.description === undefined ? before.description : (patch.description ?? null),
      assigneeId: patch.assigneeId ?? before.assigneeId,
      dueDate: patch.dueDate === undefined ? before.dueDate : (patch.dueDate ?? null),
      priority: patch.priority ?? before.priority,
    };
    await c.db
      .update(schema.task)
      .set({ ...after, updatedBy: me })
      .where(eq(schema.task.id, id));
    await auditChange(c, {
      entityType: "task",
      entityId: id,
      before: { ...before },
      after: { ...after },
    });
    if (after.assigneeId !== before.assigneeId && after.assigneeId !== me) {
      await notify(c.db, TASK_ASSIGNED, {
        params: {
          title: after.title,
          due: after.dueDate ? formatDate(after.dueDate) : null,
          author: null,
        },
        to: { assignee: [after.assigneeId] },
        record: { type: "task", id },
        actorId: me,
      });
    } else if (after.dueDate !== before.dueDate && after.assigneeId !== me) {
      // termín změnil někdo jiný než ten, komu úkol patří
      await notify(c.db, TASK_DUE_CHANGED, {
        params: {
          title: after.title,
          due: after.dueDate ? formatDate(after.dueDate) : "bez termínu",
          previous: before.dueDate ? formatDate(before.dueDate) : "bez termínu",
        },
        to: { assignee: [after.assigneeId] },
        record: { type: "task", id },
        actorId: me,
      });
    }
  });
}

export async function deleteTask(ctx: Ctx, id: string) {
  const me = actorId(ctx);
  await inTx(ctx, async (c) => {
    const before = await loadTouchable(c, id);
    await c.db
      .update(schema.task)
      .set({ deletedAt: new Date(), updatedBy: me })
      .where(eq(schema.task.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "task",
      entityId: id,
      summary: before.title,
    });
  });
}
