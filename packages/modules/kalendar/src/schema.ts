import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { audit, pk, schema, trigramIndex, ts } from "@rebar/core/db";

const { user } = schema;

/** Stav propojení účtu s Googlem. */
export const CALENDAR_ACCOUNT_STATUSES = ["ok", "reauth", "error"] as const;

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
    ...audit(),
  },
  (t) => [
    uniqueIndex("calendar_event_google_uq").on(t.calendarId, t.googleId),
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
