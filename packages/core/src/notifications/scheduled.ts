import { and, asc, isNull, lte } from "drizzle-orm";
import { schema, type Executor } from "../db/client";
import { isWorkday, localParts } from "../time/dates";
import { getNotificationRuntime, TASK_DUE_TODAY } from "./catalog";
import { notify } from "./notify";
import { countOf } from "./text";

/**
 * Ranní přehled úkolů: každému, kdo má úkoly s dnešním termínem nebo po termínu, přijde jedno upozornění.
 * Idempotentní (událost má `dedupe: "day"`), takže opakované spuštění ve stejný den nic nezdvojí; o víkendech
 * a státních svátcích se neposílá.
 */
export async function sendTaskDigests(
  db: Executor,
  now = new Date(),
): Promise<{ users: number; created: number }> {
  const today = localParts(now, getNotificationRuntime().timezone).date;
  if (!isWorkday(today)) return { users: 0, created: 0 };
  const rows = await db
    .select({
      assigneeId: schema.task.assigneeId,
      title: schema.task.title,
      dueDate: schema.task.dueDate,
    })
    .from(schema.task)
    .where(
      and(
        isNull(schema.task.doneAt),
        isNull(schema.task.deletedAt),
        lte(schema.task.dueDate, today),
      ),
    )
    .orderBy(asc(schema.task.dueDate), asc(schema.task.createdAt));
  const byUser = new Map<string, { today: string[]; overdue: string[] }>();
  for (const r of rows) {
    const e = byUser.get(r.assigneeId) ?? { today: [], overdue: [] };
    (r.dueDate === today ? e.today : e.overdue).push(r.title);
    byUser.set(r.assigneeId, e);
  }
  let created = 0;
  for (const [userId, e] of byUser) {
    const parts = [
      e.today.length ? `${countOf(e.today.length, "úkol", "úkoly", "úkolů")} na dnes` : null,
      e.overdue.length ? `${e.overdue.length} po termínu` : null,
    ].filter(Boolean);
    const titles = [...e.overdue, ...e.today];
    const r = await notify(db, TASK_DUE_TODAY, {
      to: { assignee: [userId] },
      at: now,
      params: {
        summary: parts.join(", "),
        list:
          titles.slice(0, 3).join(" · ") +
          (titles.length > 3 ? ` · …a ${titles.length - 3} dalších` : ""),
      },
    });
    created += r.created;
  }
  return { users: byUser.size, created };
}
