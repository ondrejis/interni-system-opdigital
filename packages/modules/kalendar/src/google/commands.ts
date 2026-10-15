import { and, eq, isNull, ne } from "drizzle-orm";
import { schema } from "@rebar/core/db";
import { defineCommand, type ModuleDeps } from "@rebar/core/module-server";
import { NotFoundError, scopeOf, UserError, type Ctx } from "@rebar/core/rbac";
import {
  accountInput,
  connectStartInput,
  createMeetingInput,
  deleteEventInput,
  disconnectInput,
  forRecordInput,
  linkInput,
  moveInput,
  rangeInput,
  refreshCalendarsInput,
  setWriteTargetInput,
  settingsGetInput,
  settingsSaveInput,
  suggestLinksInput,
  syncInput,
  testInput,
  toggleCalendarInput,
  type AccountState,
  type CalendarItemDto,
  type CalendarSettingsDto,
  type CreateMeetingResult,
  type SourceDto,
  type TestResult,
} from "../contract";
import { calendar, calendarAccount, calendarEvent } from "../schema";
import {
  accessTokenFor,
  accountDto,
  calendarDto,
  disconnectAccount,
  markAccount,
  myAccount,
  startConnect,
} from "./accounts";
import { GoogleApiError } from "./client";
import { myCalendar, refreshMyCalendars } from "./connect";
import {
  envOfDeps,
  googleCalendarSetting,
  googleClient,
  isConfigured,
  pushAvailable,
  redirectUri,
  webhookUrl,
} from "./env";
import { linkEvent, accessibleEvent, suggestLinks } from "./links";
import { timesToTask } from "./mapping";
import {
  createGoogleOnlyEvent,
  deleteFromGoogle,
  enqueuePush,
  loadEvent,
  moveGoogleEvent,
  processPushQueue,
} from "./push";
import { eventsForRecord, projectRows, rangeItems } from "./range";
import { dropCalendarMirror, syncAccount, syncCalendar, taskGatewayOf } from "./sync";
import { ensureWatch, stopWatch } from "./watch";

/*
  Příkazy kalendáře (`kalendar.*`). Čtení vyžaduje `kalendar.read`, zápis `kalendar.write`; rozsah „jen moje“ znamená
  jen vlastní účet a vlastní události, rozsah „vše“ i kalendáře ostatních (cizí soukromé jako „Obsazeno“).
*/

const READ = "kalendar.read";
const WRITE = "kalendar.write";

const needUser = (ctx: Ctx): string => {
  if (!ctx.actor.userId) throw new UserError("Kalendář je jen pro přihlášené uživatele.");
  return ctx.actor.userId;
};

const noAccount = () =>
  new UserError("Nejdřív si připojte Google Kalendář (Nastavení → Google Kalendář).");

/** Položka kalendáře pro jednu událost (po změně). */
async function itemOf(ctx: Ctx, deps: ModuleDeps, eventId: string): Promise<CalendarItemDto> {
  const e = await loadEvent(ctx, eventId);
  if (!e) throw new NotFoundError();
  const [owner] = await ctx.db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, e.account.userId));
  const [item] = await projectRows(ctx, deps, [
    {
      event: e.event,
      calendar: e.calendar,
      ownerId: e.account.userId,
      ownerName: owner?.name ?? "",
    },
  ]);
  return item!;
}

/** Zapíše čekající změny do Googlu hned (best effort; selhání zůstane ve frontě pro minutovou úlohu). */
async function pushNow(ctx: Ctx, deps: ModuleDeps, taskId: string): Promise<void> {
  try {
    await processPushQueue(ctx.db, envOfDeps(deps), { taskId });
  } catch {
    // zápis dožene úloha `kalendar.push`
  }
}

export const rangeCommand = defineCommand({
  name: "kalendar.range",
  permission: READ,
  input: rangeInput,
  handler: (ctx, i, deps) => rangeItems(ctx, deps, i),
});

export const accountCommand = defineCommand({
  name: "kalendar.account",
  permission: READ,
  input: accountInput,
  handler: async (ctx, _i, deps): Promise<AccountState> => {
    const env = envOfDeps(deps);
    const mine = await myAccount(ctx);
    const canSeeAll = scopeOf(ctx, READ) === "all";
    let others: SourceDto[] = [];
    if (canSeeAll) {
      const rows = await ctx.db
        .select({
          userId: calendarAccount.userId,
          userName: schema.user.name,
          id: calendar.id,
          name: calendar.name,
          color: calendar.color,
        })
        .from(calendar)
        .innerJoin(calendarAccount, eq(calendarAccount.id, calendar.accountId))
        .innerJoin(schema.user, eq(schema.user.id, calendarAccount.userId))
        .where(
          and(
            isNull(calendar.deletedAt),
            isNull(calendarAccount.deletedAt),
            eq(calendar.visible, true),
            ne(calendarAccount.userId, ctx.actor.userId ?? ""),
          ),
        );
      const byUser = new Map<string, SourceDto>();
      for (const r of rows) {
        const s = byUser.get(r.userId) ?? { userId: r.userId, userName: r.userName, calendars: [] };
        s.calendars.push({ id: r.id, name: r.name, color: r.color });
        byUser.set(r.userId, s);
      }
      others = [...byUser.values()];
    }
    return {
      configured: await isConfigured(ctx.db, env),
      mine: mine ? await accountDto(ctx, mine) : null,
      others,
      canWrite: scopeOf(ctx, WRITE) !== undefined,
      canSeeAll,
    };
  },
});

export const connectStartCommand = defineCommand({
  name: "kalendar.connect.start",
  permission: WRITE,
  input: connectStartInput,
  handler: (ctx, i, deps) => startConnect(ctx, envOfDeps(deps), i.returnTo),
});

export const disconnectCommand = defineCommand({
  name: "kalendar.disconnect",
  permission: WRITE,
  input: disconnectInput,
  handler: (ctx, _i, deps) => disconnectAccount(ctx, envOfDeps(deps)),
});

export const refreshCalendarsCommand = defineCommand({
  name: "kalendar.calendars.refresh",
  permission: WRITE,
  input: refreshCalendarsInput,
  handler: async (ctx, _i, deps) => {
    const account = await refreshMyCalendars(ctx, envOfDeps(deps));
    if (!account) throw noAccount();
    return accountDto(ctx, account);
  },
});

export const toggleCalendarCommand = defineCommand({
  name: "kalendar.toggleCalendar",
  permission: WRITE,
  input: toggleCalendarInput,
  handler: async (ctx, i, deps) => {
    const env = envOfDeps(deps);
    const mine = await myCalendar(ctx, i.calendarId);
    if (!mine) throw new NotFoundError();
    await ctx.db.update(calendar).set({ visible: i.visible }).where(eq(calendar.id, i.calendarId));
    if (i.visible) {
      await syncCalendar(ctx.db, env, i.calendarId).catch(() => {});
      await ensureWatch(ctx.db, env, i.calendarId);
    } else if (!mine.calendar.isWriteTarget) {
      await stopWatch(ctx.db, env, i.calendarId);
      await dropCalendarMirror(ctx.db, i.calendarId);
    }
    const [c] = await ctx.db.select().from(calendar).where(eq(calendar.id, i.calendarId));
    return calendarDto(c!);
  },
});

export const setWriteTargetCommand = defineCommand({
  name: "kalendar.setWriteTarget",
  permission: WRITE,
  input: setWriteTargetInput,
  handler: async (ctx, i, deps) => {
    const env = envOfDeps(deps);
    const mine = await myCalendar(ctx, i.calendarId);
    if (!mine) throw new NotFoundError();
    if (mine.calendar.accessRole !== "owner" && mine.calendar.accessRole !== "writer")
      throw new UserError("Do tohoto kalendáře nemáte v Googlu právo zapisovat.");
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(calendar)
        .set({ isWriteTarget: false })
        .where(eq(calendar.accountId, mine.account.id));
      await tx
        .update(calendar)
        .set({ isWriteTarget: true, visible: true })
        .where(eq(calendar.id, i.calendarId));
    });
    await syncCalendar(ctx.db, env, i.calendarId).catch(() => {});
    await ensureWatch(ctx.db, env, i.calendarId);
    const cals = await ctx.db
      .select()
      .from(calendar)
      .where(and(eq(calendar.accountId, mine.account.id), isNull(calendar.deletedAt)));
    return cals.map(calendarDto);
  },
});

export const syncCommand = defineCommand({
  name: "kalendar.sync",
  permission: WRITE,
  input: syncInput,
  handler: async (ctx, _i, deps) => {
    const env = envOfDeps(deps);
    const account = await myAccount(ctx);
    if (!account) throw noAccount();
    await processPushQueue(ctx.db, env).catch(() => 0);
    return syncAccount(ctx.db, env, account.id);
  },
});

export const testCommand = defineCommand({
  name: "kalendar.test",
  permission: WRITE,
  input: testInput,
  handler: async (ctx, _i, deps): Promise<TestResult> => {
    const env = envOfDeps(deps);
    const account = await myAccount(ctx);
    if (!account) return { ok: false, message: "Google Kalendář není připojený.", status: null };
    try {
      const client = await googleClient(ctx.db, env);
      const token = await accessTokenFor(ctx, env, client, account);
      const cals = await client.listCalendars(token);
      await markAccount(ctx, account.id, "ok", null);
      return {
        ok: true,
        message: `Spojení funguje, Google vrátil ${cals.length} kalendářů.`,
        status: "ok",
      };
    } catch (e) {
      const [a] = await ctx.db
        .select()
        .from(calendarAccount)
        .where(eq(calendarAccount.id, account.id));
      const message =
        e instanceof UserError || e instanceof GoogleApiError
          ? e.message
          : "Spojení s Googlem selhalo.";
      return { ok: false, message, status: a?.status ?? "error" };
    }
  },
});

export const createMeetingCommand = defineCommand({
  name: "kalendar.createMeeting",
  permission: WRITE,
  input: createMeetingInput,
  handler: async (ctx, i, deps): Promise<CreateMeetingResult> => {
    const env = envOfDeps(deps);
    const me = needUser(ctx);
    const startsAt = new Date(i.startsAt);
    const endsAt = new Date(i.endsAt);
    const tasks = deps.services.optional("tasks");
    const gateway = taskGatewayOf(env);
    if (tasks) {
      const assigneeId = i.assigneeId === undefined ? me : i.assigneeId;
      const { taskId } = await tasks.createMeeting(ctx, {
        title: i.title,
        startsAt: i.startsAt,
        endsAt: i.endsAt,
        ...(i.allDay !== undefined ? { allDay: i.allDay } : {}),
        place: i.place ?? null,
        attendeeEmails: i.attendeeEmails ?? [],
        assigneeId,
        dealId: i.dealId ?? null,
        companyId: i.companyId ?? null,
        personId: i.personId ?? null,
        jobId: i.jobId ?? null,
        ...(i.isPrivate !== undefined ? { isPrivate: i.isPrivate } : {}),
      });
      const extra: Record<string, unknown> = {};
      if (i.sendInvites) extra.sendInvites = true;
      if (i.description) extra.description = i.description;
      if (gateway && Object.keys(extra).length)
        await gateway.setFields(ctx, taskId, extra).catch(() => {});
      await enqueuePush(ctx.db, taskId, { wantMeet: i.addMeet === true });
      await pushNow(ctx, deps, taskId);
      const [ev] = await ctx.db
        .select({ id: calendarEvent.id })
        .from(calendarEvent)
        .where(eq(calendarEvent.taskId, taskId));
      return { taskId, eventId: ev?.id ?? null, pending: !ev };
    }
    const client = await googleClient(ctx.db, env);
    const row = await createGoogleOnlyEvent(ctx, env, client, {
      title: i.title,
      startsAt,
      endsAt,
      allDay: i.allDay === true,
      place: i.place,
      description: i.description,
      attendeeEmails: i.attendeeEmails,
      sendInvites: i.sendInvites,
      addMeet: i.addMeet,
      isPrivate: i.isPrivate,
      dealId: i.dealId,
      companyId: i.companyId,
      personId: i.personId,
    });
    return { taskId: null, eventId: row.id, pending: false };
  },
});

export const moveCommand = defineCommand({
  name: "kalendar.move",
  permission: WRITE,
  input: moveInput,
  handler: async (ctx, i, deps) => {
    const env = envOfDeps(deps);
    const e = await accessibleEvent(ctx, i.eventId, "write");
    if (e.calendar.accessRole !== "owner" && e.calendar.accessRole !== "writer")
      throw new UserError("Tento kalendář je v Googlu jen pro čtení.");
    const startsAt = new Date(i.startsAt);
    const endsAt = new Date(i.endsAt);
    const gateway = taskGatewayOf(env);
    const allDay = i.allDay ?? e.event.allDay;
    if (e.event.taskId && gateway) {
      await gateway.applyTimes(ctx, e.event.taskId, timesToTask({ startsAt, endsAt, allDay }));
      await pushNow(ctx, deps, e.event.taskId);
    } else {
      const client = await googleClient(ctx.db, env);
      await moveGoogleEvent(ctx, env, client, e, { startsAt, endsAt, allDay });
    }
    return itemOf(ctx, deps, e.event.id);
  },
});

export const deleteEventCommand = defineCommand({
  name: "kalendar.delete",
  permission: WRITE,
  input: deleteEventInput,
  handler: async (ctx, i, deps) => {
    const env = envOfDeps(deps);
    const e = await accessibleEvent(ctx, i.eventId, "write");
    const gateway = taskGatewayOf(env);
    if (e.event.taskId && gateway) {
      await gateway.remove(ctx, e.event.taskId);
      await pushNow(ctx, deps, e.event.taskId);
      // úkol je v koši; událost zmizela v Googlu při zpracování fronty (kdyby ne, doběhne úloha)
    } else {
      const client = await googleClient(ctx.db, env);
      await deleteFromGoogle(ctx, env, client, e);
    }
    return { id: i.eventId };
  },
});

export const linkCommand = defineCommand({
  name: "kalendar.link",
  permission: WRITE,
  input: linkInput,
  handler: async (ctx, i, deps) => {
    const id = await linkEvent(ctx, envOfDeps(deps), i.eventId, i);
    return itemOf(ctx, deps, id);
  },
});

export const suggestLinksCommand = defineCommand({
  name: "kalendar.suggestLinks",
  permission: READ,
  input: suggestLinksInput,
  handler: (ctx, i, deps) => suggestLinks(ctx, envOfDeps(deps), i.eventId),
});

export const forRecordCommand = defineCommand({
  name: "kalendar.forRecord",
  permission: READ,
  input: forRecordInput,
  handler: async (ctx, i, deps) => ({ items: await eventsForRecord(ctx, deps, i) }),
});

export const settingsGetCommand = defineCommand({
  name: "kalendar.settings.get",
  permission: "settings.manage",
  input: settingsGetInput,
  handler: async (ctx, _i, deps): Promise<CalendarSettingsDto> => {
    const env = envOfDeps(deps);
    const { value, secretsSet } = await env.settings.getForAdmin(ctx, googleCalendarSetting);
    return {
      clientId: value.clientId ?? "",
      clientSecretSet: secretsSet.includes("clientSecret"),
      privateMeetingsToGoogle: value.privateMeetingsToGoogle ?? true,
      redirectUri: redirectUri(env),
      webhookUrl: webhookUrl(env),
      pushAvailable: pushAvailable(env),
    };
  },
});

export const settingsSaveCommand = defineCommand({
  name: "kalendar.settings.save",
  permission: "settings.manage",
  input: settingsSaveInput,
  handler: async (ctx, i, deps) => {
    const env = envOfDeps(deps);
    await env.settings.set(ctx, googleCalendarSetting, {
      ...(i.clientId !== undefined ? { clientId: i.clientId } : {}),
      ...(i.clientSecret ? { clientSecret: i.clientSecret } : {}),
      ...(i.privateMeetingsToGoogle !== undefined
        ? { privateMeetingsToGoogle: i.privateMeetingsToGoogle }
        : {}),
    });
    return { ok: true as const };
  },
});

/** Všechny příkazy kalendáře. */
export const googleCommands = [
  rangeCommand,
  accountCommand,
  connectStartCommand,
  disconnectCommand,
  refreshCalendarsCommand,
  toggleCalendarCommand,
  setWriteTargetCommand,
  syncCommand,
  testCommand,
  createMeetingCommand,
  moveCommand,
  deleteEventCommand,
  linkCommand,
  suggestLinksCommand,
  forRecordCommand,
  settingsGetCommand,
  settingsSaveCommand,
];
