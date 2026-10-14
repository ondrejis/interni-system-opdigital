import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, ts } from "../columns";
import { audit } from "./common";
import { user } from "./identity";

/**
 * Vlastní nástěnka: definice (widgety a mřížka) je JSON s verzí schématu (`schema_version`, migrace při čtení).
 * `owner_id` je autor; nástěnka ze seedu klienta (`seed_key`) nemá autora. Výchozí nástěnka pro roli má `default_for_role`
 * (vidí ji všichni z této role); `is_home` ji zároveň otevírá na úvodní stránce místo klasického Přehledu.
 */
export const dashboard = pgTable(
  "dashboard",
  {
    id: pk(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").references(() => user.id),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    /** Klíč nástěnky ze seedu klienta (`config.ts`); podle něj se seed zakládá jen jednou. */
    seedKey: text("seed_key"),
    defaultForRole: text("default_for_role"),
    isHome: boolean("is_home").notNull().default(false),
    ...audit(),
  },
  (t) => [
    uniqueIndex("dashboard_seed_key_uq")
      .on(t.seedKey)
      .where(sql`${t.seedKey} is not null`),
    // na úvodní stránce se otevírá nejvýš jedna nástěnka za roli
    uniqueIndex("dashboard_home_role_uq")
      .on(t.defaultForRole)
      .where(sql`${t.isHome} and ${t.deletedAt} is null`),
    index("dashboard_owner_idx").on(t.ownerId),
    index("dashboard_role_idx").on(t.defaultForRole),
  ],
);

/** Sdílení nástěnky s rolí (`kind = role`, `ref` = klíč role) nebo uživatelem (`kind = user`, `ref` = id). */
export const dashboardShare = pgTable(
  "dashboard_share",
  {
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboard.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["role", "user"] }).notNull(),
    ref: text("ref").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.dashboardId, t.kind, t.ref] }),
    index("dashboard_share_ref_idx").on(t.kind, t.ref),
  ],
);

/** Pořadí nástěnek v přepínači na úvodní stránce, zvlášť pro každého uživatele. */
export const dashboardPref = pgTable(
  "dashboard_pref",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboard.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.dashboardId] })],
);
