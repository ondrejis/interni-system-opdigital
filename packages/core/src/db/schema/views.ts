import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pk, ts } from "../columns";
import { audit } from "./common";
import { user } from "./identity";

/** Podmínka filtru (viz `entities/query`). Uložená jako JSON v pohledu. */
export type SavedViewConfig = {
  viewType: "table" | "kanban";
  filters?: unknown;
  sort?: { attr: string; dir: "asc" | "desc" }[];
  group?: string | null;
  columns?: string[];
  columnWidths?: Record<string, number>;
  cardAttributes?: string[];
};

/** Uložený pohled na entitu (filtr + řazení + sloupce + seskupení), osobní nebo sdílený. */
export const savedView = pgTable(
  "saved_view",
  {
    id: pk(),
    entityType: text("entity_type").notNull(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id),
    shared: boolean("shared").notNull().default(false),
    position: integer("position").notNull().default(0),
    config: jsonb("config").$type<SavedViewConfig>().notNull(),
    ...audit(),
  },
  (t) => [index("saved_view_entity_idx").on(t.entityType, t.ownerId)],
);

/** Oblíbené pohledy uživatele (zobrazují se v postranním panelu). */
export const viewFavorite = pgTable(
  "view_favorite",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    viewId: uuid("view_id")
      .notNull()
      .references(() => savedView.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.viewId] })],
);

/**
 * Index pro hledání napříč entitami (Cmd+K). `search_text` je text bez diakritiky malými písmeny;
 * trigramový index zrychlí `ILIKE '%…%'`. Aktualizuje ho servisní vrstva ve stejné transakci jako záznam.
 */
export const searchDocument = pgTable(
  "search_document",
  {
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    searchText: text("search_text").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.entityType, t.entityId] }),
    index("search_document_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
  ],
);
