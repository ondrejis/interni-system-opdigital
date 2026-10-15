import { and, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { recordAudit } from "@rebar/core/audit";
import { inTx, type Ctx } from "@rebar/core/rbac";
import type { Executor } from "@rebar/core/db";
import { addDaysIso, todayIso, zonedToUtc } from "@rebar/core/time";
import { BUSY_TITLE, CALENDAR_TIME_ZONE } from "../contract";
import { calendar, calendarAccount, calendarEvent, calendarPush } from "../schema";
import { markAccount, withToken, type AccountRow, type CalendarRow } from "./accounts";
import {
  GoogleAuthError,
  GoogleGoneError,
  type GoogleCalendarClient,
  type GoogleEvent,
} from "./client";
import { resolveConflict } from "./conflict";
import { googleClient, googleCtx, type KalEnv } from "./env";
import { sqlContactLookup, registryTaskGateway, type TaskGateway } from "./foreign";
import { fromGoogleEvent, timesToTask, type MirrorFields } from "./mapping";

/*
  Synchronizace Google → OPSYS. Úplná synchronizace okna (−60 dní, +365 dní; výskyty opakovaných událostí rozbaluje
  Google, `singleEvents=true`) uloží `syncToken`; dál běží přírůstky podle tokenu. Vypršel-li token (410) nebo se okno
  blíží ke konci, proběhne úplná synchronizace znovu. Události z OPSYS (nesou `opsysTaskId`) se při změně v Googlu
  propíšou zpět do úkolu; konflikt s čekající změnou z OPSYS rozhoduje novější (`conflict.ts`).
*/

const PAST_DAYS = 60;
const FUTURE_DAYS = 365;
/** Zbývá-li do konce okna méně dní, běží úplná synchronizace znovu a okno se posune. */
const REWINDOW_DAYS = 45;
/** Záložní synchronizace: kalendář s živým push kanálem se čte jednou za 5 minut, bez něj každou minutu. */
const POLL_WITH_PUSH_MS = 5 * 60_000;
const POLL_WITHOUT_PUSH_MS = 60_000;

type EventRow = typeof calendarEvent.$inferSelect;

/** Výsledek synchronizace jednoho kalendáře. */
export type SyncOutcome = { changed: number; full: boolean };

/** Přístup k úkolům přes registr entit; `null`, když modul úkolů není zapnutý. */
export const taskGatewayOf = (env: KalEnv): TaskGateway | null =>
  registryTaskGateway(env.registry, sqlContactLookup);

function mirrorValues(f: MirrorFields) {
  return {
    title: f.title,
    description: f.description,
    place: f.place,
    meetUrl: f.meetUrl,
    startsAt: f.startsAt,
    endsAt: f.endsAt,
    allDay: f.allDay,
    attendees: f.attendees,
    visibility: f.visibility,
    isGooglePrivate: f.isGooglePrivate,
    recurringEventId: f.recurringEventId,
    originalStartAt: f.originalStartAt,
    htmlLink: f.htmlLink,
    organizerEmail: f.organizerEmail,
    etag: f.etag,
    googleUpdatedAt: f.googleUpdatedAt,
  };
}

/** Zapíše do historie změnu události z Googlu (aktér `google`); soukromá událost je v historii soukromá a bez názvu. */
async function auditEvent(
  ctx: Ctx,
  action: "create" | "update" | "delete",
  row: Pick<
    EventRow,
    "id" | "title" | "isGooglePrivate" | "dealId" | "companyId" | "personId" | "taskId"
  >,
) {
  const priv = row.isGooglePrivate;
  await recordAudit(ctx, {
    action,
    entityType: "calendar_event",
    entityId: row.id,
    entityTitle: priv ? BUSY_TITLE : (row.title ?? "(bez názvu)"),
    isPrivate: priv,
    summary:
      action === "create"
        ? "Událost z Google Kalendáře"
        : action === "delete"
          ? "Událost smazána v Google Kalendáři"
          : "Událost změněna v Google Kalendáři",
    context: {
      ...(row.dealId ? { dealId: row.dealId } : {}),
      ...(row.companyId ? { companyId: row.companyId } : {}),
      ...(row.personId ? { personId: row.personId } : {}),
      ...(row.taskId ? { taskId: row.taskId } : {}),
    },
  });
}

/** Použije jednu událost z Googlu na zrcadlo. Vrací, zda se něco změnilo. */
export async function applyRemoteEvent(
  ctx: Ctx,
  env: KalEnv,
  cal: Pick<CalendarRow, "id">,
  e: GoogleEvent,
  opts: { audit: boolean; gateway: TaskGateway | null },
): Promise<boolean> {
  const remote = fromGoogleEvent(e);
  return inTx(ctx, async (c) => {
    const [row] = await c.db
      .select()
      .from(calendarEvent)
      .where(
        and(eq(calendarEvent.calendarId, cal.id), eq(calendarEvent.googleId, remote.googleId)),
      );

    if (remote.deleted) {
      if (!row) return false;
      if (row.taskId) {
        // událost z OPSYS smazaná v Googlu: úkol zůstane, řádek je náhrobek (nová změna úkolu událost založí znovu)
        if (row.remoteDeleted) return false;
        await c.db
          .update(calendarEvent)
          .set({ remoteDeleted: true, remoteDeletedAt: new Date() })
          .where(eq(calendarEvent.id, row.id));
      } else {
        await c.db.delete(calendarEvent).where(eq(calendarEvent.id, row.id));
      }
      if (opts.audit) await auditEvent(c, "delete", row);
      return true;
    }

    const f = remote.fields;
    if (row && !row.remoteDeleted && row.etag && row.etag === f.etag) return false;

    // vazba na úkol: jen když úkol existuje a jeho událost není jiný řádek (kopie události v Googlu nese stejné id úkolu)
    let taskId = row?.taskId ?? null;
    if (!taskId && remote.taskId && opts.gateway) {
      const [taken] = await c.db
        .select({ id: calendarEvent.id })
        .from(calendarEvent)
        .where(eq(calendarEvent.taskId, remote.taskId));
      if (!taken && (await opts.gateway.existing(c, [remote.taskId])).has(remote.taskId))
        taskId = remote.taskId;
    }

    const [pending] = taskId
      ? await c.db
          .select()
          .from(calendarPush)
          .where(and(eq(calendarPush.taskId, taskId), isNull(calendarPush.doneAt)))
      : [];
    const winner = resolveConflict({
      localQueuedAt: pending?.queuedAt ?? null,
      remoteUpdatedAt: f.googleUpdatedAt,
    });

    if (row && winner === "local") {
      // změna z OPSYS je novější a čeká na zápis: z Googlu bereme jen to, co OPSYS nespravuje
      await c.db
        .update(calendarEvent)
        .set({
          etag: f.etag,
          googleUpdatedAt: f.googleUpdatedAt,
          htmlLink: f.htmlLink,
          meetUrl: f.meetUrl,
          attendees: f.attendees,
          remoteDeleted: false,
          remoteDeletedAt: null,
        })
        .where(eq(calendarEvent.id, row.id));
      return true;
    }

    const values = {
      ...mirrorValues(f),
      taskId,
      source: taskId ? ("opsys" as const) : ("google" as const),
      remoteDeleted: false,
      remoteDeletedAt: null,
    };
    let saved: EventRow;
    if (row) {
      [saved] = (await c.db
        .update(calendarEvent)
        .set(values)
        .where(eq(calendarEvent.id, row.id))
        .returning()) as [EventRow];
    } else {
      [saved] = (await c.db
        .insert(calendarEvent)
        .values({ calendarId: cal.id, googleId: remote.googleId, ...values })
        .onConflictDoUpdate({
          target: [calendarEvent.calendarId, calendarEvent.googleId],
          set: values,
        })
        .returning()) as [EventRow];
    }
    if (pending) {
      // změna z Googlu byla novější: čekající zápis z OPSYS se zahazuje
      await c.db
        .update(calendarPush)
        .set({ doneAt: new Date(), lastError: "Přebito novější změnou z Googlu." })
        .where(eq(calendarPush.id, pending.id));
    }
    // přetažení nebo přejmenování v Googlu se propíše do úkolu
    if (row && taskId && opts.gateway) {
      const timeChanged =
        row.startsAt.getTime() !== f.startsAt.getTime() ||
        row.endsAt.getTime() !== f.endsAt.getTime() ||
        row.allDay !== f.allDay;
      const titleChanged = (row.title ?? "") !== (f.title ?? "") && !!f.title;
      const placeChanged = (row.place ?? "") !== (f.place ?? "");
      if (timeChanged || titleChanged || placeChanged) {
        const state = await opts.gateway.load(c, taskId);
        if (state && !state.gone && (state.status === "todo" || state.status === "in_progress"))
          await opts.gateway.applyTimes(c, taskId, {
            ...timesToTask(f),
            place: f.place,
            ...(titleChanged ? { title: f.title! } : {}),
          });
      }
    }
    if (opts.audit) await auditEvent(c, row ? "update" : "create", saved);
    return true;
  });
}

/** Synchronizuje jeden kalendář (přírůstkově, nebo úplně). Chyby Googlu propadají volajícímu. */
export async function syncCalendar(
  db: Executor,
  env: KalEnv,
  calendarId: string,
  opts: { full?: boolean; client?: GoogleCalendarClient } = {},
): Promise<SyncOutcome> {
  const ctx = googleCtx(db);
  const [cal] = await db
    .select()
    .from(calendar)
    .where(and(eq(calendar.id, calendarId), isNull(calendar.deletedAt)));
  if (!cal || (!cal.visible && !cal.isWriteTarget)) return { changed: 0, full: false };
  const [account] = await db
    .select()
    .from(calendarAccount)
    .where(and(eq(calendarAccount.id, cal.accountId), isNull(calendarAccount.deletedAt)));
  if (!account || account.status === "reauth") return { changed: 0, full: false };
  const client = opts.client ?? (await googleClient(db, env));
  const gateway = taskGatewayOf(env);

  const today = todayIso();
  const windowEnding = !!cal.syncWindowTo && cal.syncWindowTo < addDaysIso(today, REWINDOW_DAYS);
  const full = !!opts.full || !cal.syncToken || windowEnding;

  try {
    const result = full
      ? await fullSync(ctx, env, client, account, cal, gateway)
      : await incrementalSync(ctx, env, client, account, cal, gateway);
    await db
      .update(calendar)
      .set({ lastSyncAt: new Date(), lastError: null })
      .where(eq(calendar.id, cal.id));
    await db
      .update(calendarAccount)
      .set({
        lastSyncAt: new Date(),
        ...(account.status === "error" ? { status: "ok" as const, lastError: null } : {}),
      })
      .where(eq(calendarAccount.id, account.id));
    return result;
  } catch (e) {
    if (e instanceof GoogleGoneError && !full)
      return syncCalendar(db, env, calendarId, { ...opts, full: true });
    const message = e instanceof Error ? e.message : String(e);
    await db.update(calendar).set({ lastError: message }).where(eq(calendar.id, cal.id));
    if (e instanceof GoogleAuthError) await markAccount(ctx, account.id, "reauth", message);
    else await markAccount(ctx, account.id, "error", message);
    throw e;
  }
}

async function fullSync(
  ctx: Ctx,
  env: KalEnv,
  client: GoogleCalendarClient,
  account: AccountRow,
  cal: CalendarRow,
  gateway: TaskGateway | null,
): Promise<SyncOutcome> {
  const today = todayIso();
  const timeMin = zonedToUtc(addDaysIso(today, -PAST_DAYS), "00:00", CALENDAR_TIME_ZONE);
  const timeMax = zonedToUtc(addDaysIso(today, FUTURE_DAYS), "00:00", CALENDAR_TIME_ZONE);
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let syncToken: string | undefined;
  do {
    const page = await withToken(ctx, env, client, account, (token) =>
      client.listEvents(token, cal.googleId, {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        ...(pageToken ? { pageToken } : {}),
      }),
    );
    events.push(...page.events);
    pageToken = page.nextPageToken;
    syncToken = page.nextSyncToken ?? syncToken;
  } while (pageToken);

  let changed = 0;
  const seen = new Set<string>();
  for (const e of events) {
    if (fromGoogleEvent(e).deleted === false) seen.add(e.id);
    // první synchronizace do historie nepíše (stovky událostí by ji zahltily); další úplné ano
    if (await applyRemoteEvent(ctx, env, cal, e, { audit: !!cal.syncToken, gateway })) changed++;
  }
  // co je v okně v zrcadle a z Googlu už nepřišlo, bylo smazáno
  const stale = await ctx.db
    .select()
    .from(calendarEvent)
    .where(
      and(
        eq(calendarEvent.calendarId, cal.id),
        lt(calendarEvent.startsAt, timeMax),
        gt(calendarEvent.endsAt, timeMin),
        eq(calendarEvent.remoteDeleted, false),
      ),
    );
  for (const r of stale.filter((s) => !seen.has(s.googleId))) {
    await applyRemoteEvent(
      ctx,
      env,
      cal,
      { id: r.googleId, status: "cancelled" },
      { audit: !!cal.syncToken, gateway },
    );
    changed++;
  }
  await ctx.db
    .update(calendar)
    .set({ syncToken: syncToken ?? null, syncWindowTo: addDaysIso(today, FUTURE_DAYS) })
    .where(eq(calendar.id, cal.id));
  return { changed, full: true };
}

async function incrementalSync(
  ctx: Ctx,
  env: KalEnv,
  client: GoogleCalendarClient,
  account: AccountRow,
  cal: CalendarRow,
  gateway: TaskGateway | null,
): Promise<SyncOutcome> {
  let changed = 0;
  let pageToken: string | undefined;
  let next: string | undefined;
  do {
    const page = await withToken(ctx, env, client, account, (token) =>
      client.listEvents(token, cal.googleId, {
        syncToken: cal.syncToken!,
        ...(pageToken ? { pageToken } : {}),
      }),
    );
    for (const e of page.events)
      if (await applyRemoteEvent(ctx, env, cal, e, { audit: true, gateway })) changed++;
    pageToken = page.nextPageToken;
    next = page.nextSyncToken ?? next;
  } while (pageToken);
  if (next) await ctx.db.update(calendar).set({ syncToken: next }).where(eq(calendar.id, cal.id));
  return { changed, full: false };
}

/** Synchronizuje všechny zobrazené kalendáře účtu (ruční „Synchronizovat teď“). Chyby vrací jako texty. */
export async function syncAccount(
  db: Executor,
  env: KalEnv,
  accountId: string,
  opts: { full?: boolean } = {},
): Promise<{ calendars: number; changed: number; errors: string[] }> {
  const cals = await db
    .select()
    .from(calendar)
    .where(
      and(
        eq(calendar.accountId, accountId),
        isNull(calendar.deletedAt),
        or(eq(calendar.visible, true), eq(calendar.isWriteTarget, true)),
      ),
    );
  let changed = 0;
  const errors: string[] = [];
  for (const c of cals) {
    try {
      changed += (await syncCalendar(db, env, c.id, opts)).changed;
    } catch (e) {
      errors.push(`${c.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { calendars: cals.length, changed, errors };
}

/** Je kalendář na řadě podle `lastSyncAt` (push kanál = záložní čtení jednou za 5 minut, jinak každou minutu)? */
export function pollDue(
  cal: Pick<CalendarRow, "lastSyncAt" | "watchChannelId" | "watchExpiresAt">,
  now = new Date(),
): boolean {
  if (!cal.lastSyncAt) return true;
  const pushAlive = !!cal.watchChannelId && !!cal.watchExpiresAt && cal.watchExpiresAt > now;
  const every = pushAlive ? POLL_WITH_PUSH_MS : POLL_WITHOUT_PUSH_MS;
  return now.getTime() - cal.lastSyncAt.getTime() >= every - 5_000;
}

/** Záložní čtení: všechny kalendáře, které jsou na řadě. Chyba jednoho kalendáře ostatní nezastaví. */
export async function pollAll(db: Executor, env: KalEnv, now = new Date()): Promise<number> {
  const cals = await db
    .select({ cal: calendar })
    .from(calendar)
    .innerJoin(calendarAccount, eq(calendarAccount.id, calendar.accountId))
    .where(
      and(
        isNull(calendar.deletedAt),
        isNull(calendarAccount.deletedAt),
        ne(calendarAccount.status, "reauth"),
        or(eq(calendar.visible, true), eq(calendar.isWriteTarget, true)),
      ),
    );
  let n = 0;
  for (const { cal } of cals) {
    if (!pollDue(cal, now)) continue;
    try {
      await syncCalendar(db, env, cal.id);
      n++;
    } catch {
      // chyba je uložená v `calendar.last_error`; ostatní kalendáře pokračují
    }
  }
  return n;
}

/** Odstraní z řádku zrcadla vše o kalendáři, který se přestal zobrazovat (skrytí kalendáře). */
export async function dropCalendarMirror(db: Executor, calendarId: string): Promise<void> {
  await db.delete(calendarEvent).where(eq(calendarEvent.calendarId, calendarId));
  await db
    .update(calendar)
    .set({ syncToken: null, syncWindowTo: null, lastSyncAt: null })
    .where(eq(calendar.id, calendarId));
}
