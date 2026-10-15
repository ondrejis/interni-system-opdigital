import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audit, pk, schema, trigramIndex, ts } from "@rebar/core/db";

const { user } = schema;

/** Stav propojení účtu s Googlem. */
export const CALENDAR_ACCOUNT_STATUSES = ["ok", "reauth", "error"] as const;
/** Oprávnění uživatele ke kalendáři v Googlu (`accessRole` z `calendarList`). */
export const CALENDAR_ACCESS_ROLES = ["owner", "writer", "reader", "freeBusyReader"] as const;
/** Kde událost vznikla: v Googlu, nebo v OPSYS (schůzka/hovor z úkolu zapsaný do Googlu). */
export const CALENDAR_EVENT_SOURCES = ["google", "opsys"] as const;
/** Viditelnost události v Googlu (`visibility`). `private` a `confidential` druhému uživateli ukážeme jen jako „Obsazeno“. */
export const CALENDAR_EVENT_VISIBILITIES = [
  "default",
  "public",
  "private",
  "confidential",
] as const;
/** Operace fronty zápisu do Googlu. */
export const CALENDAR_PUSH_OPS = ["upsert", "delete"] as const;

/** Účastník události z Google Kalendáře (zrcadlo odpovědi API, bez tajemství). */
export type CalendarAttendee = {
  email: string;
  name?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  self?: boolean;
  organizer?: boolean;
};

/**
 * Propojený Google účet uživatele (jeden na uživatele). `tokens_enc` jsou přístupové a obnovovací tokeny zašifrované
 * přes `cipher` (nikdy v otevřené podobě); `status = reauth` znamená, že je potřeba souhlas obnovit.
 */
export const calendarAccount = pgTable(
  "calendar_account",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    googleEmail: text("google_email").notNull(),
    tokensEnc: text("tokens_enc").notNull(),
    status: text("status", { enum: CALENDAR_ACCOUNT_STATUSES }).notNull().default("ok"),
    lastSyncAt: ts("last_sync_at"),
    lastError: text("last_error"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("calendar_account_user_uq")
      .on(t.userId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Kalendář z Google účtu: zobrazení v OPSYS, cíl zápisu nových schůzek, synchronizační token a kanál pro push. */
export const calendar = pgTable(
  "calendar",
  {
    id: pk(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => calendarAccount.id),
    googleId: text("google_id").notNull(),
    name: text("name").notNull(),
    color: text("color"),
    visible: boolean("visible").notNull().default(true),
    isWriteTarget: boolean("is_write_target").notNull().default(false),
    syncToken: text("sync_token"),
    watchChannelId: text("watch_channel_id"),
    watchExpiresAt: ts("watch_expires_at"),
    /** Oprávnění uživatele v Googlu; `reader` a `freeBusyReader` nejdou upravovat ani být cílem zápisu. */
    accessRole: text("access_role", { enum: CALENDAR_ACCESS_ROLES }).notNull().default("reader"),
    isPrimary: boolean("is_primary").notNull().default(false),
    timeZone: text("time_zone"),
    /** Poslední den okna, které pokrývá `sync_token` (rozbalené opakované události); blíží-li se, běží úplná synchronizace znovu. */
    syncWindowTo: date("sync_window_to", { mode: "string" }),
    lastSyncAt: ts("last_sync_at"),
    lastError: text("last_error"),
    /** Identifikátor zdroje (`resourceId`) a otisk tajného tokenu push kanálu; token samotný je jen u Googlu. */
    watchResourceId: text("watch_resource_id"),
    watchTokenHash: text("watch_token_hash"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("calendar_google_uq")
      .on(t.accountId, t.googleId)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex("calendar_write_target_uq")
      .on(t.accountId)
      .where(sql`${t.isWriteTarget} and ${t.deletedAt} is null`),
    uniqueIndex("calendar_watch_channel_uq")
      .on(t.watchChannelId)
      .where(sql`${t.watchChannelId} is not null`),
    index("calendar_watch_expires_idx")
      .on(t.watchExpiresAt)
      .where(sql`${t.watchChannelId} is not null`),
  ],
);

/**
 * Zrcadlo události z Google Kalendáře (zdroj pravdy je Google; konflikt rozhodne novější změna). Vazby na úkol, obchod,
 * organizaci a kontakt jsou měkké. Soukromou událost cizího uživatele ukazuje systém jen jako „Obsazeno“.
 */
export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: pk(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendar.id),
    googleId: text("google_id").notNull(),
    etag: text("etag"),
    title: text("title"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    allDay: boolean("all_day").notNull().default(false),
    place: text("place"),
    meetUrl: text("meet_url"),
    attendees: jsonb("attendees")
      .$type<CalendarAttendee[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isGooglePrivate: boolean("is_google_private").notNull().default(false),
    taskId: uuid("task_id"),
    dealId: uuid("deal_id"),
    companyId: uuid("company_id"),
    personId: uuid("person_id"),
    linkedBy: uuid("linked_by").references(() => user.id),
    remoteDeleted: boolean("remote_deleted").notNull().default(false),
    description: text("description"),
    htmlLink: text("html_link"),
    /** Opakovaná událost: id hlavní události a původní začátek výskytu (Google rozbaluje výskyty, `singleEvents`). */
    recurringEventId: text("recurring_event_id"),
    originalStartAt: ts("original_start_at"),
    visibility: text("visibility", { enum: CALENDAR_EVENT_VISIBILITIES })
      .notNull()
      .default("default"),
    organizerEmail: text("organizer_email"),
    /** Kdy Google událost naposledy změnil (`updated`); do konfliktu vstupuje jako „čas vzdálené změny“. */
    googleUpdatedAt: ts("google_updated_at"),
    source: text("source", { enum: CALENDAR_EVENT_SOURCES }).notNull().default("google"),
    /** Kdy byla událost v Googlu smazána (u události navázané na úkol zůstane řádek jako náhrobek). */
    remoteDeletedAt: ts("remote_deleted_at"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("calendar_event_google_uq").on(t.calendarId, t.googleId),
    uniqueIndex("calendar_event_task_uq")
      .on(t.taskId)
      .where(sql`${t.taskId} is not null`),
    index("calendar_event_recurring_idx")
      .on(t.recurringEventId)
      .where(sql`${t.recurringEventId} is not null`),
    index("calendar_event_range_idx").on(t.startsAt, t.endsAt),
    index("calendar_event_task_idx")
      .on(t.taskId)
      .where(sql`${t.taskId} is not null`),
    index("calendar_event_deal_idx")
      .on(t.dealId)
      .where(sql`${t.dealId} is not null`),
    index("calendar_event_company_idx")
      .on(t.companyId)
      .where(sql`${t.companyId} is not null`),
    index("calendar_event_person_idx")
      .on(t.personId)
      .where(sql`${t.personId} is not null`),
    trigramIndex("calendar_event_title_trgm_idx", t.title),
  ],
);

/**
 * Fronta zápisu do Googlu (outbox). Vzniká v transakci změny úkolu (`task.*` → handler) a zpracovává ji úloha
 * `kalendar.push`; díky tomu zápis do Googlu nemůže předběhnout potvrzení změny a výpadek Googlu změnu neztratí.
 * Na jeden úkol je nejvýš jeden nevyřízený řádek (další změny se slučují, `queued_at` se posune). U mazání nese
 * `payload` identifikaci události (úkol už nemusí existovat).
 */
export const calendarPush = pgTable(
  "calendar_push",
  {
    id: pk(),
    taskId: uuid("task_id"),
    op: text("op", { enum: CALENDAR_PUSH_OPS }).notNull().default("upsert"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Založit u události odkaz na Google Meet. */
    wantMeet: boolean("want_meet").notNull().default(false),
    queuedAt: ts("queued_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lastError: text("last_error"),
    doneAt: ts("done_at"),
  },
  (t) => [
    uniqueIndex("calendar_push_task_uq")
      .on(t.taskId)
      .where(sql`${t.taskId} is not null and ${t.doneAt} is null`),
    index("calendar_push_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.doneAt} is null`),
  ],
);
