import { eq } from "drizzle-orm";
import type { DomainEventHandler } from "@rebar/core/events";
import { calendarEvent } from "../schema";
import { pushJobDef, enqueuePush } from "./push";

/*
  Obsluha události `task.changed` z modulu `ukoly` (D §2.2): změna času, řešitele, typu, účastníků nebo smazání úkolu
  vloží do fronty zápisu (v téže transakci jako změna úkolu) požadavek na srovnání události v Google Kalendáři řešitele.
  Zda se úkol do Googlu opravdu zapíše (typ „v kalendáři“, termín, řešitel s připojeným účtem), rozhoduje až zpracování.
*/

/** Úkol se změnil: zařadí zápis do Googlu, má-li to smysl (už má událost, nebo má termín s časem či celý den). */
export const onTaskChanged: DomainEventHandler<"task.changed"> = async (ctx, event, deps) => {
  const { taskId, before, after } = event.data;
  const [existing] = await ctx.db
    .select({ id: calendarEvent.id })
    .from(calendarEvent)
    .where(eq(calendarEvent.taskId, taskId));
  const timed = (s: typeof after) => !!s && !!s.dueDate;
  if (!existing && !timed(after) && !timed(before)) return;
  await enqueuePush(ctx.db, taskId);
  // hned po potvrzení transakce; minutová úloha je záloha
  void deps.queue.send(pushJobDef, {}, { startAfter: 2 }).catch(() => {});
};
