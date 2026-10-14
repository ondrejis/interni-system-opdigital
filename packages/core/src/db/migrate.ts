import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { installQueues } from "../jobs/jobs";
import { applyGrants } from "./grants";

/** Složka s SQL migracemi jádra (verzované v repu). */
export const CORE_MIGRATIONS = path.resolve(import.meta.dirname, "../../drizzle");

/** Složka s migracemi a název tabulky se záznamem o provedených migracích (každý modul má vlastní). */
export type MigrationSource = { folder: string; table?: string };

export type MigrateOptions = {
  /** Připojení pod uživatelem migrací (vlastník schématu). */
  url: string;
  /** Aplikační role, které se po migraci přidělí práva. */
  appRole: string;
  /** Složky s migracemi: jádro první, pak zapnuté moduly. */
  folders?: (string | MigrationSource)[];
  /** Úlohy na pozadí, jejichž fronty se mají založit (pg-boss; fronty mají vlastní tabulky). */
  queues?: Parameters<typeof installQueues>[1];
};

/**
 * Spustí migrace a přidělí práva aplikační roli. Pouští se jako samostatný krok
 * (nasazení, `pnpm db:migrate`), nikdy ne za běhu aplikace. Migrace jsou jen dopředné
 * a zpětně kompatibilní (expand → contract), aby rollback aplikace nerozbil data.
 */
export async function runMigrations({
  url,
  appRole,
  folders = [CORE_MIGRATIONS],
  queues = [],
}: MigrateOptions) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Rozšíření pro hledání bez diakritiky a trigramy (trusted → stačí vlastník DB).
    await sql`CREATE EXTENSION IF NOT EXISTS unaccent`;
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`CREATE EXTENSION IF NOT EXISTS btree_gin`;
    for (const source of folders) {
      const { folder, table } =
        typeof source === "string" ? { folder: source, table: undefined } : source;
      await migrate(drizzle(sql), {
        migrationsFolder: folder,
        ...(table ? { migrationsTable: table } : {}),
      });
    }
    if (queues.length) await installQueues(url, queues);
    const [pgboss] =
      await sql`select 1 from information_schema.schemata where schema_name = 'pgboss'`;
    await applyGrants(sql, appRole, pgboss ? ["public", "pgboss"] : ["public"]);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
