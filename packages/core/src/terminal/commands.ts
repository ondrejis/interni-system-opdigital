import { z } from "zod";
import { completeTask, listMyTasks } from "../collab/tasks";
import { visibleRecordTitles } from "../entities/engine";
import { defineCommand, type CommandDef } from "../modules/server";
import { todayIso } from "../time/dates";

/** Úkoly přihlášeného pro terminál: otevřené, termínované první, s názvem záznamu, ke kterému patří (jen když ho aktér smí vidět). */
export const myTasks = defineCommand({
  name: "core.tasks.mine",
  input: z.object({}),
  handler: async (ctx, _i, deps) => {
    const tasks = await listMyTasks(ctx);
    const byType = new Map<string, string[]>();
    for (const t of tasks)
      if (t.entityType && t.entityId)
        byType.set(t.entityType, [...(byType.get(t.entityType) ?? []), t.entityId]);
    const titles = new Map<string, Record<string, string>>();
    for (const [type, ids] of byType)
      titles.set(type, await visibleRecordTitles(ctx, deps.registry, type, ids));
    const today = todayIso();
    return {
      today,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        overdue: !!t.dueDate && t.dueDate < today,
        record: t.entityId ? (titles.get(t.entityType ?? "")?.[t.entityId] ?? null) : null,
      })),
    };
  },
});

/** Odškrtnutí úkolu z terminálu (jde i přes zápisovou frontu). Oprávnění k úkolu hlídá `completeTask`. */
export const completeMyTask = defineCommand({
  name: "core.tasks.complete",
  input: z.object({ taskId: z.uuid(), done: z.boolean().default(true) }),
  handler: async (ctx, i) => {
    await completeTask(ctx, i.taskId, i.done);
    return { taskId: i.taskId, done: i.done };
  },
});

/** Příkazy platformy pro terminál. Aplikace je přidá k příkazům zapnutých modulů. */
export const coreTerminalCommands: readonly CommandDef[] = [
  myTasks,
  completeMyTask,
] as CommandDef[];
