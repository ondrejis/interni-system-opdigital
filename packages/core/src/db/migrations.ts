// Krok migrací (nasazení, `pnpm db:migrate`). Záměrně odděleno od `@rebar/core/db`, aby se kód migrací
// nikdy nedostal do běžící aplikace, která má jen práva k datům.
export { runMigrations, CORE_MIGRATIONS } from "./migrate";
export type { MigrateOptions, MigrationSource } from "./migrate";
export { applyGrants, APPEND_ONLY_TABLES } from "./grants";

import fs from "node:fs";
import path from "node:path";
import type { MigrationSource } from "./migrate";
import { CORE_MIGRATIONS } from "./migrate";

/**
 * Zdroje migrací: jádro první, pak zapnuté moduly v pořadí závislostí (pořadí `MODULE_IDS` je k tomu
 * záměrně sestavené a hlídá ho test). Každý modul má vlastní tabulku záznamu o migracích
 * (`__drizzle_migrations_<id>`; pomlčka v id modulu, např. `muj-prostor`, se v názvu tabulky nahradí podtržítkem,
 * aby se název nikdy nemusel uvozovat).
 */
export function migrationSources(
  repoRoot: string,
  moduleIds: readonly string[],
): MigrationSource[] {
  const sources: MigrationSource[] = [{ folder: CORE_MIGRATIONS }];
  for (const id of moduleIds) {
    const folder = path.join(repoRoot, "packages", "modules", id, "drizzle");
    if (fs.existsSync(path.join(folder, "meta", "_journal.json")))
      sources.push({ folder, table: `__drizzle_migrations_${id.replaceAll("-", "_")}` });
  }
  return sources;
}
