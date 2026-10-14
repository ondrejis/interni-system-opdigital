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
    /** Připnuto do navigace pod danou entitu (C3); pořadí podle `position`. */
    pinned: boolean("pinned").notNull().default(false),
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
    /** Efektivní viditelnost záznamu v době indexace; soukromé se bez `private.read` nikdy nenajdou. */
    isPrivate: boolean("is_private").notNull().default(false),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.entityType, t.entityId] }),
    index("search_document_private_idx")
      .on(t.entityType)
      .where(sql`${t.isPrivate}`),
    index("search_document_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
  ],
);

/**
 * Soukromé záznamy napříč entitami (D §5.1). Řádek vzniká a zaniká ve stejné transakci jako změna `is_private`
 * (nebo smazání záznamu), takže průřezové dotazy (komentáře, soubory, historie, koš, soukromý přehled) nemusí znát tabulky.
 */
export const privateRecord = pgTable(
  "private_record",
  {
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    since: ts("since").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.entityType, t.entityId] }),
    index("private_record_id_idx").on(t.entityId),
  ],
);

/** Naposledy otevřené záznamy uživatele (paleta Cmd+K, „Nedávné“; drží se posledních 8, C3). */
export const recentRecord = pgTable(
  "recent_record",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    visitedAt: ts("visited_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.entityType, t.entityId] }),
    index("recent_record_user_idx").on(t.userId, t.visitedAt),
  ],
);
