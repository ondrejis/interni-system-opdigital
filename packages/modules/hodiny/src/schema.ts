import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { audit, pk, schema, visibilityColumns, visibilityIndex } from "@rebar/core/db";

const { user } = schema;

/**
 * Odpracovaný čas: kdo, na které zakázce, případně u kterého úkolu, v který den a kolik minut (> 0). Zakázka a úkol
 * jsou měkké odkazy. Viditelnost se dědí od zakázky a úkolu (hodiny soukromé zakázky jsou soukromé), bez vlastního zámku.
 */
export const timeEntry = pgTable(
  "time_entry",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    jobId: uuid("job_id").notNull(),
    taskId: uuid("task_id"),
    date: date("date", { mode: "string" }).notNull(),
    minutes: integer("minutes").notNull(),
    note: text("note"),
    ...visibilityColumns(),
    ...audit(),
  },
  (t) => [
    check("time_entry_minutes_chk", sql`${t.minutes} > 0`),
    index("time_entry_user_date_idx").on(t.userId, t.date),
    index("time_entry_job_idx").on(t.jobId, t.date),
    index("time_entry_task_idx")
      .on(t.taskId)
      .where(sql`${t.taskId} is not null`),
    visibilityIndex("time_entry_private_idx", t),
  ],
);
