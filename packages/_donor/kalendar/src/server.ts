import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { defineModuleJob, defineModuleServer } from "@rebar/core/module-server";
import { can } from "@rebar/core/rbac";
import { addDaysIso, localParts, todayIso, zonedToUtc } from "@rebar/core/time";
import { commands } from "./commands";
import { entities, eventEntity, resourceEntity } from "./entities";
import { expandEvent } from "./recurrence";
import { sendEventReminders } from "./reminders";
import {
  calendarFeed,
  calendarImport,
  calendarResource,
  event,
  eventAttendee,
  externalEvent,
} from "./schema";
import { syncImport } from "./sync";

export const server = defineModuleServer({
  entities,
  commands,
  widgets: [
    async (ctx) => {
      const userId = ctx.actor.userId;
      if (!userId || !can(ctx, "kalendar.read")) return [];
      const today = todayIso();
      const rows = await ctx.db
        .select()
        .from(event)
        .where(
          and(
            isNull(event.deletedAt),
            lte(event.startsAt, zonedToUtc(addDaysIso(today, 1), "00:00")),
            or(sql`${event.recurrence} is not null`, gte(event.endsAt, zonedToUtc(today, "00:00"))),
            or(
              eq(event.ownerId, userId),
              sql`exists (select 1 from ${eventAttendee} where ${eventAttendee.eventId} = ${event.id} and ${eventAttendee.userId} = ${userId})`,
            ),
          ),
        );
      const todays = rows
        .flatMap((e) =>
          expandEvent(e, today, today).map((o) => ({
            title: e.title,
            allDay: e.allDay,
            start: o.start,
          })),
        )
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      const now = Date.now();
      const next = todays.find((t) => t.allDay || t.start.getTime() >= now);
      return [
        {
          id: "calendar-today",
          module: "kalendar",
          title: "Dnešní události",
          value: String(todays.length),
          ...(next
            ? { hint: `${next.allDay ? "Celý den" : localParts(next.start).time}: ${next.title}` }
            : {}),
          href: "/kalendar",
          order: 10,
        },
      ];
    },
  ],
  jobs: [
    defineModuleJob({
      name: "kalendar.reminders",
      schema: z.object({}),
      cron: "*/5 * * * *",
      retryLimit: 1,
      async handler(deps) {
        await sendEventReminders(deps.db);
      },
    }),
    defineModuleJob({
      name: "kalendar.sync",
      schema: z.object({}),
      cron: "10 * * * *",
      retryLimit: 1,
      async handler(deps) {
        const stale = new Date(Date.now() - 50 * 60_000);
        const imports = await deps.db
          .select({ id: calendarImport.id })
          .from(calendarImport)
          .where(or(isNull(calendarImport.lastSyncAt), lte(calendarImport.lastSyncAt, stale)));
        for (const i of imports) await syncImport(deps.db, deps.cipher, i.id);
      },
    }),
  ],
});

export { entities, eventEntity, resourceEntity };
export { calendarFeed, calendarImport, calendarResource, event, eventAttendee, externalEvent };
export { commands };
export { sendEventReminders } from "./reminders";
export { feedForToken, hashToken, regenerateFeedToken, syncImport } from "./sync";
export * from "./recurrence";
export { buildIcs, parseIcs, expandIcs } from "./ics";
export {
  FetchBlockedError,
  fetchCalendarText,
  isPrivateIp,
  parsePublicUrl,
  safeLookup,
} from "./safe-fetch";
