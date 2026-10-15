import { getTableColumns } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { inArray } from "drizzle-orm";
import type { Executor } from "@rebar/core/db";
import type { EntityRegistry } from "@rebar/core/entities";

/*
  Jen ke čtení: tabulky jiných modulů, které úkoly potřebují pro názvy (fáze zakázky). Nejsou součástí schématu modulu
  (drizzle-kit je nevidí), takže nevznikne žádná migrace; názvy a sloupce jsou kontrakt ze S1 (`zakazky.job_phase`).
*/
export const jobPhaseView = pgTable("job_phase", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  jobId: uuid("job_id").notNull(),
});

/** Názvy fází zakázek podle id (prázdné, když modul zakázek není zapnutý). */
export async function phaseNames(
  db: Executor,
  registry: EntityRegistry,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (!ids.length || !registry.get("job")) return new Map();
  const rows = await db
    .select({ id: jobPhaseView.id, name: jobPhaseView.name })
    .from(jobPhaseView)
    .where(inArray(jobPhaseView.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Přečte vybrané sloupce záznamů cizí entity podle id (názvy vlastností tabulky), bez ověřování oprávnění: volající
 * smí použít jen to, co už ověřil (viditelné id). Entita nebo sloupec, který neexistuje, se vynechá.
 */
export async function readColumns<K extends string>(
  db: Executor,
  registry: EntityRegistry,
  entityKey: string,
  ids: readonly string[],
  fields: readonly K[],
): Promise<Map<string, Partial<Record<K | "id", unknown>>>> {
  const def = registry.get(entityKey);
  if (!def || !ids.length) return new Map();
  const cols = getTableColumns(def.table) as Record<string, AnyPgColumn>;
  const picked = Object.fromEntries(
    fields.filter((f) => cols[f]).map((f) => [f, cols[f]!]),
  ) as Record<string, AnyPgColumn>;
  const rows = (await db
    .select({ id: cols.id!, ...picked })
    .from(def.table)
    .where(inArray(cols.id!, [...ids]))) as Record<string, unknown>[];
  return new Map(rows.map((r) => [String(r.id), r as Partial<Record<K | "id", unknown>>]));
}
