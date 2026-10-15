import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import type { Executor } from "@rebar/core/db";
import { inTx, NotFoundError, UserError, type Ctx } from "@rebar/core/rbac";
import { task, taskType } from "../schema";
import type { TaskTypeDto } from "../contract";
import { SYSTEM_TYPES } from "./constants";
import { typeBeforeDelete } from "./hooks";

type TypeRow = typeof taskType.$inferSelect;

const toDto = (t: TypeRow, usage?: number): TaskTypeDto => ({
  id: t.id,
  key: t.key,
  name: t.name,
  icon: t.icon,
  color: t.color,
  isCalendarEvent: t.isCalendarEvent,
  isSystem: t.isSystem,
  position: t.position,
  ...(usage !== undefined ? { usage } : {}),
});

/** Typy úkolů v pořadí z nastavení, s počtem úkolů, které je používají. */
export async function listTaskTypes(db: Executor): Promise<TaskTypeDto[]> {
  const rows = await db
    .select({
      t: taskType,
      usage: sql<number>`(select count(*)::int from ${task} where ${task.typeKey} = ${taskType.key} and ${task.deletedAt} is null)`,
    })
    .from(taskType)
    .where(isNull(taskType.deletedAt))
    .orderBy(asc(taskType.position), asc(taskType.name));
  return rows.map((r) => toDto(r.t, r.usage));
}

/** Vstup uložení typu (nový bez `id`, jinak změna; klíč se nemění). */
export type SaveTypeInput = {
  id?: string | undefined;
  key: string;
  name: string;
  icon?: string | null | undefined;
  color?: string | null | undefined;
  isCalendarEvent?: boolean | undefined;
  position?: number | undefined;
};

/** Založí nebo změní typ úkolu (Nastavení → Typy aktivit). Systémové typy smí upravit (název, ikona, barva), ne smazat. */
export async function saveTaskType(ctx: Ctx, input: SaveTypeInput): Promise<TaskTypeDto> {
  return inTx(ctx, async (c) => {
    if (input.id) {
      const [before] = await c.db
        .select()
        .from(taskType)
        .where(and(eq(taskType.id, input.id), isNull(taskType.deletedAt)));
      if (!before) throw new NotFoundError("Typ úkolu nenalezen.");
      if (before.key !== input.key) throw new UserError("Klíč typu se po založení nemění.");
      const set = {
        name: input.name,
        icon: input.icon ?? null,
        color: input.color ?? null,
        ...(input.isCalendarEvent !== undefined ? { isCalendarEvent: input.isCalendarEvent } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        updatedBy: c.actor.userId,
      };
      const [after] = await c.db
        .update(taskType)
        .set(set)
        .where(eq(taskType.id, input.id))
        .returning();
      const changes = (["name", "icon", "color", "isCalendarEvent", "position"] as const)
        .filter((k) => before[k] !== after![k])
        .map((field) => ({ field, old: before[field], new: after![field] }));
      if (changes.length)
        await recordAudit(c, {
          action: "update",
          entityType: "task_type",
          entityId: before.id,
          summary: after!.name,
          changes,
        });
      return toDto(after!);
    }
    const [dup] = await c.db
      .select({ id: taskType.id })
      .from(taskType)
      .where(and(eq(taskType.key, input.key), isNull(taskType.deletedAt)));
    if (dup) throw new UserError("Typ s tímto klíčem už existuje.");
    const [last] = await c.db
      .select({ p: sql<number>`coalesce(max(${taskType.position}), 0)::int` })
      .from(taskType)
      .where(isNull(taskType.deletedAt));
    const [created] = await c.db
      .insert(taskType)
      .values({
        key: input.key,
        name: input.name,
        icon: input.icon ?? null,
        color: input.color ?? null,
        isCalendarEvent: input.isCalendarEvent ?? false,
        isSystem: false,
        position: input.position ?? (last?.p ?? 0) + 10,
        createdBy: c.actor.userId,
        updatedBy: c.actor.userId,
      })
      .returning();
    await recordAudit(c, {
      action: "create",
      entityType: "task_type",
      entityId: created!.id,
      summary: created!.name,
      changes: [
        { field: "name", old: null, new: created!.name },
        { field: "key", old: null, new: created!.key },
      ],
    });
    return toDto(created!);
  });
}

/** Smaže (do koše) vlastní typ, který žádný úkol nepoužívá. Systémový typ nejde smazat. */
export async function deleteTaskType(ctx: Ctx, id: string): Promise<void> {
  await inTx(ctx, async (c) => {
    const [row] = await c.db
      .select()
      .from(taskType)
      .where(and(eq(taskType.id, id), isNull(taskType.deletedAt)));
    if (!row) throw new NotFoundError("Typ úkolu nenalezen.");
    await typeBeforeDelete(c, row);
    await c.db
      .update(taskType)
      .set({ deletedAt: new Date(), updatedBy: c.actor.userId })
      .where(eq(taskType.id, id));
    await recordAudit(c, {
      action: "delete",
      entityType: "task_type",
      entityId: id,
      summary: row.name,
    });
  });
}

/** Nastaví pořadí typů podle pořadí `ids` (po desítkách). */
export async function reorderTaskTypes(ctx: Ctx, ids: string[]): Promise<void> {
  await inTx(ctx, async (c) => {
    for (const [i, id] of ids.entries())
      await c.db
        .update(taskType)
        .set({ position: (i + 1) * 10, updatedBy: c.actor.userId })
        .where(and(eq(taskType.id, id), isNull(taskType.deletedAt)));
  });
}

/**
 * Idempotentní doplnění systémových typů (Úkol, Hovor, Schůzka, E-mail, Termín) při `db:seed`. Existující typ se
 * nepřepisuje (správce mohl změnit název, ikonu nebo barvu).
 */
export async function ensureTaskTypes(db: Executor): Promise<void> {
  const existing = await db
    .select({ key: taskType.key })
    .from(taskType)
    .where(isNull(taskType.deletedAt));
  const have = new Set(existing.map((t) => t.key));
  const missing = SYSTEM_TYPES.filter((t) => !have.has(t.key));
  if (!missing.length) return;
  await db.insert(taskType).values(missing.map((t) => ({ ...t, isSystem: true })));
}
