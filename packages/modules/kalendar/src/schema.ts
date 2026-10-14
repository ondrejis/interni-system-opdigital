import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audit, pk, schema, ts } from "@rebar/core/db";

const { user } = schema;

/** Zdroj, který lze v kalendáři obsadit: zasedačka, projektor, školicí místnost… (stroje mají vlastní rezervace). */
export const calendarResource = pgTable(
  "calendar_resource",
  {
    id: pk(),
    name: text("name").notNull(),
    /** `room`, `equipment`, `other`. */
    kind: text("kind").notNull().default("room"),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    ...audit(),
  },
  (t) => [index("calendar_resource_active_idx").on(t.active)],
);

/**
 * Událost. Časy jsou okamžiky (UTC). U celodenní události je `startsAt` místní půlnoc prvního dne a `endsAt` místní půlnoc
 * dne po posledním (jako v iCalendar). Opakování (`recurrence`) se rozbaluje v místním čase, takže se přes změnu letního času
 * drží stejná hodina. Zakázka je měkký odkaz bez cizího klíče.
 */
export const event = pgTable(
  "event",
  {
    id: pk(),
    title: text("title").notNull(),
    /** `meeting`, `survey`, `handover`, `other` (číselník `kalendar.type`). */
    type: text("type").notNull().default("meeting"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id),
    resourceId: uuid("resource_id").references(() => calendarResource.id),
    jobId: uuid("job_id"),
    note: text("note"),
    /** `daily`, `weekdays`, `weekly`, `monthly`. */
    recurrence: text("recurrence"),
    recurrenceUntil: date("recurrence_until", { mode: "string" }),
    /** Připomenutí v minutách před začátkem (15, 60, 1440). */
    reminderMinutes: integer("reminder_minutes"),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    index("event_starts_idx").on(t.startsAt),
    index("event_owner_idx").on(t.ownerId),
    index("event_resource_idx").on(t.resourceId),
    index("event_job_idx").on(t.jobId),
    index("event_custom_idx").using("gin", t.custom),
  ],
);

/** Další účastníci události (vlastník je v `event.ownerId`). */
export const eventAttendee = pgTable(
  "event_attendee",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index("event_attendee_user_idx").on(t.userId),
  ],
);

/**
 * Osobní tajný odkaz na odběr kalendáře (iCalendar) pro Google, Apple, Outlook. V databázi je jen otisk (SHA-256)
 * tokenu, takže únik databáze odkazy neprozradí; token se uživateli ukáže jen při vytvoření.
 */
export const calendarFeed = pgTable(
  "calendar_feed",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastFetchAt: ts("last_fetch_at"),
  },
  (t) => [uniqueIndex("calendar_feed_token_uq").on(t.tokenHash)],
);

/** Import cizího kalendáře (tajná adresa iCal z Googlu nebo iCloudu): v systému se ukáže jako „obsazeno“. */
export const calendarImport = pgTable(
  "calendar_import",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Adresa je tajná, ukládá se šifrovaně. */
    urlEncrypted: text("url_encrypted").notNull(),
    lastSyncAt: ts("last_sync_at"),
    lastError: text("last_error"),
    eventCount: integer("event_count").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("calendar_import_user_idx").on(t.userId)],
);

export const externalEvent = pgTable(
  "external_event",
  {
    id: pk(),
    importId: uuid("import_id")
      .notNull()
      .references(() => calendarImport.id, { onDelete: "cascade" }),
    uid: text("uid").notNull(),
    title: text("title"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    allDay: boolean("all_day").notNull().default(false),
  },
  (t) => [
    index("external_event_import_idx").on(t.importId),
    index("external_event_starts_idx").on(t.startsAt),
  ],
);
