import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, ts } from "../columns";
import { audit } from "./common";
import { user } from "./identity";

/** Uložená sada sloupců a filtrů pod jménem; osobní, nebo sdílená v týmu. `config` je `ExportSpec` bez názvu souboru stroje. */
export const exportTemplate = pgTable(
  "export_template",
  {
    id: pk(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id),
    entityType: text("entity_type").notNull(),
    shared: boolean("shared").notNull().default(false),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    ...audit(),
  },
  (t) => [index("export_template_entity_idx").on(t.entityType, t.ownerId)],
);

/**
 * Plánovaný export: opakuje se denně / týdně / měsíčně v místním čase (Europe/Prague). Každý příjemce dostane export
 * podle svých vlastních oprávnění. `next_run_at` posouvá worker; běh jedné periody je jednoznačný (`period_key`).
 */
export const exportSchedule = pgTable(
  "export_schedule",
  {
    id: pk(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id),
    templateId: uuid("template_id").references(() => exportTemplate.id, { onDelete: "set null" }),
    /** Úplná specifikace exportu v době uložení plánu (šablona se může později změnit). */
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
    frequency: text("frequency", { enum: ["daily", "weekly", "monthly"] }).notNull(),
    /** Den v týdnu (1 = pondělí … 7 = neděle) u týdenního plánu. */
    weekday: integer("weekday"),
    /** Den v měsíci (1–28) u měsíčního plánu; „poslední den“ = 0. */
    monthDay: integer("month_day"),
    /** Čas spuštění `HH:MM` v místním čase. */
    timeLocal: text("time_local").notNull().default("06:00"),
    /** Příjemci: id uživatelů (jen interní uživatelé s právem na data). */
    recipients: jsonb("recipients")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    deliver: text("deliver", { enum: ["email", "myexports", "both"] })
      .notNull()
      .default("myexports"),
    active: boolean("active").notNull().default(true),
    nextRunAt: ts("next_run_at"),
    lastRunAt: ts("last_run_at"),
    lastStatus: text("last_status"),
    ...audit(),
  },
  (t) => [
    index("export_schedule_due_idx")
      .on(t.nextRunAt)
      .where(sql`${t.active} and ${t.deletedAt} is null`),
    index("export_schedule_owner_idx").on(t.ownerId),
  ],
);

/**
 * Jeden export (ruční, plánovaný, nástěnka): záznam pro audit i pro „Moje exporty“. Velké exporty se zpracují na
 * pozadí (`status`) a soubor leží v úložišti do `expires_at`; pak ho úklid smaže a stav se změní na `expired`.
 */
export const exportRun = pgTable(
  "export_run",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    /** `manual` (z tlačítka), `schedule` (plán), `dashboard` (widget / nástěnka). */
    source: text("source", { enum: ["manual", "schedule", "dashboard"] }).notNull(),
    scheduleId: uuid("schedule_id").references(() => exportSchedule.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => exportTemplate.id, { onDelete: "set null" }),
    /** Typ exportovaných dat: klíč entity, nebo `dashboard:<id>`. */
    entityType: text("entity_type").notNull(),
    label: text("label").notNull(),
    format: text("format").notNull(),
    fileName: text("file_name").notNull(),
    status: text("status", { enum: ["queued", "running", "done", "failed", "expired"] })
      .notNull()
      .default("queued"),
    rowCount: integer("row_count"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    /** Klíč souboru v úložišti; u synchronního (streamovaného) exportu `null`. */
    fileKey: text("file_key"),
    /** Co se exportovalo: filtry, sloupce, řazení (pro audit). */
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
    error: text("error"),
    /** Jednoznačný klíč periody plánu (`2026-10-09`, `2026-W41`, `2026-10`); s plánem a uživatelem brání dvojímu běhu. */
    periodKey: text("period_key"),
    /** Hotový soubor se po vytvoření pošle e-mailem uživateli (plánovaný export s doručením e-mailem). */
    deliverEmail: boolean("deliver_email").notNull().default(false),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("export_run_user_idx").on(t.userId, t.createdAt),
    index("export_run_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.status} in ('queued', 'running')`),
    index("export_run_expiry_idx")
      .on(t.expiresAt)
      .where(sql`${t.fileKey} is not null`),
    uniqueIndex("export_run_period_uq")
      .on(t.scheduleId, t.periodKey, t.userId)
      .where(sql`${t.scheduleId} is not null and ${t.periodKey} is not null`),
  ],
);
