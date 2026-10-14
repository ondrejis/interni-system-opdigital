import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { newId } from "./ids";

/** Primární klíč: UUID v7 generované aplikací. */
export function pk(name = "id") {
  return uuid(name).primaryKey().$defaultFn(newId);
}

export function ts(name: string) {
  return timestamp(name, { withTimezone: true, mode: "date" });
}

/** Peněžní částka v haléřích (celé číslo, ADR 003). Sloupec pojmenujte `*_minor`. */
export function minor(name: string) {
  return bigint(name, { mode: "number" });
}

/**
 * Sloupce, které má mít každá tabulka (ADR 002). `userId` je odkaz na `user.id`
 * zadaný líně kvůli cyklu mezi tabulkami.
 */
export function auditColumnsWith(userId: () => AnyPgColumn) {
  return {
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdBy: uuid("created_by").references(userId),
    updatedBy: uuid("updated_by").references(userId),
    deletedAt: ts("deleted_at"),
  };
}

/**
 * Sloupce viditelnosti shared/private (zámek) pro každou entitu s `EntityDef.visibility` (D §5.1). `is_private` je
 * efektivní (denormalizovaná) hodnota, `visibility_source` říká, zda ji zvolil uživatel (`own`), nebo se zdědila od
 * rodiče (`inherited`). Použití: `...visibilityColumns()` v tabulce a `visibilityIndex("deal_private_idx", t)` mezi indexy.
 */
export function visibilityColumns() {
  return {
    isPrivate: boolean("is_private").notNull().default(false),
    visibilitySource: text("visibility_source", { enum: ["own", "inherited"] })
      .notNull()
      .default("own"),
  };
}

/** Částečný index nad soukromými záznamy tabulky (`where is_private`); rychlá filtrace i anti-join. */
export function visibilityIndex(name: string, table: { isPrivate: AnyPgColumn }) {
  return index(name)
    .on(table.isPrivate)
    .where(sql`${table.isPrivate}`);
}
