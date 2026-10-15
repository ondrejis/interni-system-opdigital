import { getTableColumns, getTableName } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { EntityDef } from "./types";

/** Minimum, které o registru entit potřebují vazby (registr z `engine.ts`; typ tu opakujeme kvůli cyklu importů). */
export type LinkRegistry = { get(key: string): EntityDef | undefined; all(): EntityDef[] };

/** Dítě záznamu: tabulka, jejíž sloupec `fkName` odkazuje na `id` rodiče. `def` je u dětí, které jsou entity. */
export type ChildLink = {
  /** Klíč entity dítěte (u dětí bez entity jen označení z `EntityLink.entityType`). */
  entityType: string;
  def: EntityDef | undefined;
  table: PgTable;
  columns: Record<string, AnyPgColumn>;
  fkName: string;
  fk: AnyPgColumn;
};

/** Rodič záznamu: entita a sloupec, kterým na ni záznam odkazuje (z `visibility.parents`). */
export type ParentLink = {
  entityType: string;
  def: EntityDef;
  fkName: string;
  fk: AnyPgColumn;
};

const cols = (t: PgTable) => getTableColumns(t) as Record<string, AnyPgColumn>;

/**
 * Děti entity `key`: sloupce z `EntityDef.children` (včetně tabulek, které nejsou entity) a sloupce, kterými na ni
 * odkazují jiné entity přes `visibility.parents`. Chybí-li cílová entita (modul není zapnutý), vazba se přeskočí.
 */
export function childLinks(registry: LinkRegistry, key: string): ChildLink[] {
  const out: ChildLink[] = [];
  const seen = new Set<string>();
  const add = (entityType: string, table: PgTable, fkName: string, def: EntityDef | undefined) => {
    const columns = cols(table);
    const fk = columns[fkName];
    if (!fk) return;
    const id = `${getTableName(table)}.${fkName}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ entityType, def, table, columns, fkName, fk });
  };
  const owner = registry.get(key);
  for (const l of owner?.children ?? []) {
    const def = registry.get(l.entityType);
    const table = l.table ?? def?.table;
    if (table) add(l.entityType, table, l.column, def);
  }
  for (const d of registry.all())
    for (const p of d.visibility?.parents ?? [])
      if (p.entityType === key) add(d.key, d.table, p.column, d);
  return out;
}

/** Rodiče entity z `visibility.parents`, jejichž entita je v registru. */
export function parentLinks(registry: LinkRegistry, def: EntityDef): ParentLink[] {
  const columns = cols(def.table);
  const out: ParentLink[] = [];
  for (const p of def.visibility?.parents ?? []) {
    const parent = registry.get(p.entityType);
    const fk = columns[p.column];
    if (parent && fk) out.push({ entityType: p.entityType, def: parent, fkName: p.column, fk });
  }
  return out;
}

/** Entita má zámek (shared/private)? Stačí `visibility` v definici; sloupce hlídá `createEntityRegistry`. */
export function hasVisibility(def: EntityDef): boolean {
  return !!def.visibility;
}

/** Entity, u kterých je záznam bez zakázky vždy soukromý, i když to definice neřekne (R-12, platba z Fakturoidu). */
const ORPHAN_PRIVATE_DEFAULT = new Set(["payment"]);

/** Je záznam bez rodiče vždy soukromý (`visibility.privateWithoutParent`, výchozí pro `payment`)? */
export function isPrivateWithoutParent(def: EntityDef): boolean {
  return (
    !!def.visibility &&
    (def.visibility.privateWithoutParent ?? ORPHAN_PRIVATE_DEFAULT.has(def.key)) &&
    (def.visibility.parents?.length ?? 0) > 0
  );
}
