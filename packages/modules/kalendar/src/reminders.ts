import { and, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { claimReminder } from "@rebar/core/collab";
import type { Db } from "@rebar/core/db";
import { notify } from "@rebar/core/notifications";
import { formatDate } from "@rebar/core/shared";
import { addDaysIso, localParts, todayIso, zonedToUtc } from "@rebar/core/time";
import { KALENDAR_REMINDER } from "./notifications";
import { expandEvent } from "./recurrence";
import { event, eventAttendee } from "./schema";

/**
 * Připomene události, jejichž připomenutí už nastalo a začátek ještě ne. Každý výskyt (i opakované události) se
 * ohlásí právě jednou: klíč připomenutí se zabere ve stejné transakci jako upozornění, takže při chybě se pokus
 * bez ztráty zopakuje při dalším průchodu. Čas je parametr, aby šla testovat hranice dne a přechod letního času.
 */
export async function sendEventReminders(db: Db, now = new Date()): Promise<number> {
  const today = todayIso("Europe/Prague", now);
  const horizon = addDaysIso(today, 2);
  const rows = await db
    .select()
    .from(event)
    .where(
      and(
        isNull(event.deletedAt),
        isNotNull(event.reminderMinutes),
        lte(event.startsAt, zonedToUtc(horizon, "00:00")),
        or(sql`${event.recurrence} is not null`, gte(event.endsAt, now)),
      ),
    );
  let sent = 0;
  for (const e of rows) {
    const minutes = e.reminderMinutes!;
    for (const o of expandEvent(e, today, horizon)) {
      const at = o.start.getTime() - minutes * 60_000;
      if (at > now.getTime() || o.start.getTime() <= now.getTime()) continue;
      const startIso = o.start.toISOString();
      // připomenutí „den předem“ nesmí říkat jen „v 9:00“: ze zprávy musí být poznat, kdy to je
      const day =
        o.date === today ? "dnes" : o.date === addDaysIso(today, 1) ? "zítra" : formatDate(o.date);
      const when = e.allDay ? day : `${day} v ${localParts(o.start).time}`;
      await db.transaction(async (tx) => {
        if (!(await claimReminder(tx, `kalendar:${e.id}:${startIso}`))) return;
        const attendees = await tx
          .select({ userId: eventAttendee.userId })
          .from(eventAttendee)
          .where(eq(eventAttendee.eventId, e.id));
        await notify(tx, KALENDAR_REMINDER, {
          params: { title: e.title, when, location: e.location },
          to: { participant: [e.ownerId, ...attendees.map((a) => a.userId)] },
          record: { id: e.id },
          dedupe: startIso,
          at: now,
        });
        sent++;
      });
    }
  }
  return sent;
}
