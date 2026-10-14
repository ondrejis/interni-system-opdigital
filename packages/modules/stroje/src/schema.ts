import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audit, minor, pk, schema, ts } from "@rebar/core/db";

const { user, task } = schema;

/** Stav tachometru nebo motohodin: jedno desetinné místo, v kódu desetinný řetězec (ADR 003). */
const meter = (name: string) => numeric(name, { precision: 12, scale: 1 });

/**
 * Vozidlo nebo stroj. Měří se v km (auta) nebo motohodinách (stroje); `meterValue` je poslední známý stav.
 * `internalRateMinor` je interní sazba za km nebo motohodinu, kterou se stroj počítá do nákladů zakázky.
 * Zakázka (v knize jízd, tankování, rezervaci) je měkký odkaz bez cizího klíče, aby modul fungoval i bez Zakázek.
 */
export const asset = pgTable(
  "asset",
  {
    id: pk(),
    name: text("name").notNull(),
    /** `car`, `van`, `truck`, `excavator`, `loader`, `roller`, `trailer`, `small`. */
    kind: text("kind").notNull().default("van"),
    plate: text("plate"),
    /** VIN nebo výrobní číslo. */
    vin: text("vin"),
    brand: text("brand"),
    model: text("model"),
    year: integer("year"),
    /** `diesel`, `petrol`, `lpg`, `electric`, `none`. */
    fuel: text("fuel").notNull().default("diesel"),
    /** `km` nebo `mth`. */
    meter: text("meter").notNull().default("km"),
    meterValue: meter("meter_value").notNull().default("0"),
    tankLiters: integer("tank_liters"),
    /** `active`, `service`, `retired`. */
    status: text("status").notNull().default("active"),
    responsibleId: uuid("responsible_id").references(() => user.id),
    purchaseDate: date("purchase_date", { mode: "string" }),
    purchasePriceMinor: minor("purchase_price_minor"),
    internalRateMinor: minor("internal_rate_minor"),
    stkDate: date("stk_date", { mode: "string" }),
    insuranceDate: date("insurance_date", { mode: "string" }),
    vignetteDate: date("vignette_date", { mode: "string" }),
    fuelCard: text("fuel_card"),
    note: text("note"),
    custom: jsonb("custom")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...audit(),
  },
  (t) => [
    uniqueIndex("asset_plate_uq")
      .on(t.plate)
      .where(sql`${t.plate} is not null and ${t.deletedAt} is null`),
    index("asset_status_idx").on(t.status),
    index("asset_name_trgm_idx").using("gin", sql`lower(f_unaccent(${t.name})) gin_trgm_ops`),
    index("asset_custom_idx").using("gin", t.custom),
  ],
);

/** Kniha jízd (km) i provoz strojů (motohodiny) v jedné tabulce. */
export const assetLog = pgTable(
  "asset_log",
  {
    id: pk(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    date: date("date", { mode: "string" }).notNull(),
    userId: uuid("user_id").references(() => user.id),
    meterStart: meter("meter_start"),
    meterEnd: meter("meter_end"),
    /** Ujeté km nebo odpracované motohodiny. */
    amount: meter("amount").notNull(),
    route: text("route"),
    purpose: text("purpose"),
    jobId: uuid("job_id"),
    /** Soukromá jízda: trasu a účel ostatní (mimo správce parku) nevidí. */
    private: boolean("private").notNull().default(false),
    ...audit(),
  },
  (t) => [
    index("asset_log_asset_idx").on(t.assetId, t.date),
    index("asset_log_job_idx").on(t.jobId),
    index("asset_log_user_idx").on(t.userId),
  ],
);

export const assetFuel = pgTable(
  "asset_fuel",
  {
    id: pk(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    date: date("date", { mode: "string" }).notNull(),
    userId: uuid("user_id").references(() => user.id),
    liters: numeric("liters", { precision: 10, scale: 2 }).notNull(),
    /** Částka z účtenky včetně DPH. */
    totalMinor: minor("total_minor").notNull(),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("21"),
    meterValue: meter("meter_value"),
    fullTank: boolean("full_tank").notNull().default(true),
    station: text("station"),
    /** `card` (firemní karta) nebo `cash`. */
    payment: text("payment").notNull().default("card"),
    jobId: uuid("job_id"),
    ...audit(),
  },
  (t) => [
    index("asset_fuel_asset_idx").on(t.assetId, t.date),
    index("asset_fuel_job_idx").on(t.jobId),
  ],
);

/** Servisní interval: každých X km/mth nebo Y měsíců (co nastane dřív). */
export const assetInterval = pgTable(
  "asset_interval",
  {
    id: pk(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    title: text("title").notNull(),
    everyMeter: integer("every_meter"),
    everyMonths: integer("every_months"),
    lastDate: date("last_date", { mode: "string" }),
    lastMeter: meter("last_meter"),
    ...audit(),
  },
  (t) => [index("asset_interval_asset_idx").on(t.assetId)],
);

export const assetService = pgTable(
  "asset_service",
  {
    id: pk(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    date: date("date", { mode: "string" }).notNull(),
    /** `service`, `repair`, `tires`, `inspection`, `other`. */
    kind: text("kind").notNull().default("service"),
    title: text("title").notNull(),
    vendor: text("vendor"),
    /** Náklad bez DPH. */
    costMinor: minor("cost_minor").notNull().default(0),
    meterValue: meter("meter_value"),
    /** Splněný servisní interval. */
    intervalId: uuid("interval_id").references(() => assetInterval.id),
    note: text("note"),
    ...audit(),
  },
  (t) => [index("asset_service_asset_idx").on(t.assetId, t.date)],
);

export const assetReservation = pgTable(
  "asset_reservation",
  {
    id: pk(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    dateFrom: date("date_from", { mode: "string" }).notNull(),
    dateTo: date("date_to", { mode: "string" }).notNull(),
    jobId: uuid("job_id"),
    /** Kdo stroj obsluhuje nebo má auto. */
    userId: uuid("user_id").references(() => user.id),
    note: text("note"),
    ...audit(),
  },
  (t) => [
    index("asset_reservation_asset_idx").on(t.assetId, t.dateFrom),
    index("asset_reservation_job_idx").on(t.jobId),
  ],
);

/** Závada nahlášená z terénu. Blokující závada stroj odstaví (`asset.status = service`), dokud není vyřešena. */
export const assetDefect = pgTable(
  "asset_defect",
  {
    id: pk(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => asset.id),
    title: text("title").notNull(),
    description: text("description"),
    /** `normal` nebo `blocking` (stroj nesmí jet). */
    severity: text("severity").notNull().default("normal"),
    /** `open` nebo `resolved`. */
    status: text("status").notNull().default("open"),
    reportedBy: uuid("reported_by").references(() => user.id),
    taskId: uuid("task_id").references(() => task.id),
    resolution: text("resolution"),
    resolvedAt: ts("resolved_at"),
    ...audit(),
  },
  (t) => [
    index("asset_defect_asset_idx").on(t.assetId, t.status),
    index("asset_defect_status_idx").on(t.status),
  ],
);
