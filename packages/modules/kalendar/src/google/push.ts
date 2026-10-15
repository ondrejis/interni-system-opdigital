import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@rebar/core/db";
import { inTx, UserError, type Ctx } from "@rebar/core/rbac";
import { calendar, calendarAccount, calendarEvent, calendarPush } from "../schema";
import { myAccount, withToken, type AccountRow, type CalendarRow } from "./accounts";
import {
  GoogleConflictError,
  GooglePreconditionError,
  type GoogleCalendarClient,
  type GoogleEvent,
  type GoogleEventInput,
} from "./client";
import { googleCalendarSetting, googleClient, googleCtx, type KalEnv } from "./env";
import { type TaskGateway, type TaskState } from "./foreign";
import {
  fromGoogleEvent,
  googleIdForTask,
  inputToFields,
  sameWritten,
  taskToGoogle,
  timesToGoogle,
} from "./mapping";
import { syncCalendar, taskGatewayOf } from "./sync";

/*
  Zápis OPSYS → Google. Změna úkolu vloží do fronty `calendar_push` řádek (v téže transakci jako změna úkolu), úloha
  `kalendar.push` ho zpracuje: načte aktuální stav úkolu a srovná s ním událost v Googlu (založí, změní, přesune k jinému
  řešiteli, nebo smaže). Zápis, který by nic nezměnil, se vynechá (odezva Googlu na vlastní zápis tak nevyvolá smyčku).
  Pozvánky se neposílají, dokud úkol nemá „Poslat pozvánky“ (O-8).
*/

/** Úloha zpracování fronty zápisu (cron každou minutu + spuštění hned po změně úkolu). */
export const pushJobDef = { name: "kalendar.push", schema: z.object({}) };

type EventRow = typeof calendarEvent.$inferSelect;
export type EventWithCalendar = { event: EventRow; calendar: CalendarRow; account: AccountRow };

const MAX_ATTEMPTS = 10;

/** Vloží (nebo sloučí) požadavek na srovnání události úkolu s Googlem. Volat v transakci změny úkolu. */
export async function enqueuePush(
  db: Executor,
  taskId: string,
  opts: { wantMeet?: boolean } = {},
): Promise<void> {
  await db
    .insert(calendarPush)
    .values({ taskId, op: "upsert", wantMeet: !!opts.wantMeet })
    .onConflictDoUpdate({
      target: calendarPush.taskId,
      targetWhere: sql`${calendarPush.taskId} is not null and ${calendarPush.doneAt} is null`,
      set: {
        queuedAt: new Date(),
        nextAttemptAt: new Date(),
        attempts: 0,
        lastError: null,
        wantMeet: sql`${calendarPush.wantMeet} or ${opts.wantMeet === true}`,
      },
    });
}

/** Událost (řádek zrcadla) i s kalendářem a účtem. */
export async function loadEvent(ctx: Ctx, eventId: string): Promise<EventWithCalendar | null> {
  const [r] = await ctx.db
    .select({ event: calendarEvent, calendar, account: calendarAccount })
    .from(calendarEvent)
    .innerJoin(calendar, eq(calendar.id, calendarEvent.calendarId))
    .innerJoin(calendarAccount, eq(calendarAccount.id, calendar.accountId))
    .where(
      and(
        eq(calendarEvent.id, eventId),
        isNull(calendar.deletedAt),
        isNull(calendarAccount.deletedAt),
      ),
    );
  return r ?? null;
}

async function loadEventByTask(ctx: Ctx, taskId: string): Promise<EventWithCalendar | null> {
  const [r] = await ctx.db
    .select({ event: calendarEvent, calendar, account: calendarAccount })
    .from(calendarEvent)
    .innerJoin(calendar, eq(calendar.id, calendarEvent.calendarId))
    .innerJoin(calendarAccount, eq(calendarAccount.id, calendar.accountId))
    .where(eq(calendarEvent.taskId, taskId));
  return r ?? null;
}

/** Zapíše odpověď Googlu do řádku zrcadla. */
async function saveFromResponse(
  ctx: Ctx,
  calendarId: string,
  res: GoogleEvent,
  extra: Partial<typeof calendarEvent.$inferInsert> = {},
): Promise<EventRow> {
  const remote = fromGoogleEvent(res);
  if (remote.deleted) throw new UserError("Google vrátil smazanou událost.");
  const f = remote.fields;
  const values = {
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
    remoteDeleted: false,
    remoteDeletedAt: null,
    ...extra,
  };
  const [row] = await ctx.db
    .insert(calendarEvent)
    .values({ calendarId, googleId: res.id, ...values })
    .onConflictDoUpdate({ target: [calendarEvent.calendarId, calendarEvent.googleId], set: values })
    .returning();
  return row!;
}

/** Smaže událost v Googlu a řádek zrcadla. */
export async function deleteFromGoogle(
  ctx: Ctx,
  env: KalEnv,
  client: GoogleCalendarClient,
  e: EventWithCalendar,
  opts: { sendUpdates?: "all" | "none" } = {},
): Promise<void> {
  if (!e.event.remoteDeleted)
    await withToken(ctx, env, client, e.account, (t) =>
      client.deleteEvent(t, e.calendar.googleId, e.event.googleId, { sendUpdates: opts.sendUpdates ?? "none" }),
    );
  await ctx.db.delete(calendarEvent).where(eq(calendarEvent.id, e.event.id));
}

/** Cílový kalendář zápisu řešitele: kalendář pro zápis jeho účtu, do kterého smí zapisovat. */
async function writeTargetOf(ctx: Ctx, account: AccountRow): Promise<CalendarRow | null> {
  const [c] = await ctx.db
    .select()
    .from(calendar)
    .where(
      and(eq(calendar.accountId, account.id), eq(calendar.isWriteTarget, true), isNull(calendar.deletedAt)),
    );
  return c && (c.accessRole === "owner" || c.accessRole === "writer") ? c : null;
}

/** Má se úkol zapsat do Googlu? Vrací `null`, nebo důvod k vynechání/smazání. */
export function eligibility(
  state: TaskState | null,
  privateToGoogle: boolean,
): { ok: true; state: TaskState & { push: NonNullable<TaskState["push"]> } } | { ok: false } {
  if (!state || state.gone || !state.isCalendarType || !state.push || !state.assigneeId)
    return { ok: false };
  if (state.status === "canceled") return { ok: false };
  if (state.isPrivate && !privateToGoogle) return { ok: false };
  return { ok: true, state: state as TaskState & { push: NonNullable<TaskState["push"]> } };
}

/**
 * Srovná událost v Googlu s aktuálním stavem úkolu (viz hlavička souboru). `queuedAt` = kdy změna úkolu vznikla
 * (smazání události v Googlu novější než změna úkolu se respektuje).
 */
export async function reconcileTask(
  ctx: Ctx,
  env: KalEnv,
  client: GoogleCalendarClient,
  gateway: TaskGateway,
  taskId: string,
  opts: { queuedAt?: Date | null; wantMeet?: boolean } = {},
): Promise<{ action: "none" | "created" | "updated" | "deleted"; eventId: string | null }> {
  const state = await gateway.load(ctx, taskId);
  const settings = await env.settings.get(ctx.db, googleCalendarSetting);
  const elig = eligibility(state, settings.privateMeetingsToGoogle);
  const existing = await loadEventByTask(ctx, taskId);

  const account = elig.ok ? await myAccount(ctx, elig.state.assigneeId) : null;
  const target = account && account.status !== "reauth" ? await writeTargetOf(ctx, account) : null;

  if (!elig.ok || !account || !target) {
    if (existing) {
      await deleteFromGoogle(ctx, env, client, existing);
      return { action: "deleted", eventId: null };
    }
    return { action: "none", eventId: null };
  }

  const t = elig.state;
  let row = existing;
  if (row && row.account.id !== account.id) {
    // řešitel se změnil: událost zmizí z kalendáře původního řešitele a vznikne u nového
    await deleteFromGoogle(ctx, env, client, row);
    row = null;
  }
  const input: GoogleEventInput = taskToGoogle(t.push);
  const sendUpdates = t.push.sendInvites ? "all" : "none";
  const links = t.links;

  if (row && !row.event.remoteDeleted) {
    const same =
      sameWritten(row.event, inputToFields(input)) &&
      (!input.attendees ||
        input.attendees.every((a) => row!.event.attendees.some((x) => x.email.toLowerCase() === a.email)));
    const meetMissing = opts.wantMeet && !row.event.meetUrl;
    if (same && !meetMissing) {
      await ctx.db
        .update(calendarEvent)
        .set({ dealId: links.dealId, companyId: links.companyId, personId: links.personId })
        .where(eq(calendarEvent.id, row.event.id));
      return { action: "none", eventId: row.event.id };
    }
    const res = await withToken(ctx, env, client, row.account, (tok) =>
      client.patchEvent(tok, row!.calendar.googleId, row!.event.googleId, input, {
        sendUpdates,
        conference: meetMissing === true,
      }),
    );
    const saved = await saveFromResponse(ctx, row.calendar.id, res, {
      taskId,
      source: "opsys",
      dealId: links.dealId,
      companyId: links.companyId,
      personId: links.personId,
    });
    return { action: "updated", eventId: saved.id };
  }

  if (row?.event.remoteDeleted) {
    // událost byla v Googlu smazána; novější změna úkolu ji založí znovu, starší ne
    const deletedAt = row.event.remoteDeletedAt;
    if (opts.queuedAt && deletedAt && opts.queuedAt <= deletedAt) return { action: "none", eventId: null };
  }

  const cal = row?.calendar ?? target;
  const googleId = row?.event.googleId ?? googleIdForTask(taskId);
  let res: GoogleEvent;
  try {
    res = await withToken(ctx, env, client, account, (tok) =>
      client.insertEvent(tok, cal.googleId, { ...input, id: googleId }, { sendUpdates, conference: opts.wantMeet === true }),
    );
  } catch (e) {
    if (!(e instanceof GoogleConflictError)) throw e;
    // id už existuje (smazaná událost, nebo opakovaný zápis po výpadku): oživíme ji novými údaji
    res = await withToken(ctx, env, client, account, (tok) =>
      client.patchEvent(tok, cal.googleId, googleId, { ...input, status: "confirmed" }, {
        sendUpdates,
        conference: opts.wantMeet === true,
      }),
    );
  }
  const saved = await saveFromResponse(ctx, cal.id, res, {
    taskId,
    source: "opsys",
    dealId: links.dealId,
    companyId: links.companyId,
    personId: links.personId,
  });
  return { action: "created", eventId: saved.id };
}

/** Zpracuje frontu zápisu (úloha `kalendar.push`, nebo hned po změně). Vrací počet vyřízených řádků. */
export async function processPushQueue(
  db: Executor,
  env: KalEnv,
  opts: { client?: GoogleCalendarClient; taskId?: string } = {},
): Promise<number> {
  const ctx = googleCtx(db);
  const gateway = taskGatewayOf(env);
  const due = await db
    .select()
    .from(calendarPush)
    .where(
      and(
        isNull(calendarPush.doneAt),
        lte(calendarPush.nextAttemptAt, new Date()),
        opts.taskId ? eq(calendarPush.taskId, opts.taskId) : undefined,
      ),
    )
    .orderBy(asc(calendarPush.queuedAt))
    .limit(50);
  if (!due.length) return 0;
  // „zápůjčka“: řádek se pár minut nebere znovu, i kdyby zpracování selhalo uprostřed
  for (const r of due)
    await db
      .update(calendarPush)
      .set({ nextAttemptAt: new Date(Date.now() + 2 * 60_000) })
      .where(and(eq(calendarPush.id, r.id), eq(calendarPush.queuedAt, r.queuedAt)));
  let client: GoogleCalendarClient | null = opts.client ?? null;
  let done = 0;
  for (const r of due) {
    try {
      if (!r.taskId || !gateway) {
        await finish(db, r, null);
        continue;
      }
      client ??= await googleClient(db, env);
      await inTx(ctx, (c) =>
        reconcileTask(c, env, client!, gateway, r.taskId!, { queuedAt: r.queuedAt, wantMeet: r.wantMeet }),
      );
      await finish(db, r, null);
      done++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const attempts = r.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await db
        .update(calendarPush)
        .set({
          attempts,
          lastError: message.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000),
          ...(giveUp ? { doneAt: new Date() } : {}),
        })
        .where(and(eq(calendarPush.id, r.id), eq(calendarPush.queuedAt, r.queuedAt)));
    }
  }
  return done;
}

async function finish(db: Executor, r: typeof calendarPush.$inferSelect, error: string | null) {
  // jen když mezitím nepřišla další změna úkolu (ta posunula `queued_at` a řádek zůstává čekající)
  await db
    .update(calendarPush)
    .set({ doneAt: new Date(), lastError: error })
    .where(and(eq(calendarPush.id, r.id), eq(calendarPush.queuedAt, r.queuedAt)));
}

/* ---------- přímé zápisy z příkazů (událost bez úkolu) ---------- */

/** Přesune událost v Googlu (podmíněně podle `etag`). Při neshodě stáhne aktuální stav a vyzve k opakování. */
export async function moveGoogleEvent(
  ctx: Ctx,
  env: KalEnv,
  client: GoogleCalendarClient,
  e: EventWithCalendar,
  to: { startsAt: Date; endsAt: Date; allDay: boolean },
): Promise<EventRow> {
  const times = timesToGoogle(to.startsAt, to.endsAt, to.allDay);
  try {
    const res = await withToken(ctx, env, client, e.account, (tok) =>
      client.patchEvent(tok, e.calendar.googleId, e.event.googleId, times, {
        sendUpdates: "none",
        ...(e.event.etag ? { ifMatch: e.event.etag } : {}),
      }),
    );
    return await saveFromResponse(ctx, e.calendar.id, res);
  } catch (err) {
    if (err instanceof GooglePreconditionError) {
      await syncCalendar(ctx.db, env, e.calendar.id).catch(() => {});
      throw new UserError("Událost se mezitím změnila v Google Kalendáři. Zkuste přesun znovu.");
    }
    throw err;
  }
}

/** Založí událost jen v Googlu (bez úkolu): schůzka z kalendáře, když modul úkolů není zapnutý. */
export async function createGoogleOnlyEvent(
  ctx: Ctx,
  env: KalEnv,
  client: GoogleCalendarClient,
  input: {
    title: string;
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    place?: string | null | undefined;
    description?: string | null | undefined;
    attendeeEmails?: string[] | undefined;
    sendInvites?: boolean | undefined;
    addMeet?: boolean | undefined;
    isPrivate?: boolean | undefined;
    dealId?: string | null | undefined;
    companyId?: string | null | undefined;
    personId?: string | null | undefined;
  },
): Promise<EventRow> {
  const account = await myAccount(ctx);
  if (!account) throw new UserError("Nejdřív si připojte Google Kalendář.");
  const target = await writeTargetOf(ctx, account);
  if (!target) throw new UserError("Vyberte kalendář pro zápis (Nastavení → Google Kalendář).");
  const times = timesToGoogle(input.startsAt, input.endsAt, input.allDay);
  const invites = input.sendInvites === true && !!input.attendeeEmails?.length;
  const res = await withToken(ctx, env, client, account, (tok) =>
    client.insertEvent(
      tok,
      target.googleId,
      {
        summary: input.title,
        description: input.description ?? null,
        location: input.place ?? null,
        ...times,
        visibility: input.isPrivate ? "private" : "default",
        ...(invites ? { attendees: input.attendeeEmails!.map((email) => ({ email })) } : {}),
        extendedProperties: { private: { opsysSource: "opsys" } },
      },
      { sendUpdates: invites ? "all" : "none", conference: input.addMeet === true },
    ),
  );
  return saveFromResponse(ctx, target.id, res, {
    source: "opsys",
    dealId: input.dealId ?? null,
    companyId: input.companyId ?? null,
    personId: input.personId ?? null,
    linkedBy: ctx.actor.userId,
  });
}
