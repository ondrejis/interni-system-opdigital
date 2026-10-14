import { createHash } from "node:crypto";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { randomToken, type Cipher } from "@rebar/core/security";
import { schema, type Executor } from "@rebar/core/db";
import { addDaysIso, todayIso, zonedToUtc } from "@rebar/core/time";
import { buildIcs, expandIcs, parseIcs, type IcsExportEvent } from "./ics";
import { FetchBlockedError, fetchCalendarText, type Transport } from "./safe-fetch";
import { calendarFeed, calendarImport, event, eventAttendee, externalEvent } from "./schema";

/** Otisk tokenu odběru; v databázi je jen on, token zná jen uživatel. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Vytvoří (nebo nahradí) odkaz na odběr kalendáře uživatele a vrátí token, který se ukáže jen jednou. */
export async function regenerateFeedToken(db: Executor, userId: string): Promise<string> {
  const token = randomToken(24);
  await db
    .insert(calendarFeed)
    .values({ userId, tokenHash: hashToken(token) })
    .onConflictDoUpdate({
      target: calendarFeed.userId,
      set: { tokenHash: hashToken(token), createdAt: new Date(), lastFetchAt: null },
    });
  return token;
}

const FEED_PAST_DAYS = 90;

/**
 * Kalendář uživatele ve formátu iCalendar podle tajného tokenu (bez přihlášení). Vrací `null`, když token neexistuje.
 * Obsahuje události, které uživatel vlastní nebo na které je pozvaný; opakování jde jako pravidlo, ne jako výskyty.
 * `extraEvents` doplní události jiných modulů (aktivity CRM) pro vlastníka odběru.
 */
export async function feedForToken(
  db: Executor,
  token: string,
  host: string,
  calendarName = "Kalendář",
  extraEvents?: (userId: string) => Promise<IcsExportEvent[]>,
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  const [feed] = await db
    .select()
    .from(calendarFeed)
    .where(eq(calendarFeed.tokenHash, hashToken(token)));
  if (!feed) return null;
  // odběr deaktivovaného (nebo smazaného) uživatele nesmí dál vydávat jeho události: token přežije odhlášení relací
  const [owner] = await db
    .select({ active: schema.user.active, deletedAt: schema.user.deletedAt })
    .from(schema.user)
    .where(eq(schema.user.id, feed.userId));
  if (!owner || !owner.active || owner.deletedAt) return null;
  if (!feed.lastFetchAt || Date.now() - feed.lastFetchAt.getTime() > 60_000)
    await db
      .update(calendarFeed)
      .set({ lastFetchAt: new Date() })
      .where(eq(calendarFeed.userId, feed.userId));

  const since = zonedToUtc(addDaysIso(todayIso(), -FEED_PAST_DAYS), "00:00");
  const rows = await db
    .select()
    .from(event)
    .where(
      and(
        isNull(event.deletedAt),
        or(
          eq(event.ownerId, feed.userId),
          sql`exists (select 1 from ${eventAttendee} where ${eventAttendee.eventId} = ${event.id} and ${eventAttendee.userId} = ${feed.userId})`,
        ),
        or(gte(event.endsAt, since), sql`${event.recurrence} is not null`),
      ),
    );
  const events: IcsExportEvent[] = rows.map((e) => ({
    uid: `${e.id}@${host}`,
    title: e.title,
    description: e.note,
    location: e.location,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    recurrence: e.recurrence,
    recurrenceUntil: e.recurrenceUntil,
    reminderMinutes: e.reminderMinutes,
    updatedAt: e.updatedAt,
  }));
  // události jiných modulů (aktivity CRM): dodá je volající, Kalendář je nezná
  if (extraEvents) events.push(...(await extraEvents(feed.userId)));
  return buildIcs(events, calendarName);
}

const SYNC_PAST_DAYS = 30;
const SYNC_FUTURE_DAYS = 180;

/** Synchronizace jednoho importu: okno −30 až +180 dní, výskyty se uloží jako „obsazeno“. */
export async function syncImport(
  db: Executor,
  cipher: Cipher,
  importId: string,
  transport?: Transport,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const [imp] = await db.select().from(calendarImport).where(eq(calendarImport.id, importId));
  if (!imp) return { ok: false, error: "Import nenalezen." };
  try {
    const url = cipher.decrypt(imp.urlEncrypted);
    if (!url)
      throw new FetchBlockedError(
        "Adresu kalendáře se nepodařilo přečíst, připojte kalendář znovu.",
      );
    const text = await fetchCalendarText(url, transport ? { transport } : {});
    const from = addDaysIso(todayIso(), -SYNC_PAST_DAYS);
    const to = addDaysIso(todayIso(), SYNC_FUTURE_DAYS);
    const rows = parseIcs(text).flatMap((ev) =>
      expandIcs(ev, from, to).map((o, i) => ({
        importId,
        uid: i ? `${ev.uid}#${o.start.toISOString()}` : ev.uid,
        title: ev.title,
        startsAt: o.start,
        endsAt: o.end,
        allDay: ev.allDay,
      })),
    );
    await db.transaction(async (tx) => {
      await tx.delete(externalEvent).where(eq(externalEvent.importId, importId));
      for (let i = 0; i < rows.length; i += 500)
        await tx.insert(externalEvent).values(rows.slice(i, i + 500));
      await tx
        .update(calendarImport)
        .set({ lastSyncAt: new Date(), lastError: null, eventCount: rows.length })
        .where(eq(calendarImport.id, importId));
    });
    return { ok: true, count: rows.length };
  } catch (err) {
    const error =
      err instanceof FetchBlockedError ? err.message : "Kalendář se nepodařilo stáhnout.";
    await db
      .update(calendarImport)
      .set({ lastSyncAt: new Date(), lastError: error })
      .where(eq(calendarImport.id, importId));
    return { ok: false, error };
  }
}
