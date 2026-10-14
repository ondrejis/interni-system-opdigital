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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { audit, pk, schema, ts } from "@rebar/core/db";
import type {
  DiaryIncident,
  DiaryMachine,
  DiaryMaterial,
  DiaryWeather,
  DiaryWorker,
} from "./diary-shared";
import { job } from "@rebar/zakazky/schema";

const { user, pipelineStage } = schema;

/**
 * Fáze harmonogramu zakázky. Termíny jsou data (pracovní dny řeší výpočty); `baseline*` je výchozí plán,
 * `actual*` skutečnost. Stav plyne z průběhu (0 % plánováno, 1–99 % probíhá, 100 % hotovo).
 */
export const jobPhase = pgTable(
  "job_phase",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    baselineStart: date("baseline_start", { mode: "string" }),
    baselineEnd: date("baseline_end", { mode: "string" }),
    actualStart: date("actual_start", { mode: "string" }),
    actualEnd: date("actual_end", { mode: "string" }),
    progress: integer("progress").notNull().default(0),
    status: text("status").notNull().default("planned"),
    plannedHours: integer("planned_hours"),
    responsibleId: uuid("responsible_id").references(() => user.id),
    dependsOnId: uuid("depends_on_id").references((): AnyPgColumn => jobPhase.id),
    milestone: boolean("milestone").notNull().default(false),
    note: text("note"),
    position: integer("position").notNull().default(0),
    ...audit(),
  },
  (t) => [
    index("job_phase_job_idx").on(t.jobId, t.position),
    index("job_phase_range_idx").on(t.startDate, t.endDate),
  ],
);

/** Stavební deník: jeden zápis na zakázku a den. */
export const siteDiary = pgTable(
  "site_diary",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    date: date("date", { mode: "string" }).notNull(),
    weather: text("weather"),
    temperature: integer("temperature"),
    people: text("people"),
    work: text("work"),
    machines: text("machines"),
    materials: text("materials"),
    events: text("events"),
    /** Počasí z veřejné služby (nebo ručně): kód, popis, teploty, srážky, vítr. `weather` a `temperature` zůstávají jako čitelný souhrn. */
    weatherData: jsonb("weather_data").$type<DiaryWeather>(),
    /** Pracovníci dne (z docházky nebo ručně), `people` je jejich textový souhrn. */
    workers: jsonb("workers").$type<DiaryWorker[]>(),
    /** Materiál dne; řádek s cenou za jednotku vytvořil náklad zakázky (`costRef`). */
    materialRows: jsonb("material_rows").$type<DiaryMaterial[]>(),
    machineRows: jsonb("machine_rows").$type<DiaryMachine[]>(),
    /** Nehody a vady dne; vada odkazuje na záznam vady zakázky. */
    incidents: jsonb("incidents").$type<DiaryIncident[]>(),
    /** Fotky dne: id souborů připojených k zakázce. */
    photoIds: jsonb("photo_ids").$type<string[]>(),
    /** Zápis je vidět v odkazu pro investora. */
    forInvestor: boolean("for_investor").notNull().default(false),
    /** Podpis zápisu (ručně na displeji); podepsaný zápis se nemění. */
    signedAt: ts("signed_at"),
    signedById: uuid("signed_by_id").references(() => user.id),
    signedName: text("signed_name"),
    signatureFileId: uuid("signature_file_id"),
    ...audit(),
  },
  (t) => [
    uniqueIndex("site_diary_job_date_uq")
      .on(t.jobId, t.date)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Předávací protokol zakázky (i částečné předání). Podpis zákazníka je soubor připojený k zakázce. */
export const handoverProtocol = pgTable(
  "handover_protocol",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    number: text("number").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    note: text("note"),
    acceptedBy: text("accepted_by"),
    /** `draft` → `signed` (po podpisu nejde měnit). */
    status: text("status").notNull().default("draft"),
    signatureFileId: uuid("signature_file_id"),
    signedAt: date("signed_at", { mode: "string" }),
    ...audit(),
  },
  (t) => [uniqueIndex("handover_number_uq").on(t.number), index("handover_job_idx").on(t.jobId)],
);

export const handoverItem = pgTable(
  "handover_item",
  {
    id: pk(),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => handoverProtocol.id),
    position: integer("position").notNull().default(0),
    text: text("text").notNull(),
    ok: boolean("ok").notNull().default(true),
    note: text("note"),
  },
  (t) => [index("handover_item_protocol_idx").on(t.protocolId, t.position)],
);

/** Vada nebo reklamace na zakázce. Stav je pipeline (kanban), takže jde spravovat jako ostatní záznamy. */
export const defect = pgTable(
  "defect",
  {
    id: pk(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),
    title: text("title").notNull(),
    description: text("description"),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    severity: text("severity"),
    foundAt: date("found_at", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    responsibleId: uuid("responsible_id").references(() => user.id),
    fixedAt: date("fixed_at", { mode: "string" }),
    handoverId: uuid("handover_id").references(() => handoverProtocol.id),
    ...audit(),
  },
  (t) => [
    index("defect_job_idx").on(t.jobId),
    index("defect_stage_idx").on(t.stageId),
    index("defect_responsible_idx").on(t.responsibleId),
    index("defect_due_idx").on(t.dueDate),
  ],
);
