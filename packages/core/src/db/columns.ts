import { bigint, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
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
