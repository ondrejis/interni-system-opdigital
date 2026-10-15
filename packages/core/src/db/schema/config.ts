import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, ts } from "../columns";
import { audit } from "./common";
import { user } from "./identity";

/** Nastavení aplikace: klíč → JSON. Tajné hodnoty jsou uvnitř zašifrované (viz `security/crypto`). */
export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: uuid("updated_by").references(() => user.id),
});

/** Pipeline (stavy procesu) konfigurovatelná v administraci, např. `job/default`. */
export const pipeline = pgTable(
  "pipeline",
  {
    id: pk(),
    entityType: text("entity_type").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    ...audit(),
  },
  (t) => [
    uniqueIndex("pipeline_key_uq")
      .on(t.entityType, t.key)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const pipelineStage = pgTable(
  "pipeline_stage",
  {
    id: pk(),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipeline.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("gray"),
    position: integer("position").notNull(),
    /** Druh stavu: otevřený / vyhraný / ztracený / hotový. */
    kind: text("kind", { enum: ["open", "won", "lost", "done"] })
      .notNull()
      .default("open"),
    /** Pevná fáze v kódu, do které stav patří (zakázky: `inquiry`, `offer`, `execution`…); jiné pipeline ji nemají. */
    phase: text("phase"),
    /** Pravděpodobnost výhry ve stavu v procentech (0–100); `null` = nezadáno. Používá CRM pro váženou hodnotu, ostatní entity pole ignorují. */
    probabilityPct: smallint("probability_pct"),
    /** Po kolika dnech bez aktivity ve stavu záznam „hnije“; `null` = hnití se nehlídá. */
    rottingDays: smallint("rotting_days"),
    ...audit(),
  },
  (t) => [index("pipeline_stage_idx").on(t.pipelineId, t.position)],
);

/** Číselníky (zdroje poptávek, důvody prohry, kategorie…). */
export const lookupList = pgTable(
  "lookup_list",
  {
    id: pk(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    ...audit(),
  },
  (t) => [
    uniqueIndex("lookup_list_key_uq")
      .on(t.key)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const lookupItem = pgTable(
  "lookup_item",
  {
    id: pk(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lookupList.id, { onDelete: "cascade" }),
    /** Stabilní hodnota, na kterou se odkazují záznamy; `label` jde měnit. */
    value: text("value").notNull(),
    label: text("label").notNull(),
    color: text("color"),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    /** Rozsah položky: klíče entit, pro které položka platí (štítky `tag`: `company`, `deal`…); prázdné = všude. */
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...audit(),
  },
  (t) => [uniqueIndex("lookup_item_uq").on(t.listId, t.value)],
);

/** Číselné řady dokladů. Číslo se přiděluje jedním UPDATE ve stejné transakci jako doklad (bez děr). */
export const numberSeries = pgTable("number_series", {
  key: text("key").primaryKey(),
  pattern: text("pattern").notNull(),
  reset: text("reset", { enum: ["yearly", "never"] })
    .notNull()
    .default("yearly"),
  /** Období posledního přidělení: rok („2026“) nebo „all“. */
  period: text("period").notNull().default(""),
  lastValue: integer("last_value").notNull().default(0),
  updatedAt: ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Sazby DPH s platností; `rate_bp` v setinách procenta (21 % = 2100). */
export const vatRate = pgTable(
  "vat_rate",
  {
    id: pk(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    rateBp: integer("rate_bp").notNull(),
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    validTo: date("valid_to", { mode: "string" }),
    ...audit(),
  },
  (t) => [uniqueIndex("vat_rate_uq").on(t.code, t.validFrom)],
);

export const CUSTOM_FIELD_TYPES = [
  "text",
  "longtext",
  "number",
  "currency",
  "date",
  "select",
  "multiselect",
  "user",
  "record",
  "checkbox",
  "url",
  "phone",
  "email",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export type CustomFieldOptions = {
  /** Možnosti pro `select` a `multiselect`. */
  choices?: { value: string; label: string; color?: string }[];
  /** Typ záznamu pro `record`. */
  entityType?: string;
  /** Výchozí hodnota při zakládání záznamu (ne pro uživatele, odkaz na záznam a více možností). */
  defaultValue?: string | number | boolean;
  /** Skryté pole se nezobrazuje (tabulka, filtr, detail, formulář); hodnoty v záznamech zůstávají. */
  hidden?: boolean;
};

/** Definice vlastního pole; hodnoty jsou ve sloupci `custom jsonb` příslušné entity. */
export const customFieldDef = pgTable(
  "custom_field_def",
  {
    id: pk(),
    entityType: text("entity_type").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type", { enum: CUSTOM_FIELD_TYPES }).notNull(),
    options: jsonb("options")
      .$type<CustomFieldOptions>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    required: boolean("required").notNull().default(false),
    position: integer("position").notNull().default(0),
    showInTable: boolean("show_in_table").notNull().default(true),
    /** Pole je v dialogu Nový/Upravit (jinak jen v detailu a tabulce). */
    showInForm: boolean("show_in_form").notNull().default(true),
    ...audit(),
  },
  (t) => [
    uniqueIndex("custom_field_key_uq")
      .on(t.entityType, t.key)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Údaje zaměstnance (1:1 k uživateli): docházka, náklady práce, řidičská oprávnění. */
export const employee = pgTable("employee", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => user.id),
  employeeNo: text("employee_no"),
  jobTitle: text("job_title"),
  phone: text("phone"),
  employmentType: text("employment_type", { enum: ["hpp", "dpp", "dpc", "osvc", "external"] })
    .notNull()
    .default("hpp"),
  /** Úvazek: 1.00 = plný. */
  workload: numeric("workload", { precision: 4, scale: 2 }).notNull().default("1.00"),
  /** Náklad firmy na hodinu práce v haléřích (pro ekonomiku zakázek). */
  hourlyCostMinor: bigint("hourly_cost_minor", { mode: "number" }),
  startDate: date("start_date", { mode: "string" }),
  licenseGroups: text("license_groups"),
  ...audit(),
});
