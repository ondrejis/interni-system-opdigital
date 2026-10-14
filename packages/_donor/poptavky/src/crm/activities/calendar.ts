import { and, asc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import type { CalendarItem, CalendarLayerProvider } from "@rebar/core/module-server";
import { createCtx, loadActor, scopeOf } from "@rebar/core/rbac";
import { addDaysIso, localParts, todayIso, zonedToUtc } from "@rebar/core/time";
import { job } from "@rebar/zakazky/schema";
import { crmActivity, crmActivityType } from "../../schema";
import { activityEnd, dueState } from "./logic";
import { READ, visibleActivities } from "./service";

/** Aktivita otevřená v obchodní fázi se otevírá v pop-upu CRM, jinak na detailu zakázky. */
const hrefFor = (jobId: string | null, phase: string | null) =>
  !jobId
    ? "/crm/dnes"
    : phase === "inquiry" || phase === "offer"
      ? `/crm?record=${jobId}`
      : `/zakazky/${jobId}`;

const localIso = (d: Date) => {
  const p = localParts(d);
  return `${p.date}T${p.time}`;
};

/** Kolik dní zpět se aktivity dávají do odběru kalendáře (jako u událostí v kalendáři). */
const FEED_PAST_DAYS = 90;

/**
 * Kalendářní vrstva „Aktivity“: moje aktivity (přiřazené mně) s termínem v rozsahu. Hotové jsou šedé, po termínu červené.
 * Vrstva vidí jen to, co aktér smí číst (rozsah „jen moje“ platí jako všude).
 */
export const activitiesLayer: CalendarLayerProvider = {
  key: "crm.activities",
  label: "Aktivity (CRM)",
  color: "blue",
  items: async (ctx, range): Promise<CalendarItem[]> => {
    const me = ctx.actor.userId;
    if (!me || !scopeOf(ctx, READ)) return [];
    const from = zonedToUtc(range.from, "00:00");
    const to = zonedToUtc(addDaysIso(range.to, 1), "00:00");
    const rows = await ctx.db
      .select({
        a: crmActivity,
        typeName: crmActivityType.name,
        phase: job.phase,
      })
      .from(crmActivity)
      .innerJoin(crmActivityType, eq(crmActivityType.id, crmActivity.typeId))
      .leftJoin(job, eq(job.id, crmActivity.jobId))
      .where(
        and(
          visibleActivities(ctx),
          eq(crmActivity.assigneeId, me),
          isNotNull(crmActivity.dueAt),
          gte(crmActivity.dueAt, from),
          lt(crmActivity.dueAt, to),
        ),
      )
      .orderBy(asc(crmActivity.dueAt))
      .limit(500);
    const now = new Date();
    return rows.map(({ a, typeName, phase }): CalendarItem => {
      const due = a.dueAt!;
      const state = dueState(a, now);
      const end = activityEnd(due, a.allDay, a.durationMin);
      return {
        id: a.id,
        layer: "crm.activities",
        title: `${typeName}: ${a.subject}`,
        start: a.allDay ? localParts(due).date : localIso(due),
        end: a.allDay ? localParts(due).date : localIso(end),
        allDay: a.allDay,
        color: state === "done" ? "gray" : state === "overdue" ? "red" : "blue",
        href: hrefFor(a.jobId, phase),
      };
    });
  },
};

/** Událost pro odběr kalendáře (iCalendar); tvar odpovídá `IcsExportEvent` z modulu Kalendář. */
export type ActivityIcsEvent = {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  recurrence: null;
  recurrenceUntil: null;
  reminderMinutes: number | null;
  updatedAt: Date;
};

/**
 * Otevřené aktivity přiřazené uživateli pro odběr kalendáře (Google, Apple, Outlook): hotová aktivita z kalendáře zmizí.
 * Vrací prázdný seznam, když uživatel nesmí číst CRM (nebo je deaktivovaný).
 */
export async function activityIcsEvents(
  db: Executor,
  userId: string,
  host: string,
  now: Date = new Date(),
): Promise<ActivityIcsEvent[]> {
  const actor = await loadActor(db, userId);
  if (!actor) return [];
  const ctx = createCtx(db, actor);
  if (!scopeOf(ctx, READ)) return [];
  const since = zonedToUtc(addDaysIso(todayIso("Europe/Prague", now), -FEED_PAST_DAYS), "00:00");
  const rows = await db
    .select({ a: crmActivity, typeName: crmActivityType.name, jobTitle: job.title })
    .from(crmActivity)
    .innerJoin(crmActivityType, eq(crmActivityType.id, crmActivity.typeId))
    .leftJoin(job, eq(job.id, crmActivity.jobId))
    .where(
      and(
        visibleActivities(ctx),
        eq(crmActivity.assigneeId, userId),
        isNull(crmActivity.doneAt),
        isNotNull(crmActivity.dueAt),
        gte(crmActivity.dueAt, since),
      ),
    )
    .orderBy(asc(crmActivity.dueAt))
    .limit(2000);
  return rows.map(({ a, typeName, jobTitle }) => {
    const due = a.dueAt!;
    const lines = [jobTitle ? `Zakázka: ${jobTitle}` : null, a.note].filter(Boolean);
    return {
      uid: `crm-activity-${a.id}@${host}`,
      title: `${typeName}: ${a.subject}`,
      description: lines.length ? lines.join("\n") : null,
      location: a.location,
      startsAt: due,
      endsAt: activityEnd(due, a.allDay, a.durationMin),
      allDay: a.allDay,
      recurrence: null,
      recurrenceUntil: null,
      reminderMinutes: a.allDay ? null : 15,
      updatedAt: a.updatedAt,
    };
  });
}
