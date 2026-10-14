import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audit, minor, pk, schema, ts } from "@rebar/core/db";

const { user } = schema;

/**
 * Záznam docházky. Doba je v minutách. Zápis je buď ručně (od–do s přestávkou, nebo přímo hodiny), nebo z píchačky
 * (`source = clock`): běžící záznam má `startedAt` a nemá `endedAt`. Zakázka a fáze jsou měkké odkazy (bez cizího klíče),
 * aby docházka fungovala i bez modulů Zakázky a Realizace. `hourlyCostMinor` je snímek nákladu zaměstnance v době zápisu.
 */
export const timeEntry = pgTable(
  "time_entry",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    date: date("date", { mode: "string" }).notNull(),
    /** `work`, `travel`, `workshop`, `admin`, `vacation`, `sick`, `doctor`, `holiday`, `comp`. */
    kind: text("kind").notNull().default("work"),
    startedAt: ts("started_at"),
    endedAt: ts("ended_at"),
    breakMinutes: integer("break_minutes").notNull().default(0),
    /** Začátek právě probíhající přestávky u píchačky. */
    breakStartedAt: timestamp("break_started_at", { withTimezone: true }),
    minutes: integer("minutes").notNull().default(0),
    jobId: uuid("job_id"),
    phaseId: uuid("phase_id"),
    note: text("note"),
    /** `manual` nebo `clock`. */
    source: text("source").notNull().default("manual"),
    /** `draft` → `submitted` → `approved` | `returned`. */
    status: text("status").notNull().default("draft"),
    hourlyCostMinor: minor("hourly_cost_minor").notNull().default(0),
    reviewerId: uuid("reviewer_id").references(() => user.id),
    reviewedAt: ts("reviewed_at"),
    reviewNote: text("review_note"),
    ...audit(),
  },
  (t) => [
    index("time_entry_user_date_idx").on(t.userId, t.date),
    index("time_entry_job_idx").on(t.jobId),
    index("time_entry_status_idx").on(t.status),
    index("time_entry_note_trgm_idx").using("gin", sql`lower(f_unaccent(${t.note})) gin_trgm_ops`),
    // u jednoho člověka smí běžet jen jedna píchačka
    uniqueIndex("time_entry_running_uq")
      .on(t.userId)
      .where(sql`${t.source} = 'clock' and ${t.endedAt} is null and ${t.deletedAt} is null`),
  ],
);

/** Uzavřený měsíc (podklad pro mzdy): v něm už se docházka nemění. */
export const timeLock = pgTable("time_lock", {
  month: text("month").primaryKey(),
  lockedBy: uuid("locked_by").references(() => user.id),
  lockedAt: ts("locked_at").notNull().defaultNow(),
});
