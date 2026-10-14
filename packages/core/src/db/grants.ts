import type postgres from "postgres";

/** Tabulky, které smí aplikace jen číst a přidávat do nich. */
export const APPEND_ONLY_TABLES = ["audit_log"] as const;

function ident(name: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Neplatný název DB role: ${name}`);
  return `"${name}"`;
}

/**
 * Přidělí aplikační roli minimální práva: čtení a zápis dat, žádné DDL,
 * u append-only tabulek (audit) jen INSERT a SELECT. Spouští se po každé migraci
 * pod uživatelem migrací, takže je idempotentní.
 */
export async function applyGrants(
  sql: postgres.Sql,
  appRole: string,
  schemas: string[] = ["public"],
) {
  const role = ident(appRole);
  for (const schema of schemas) {
    const s = ident(schema);
    await sql.unsafe(`GRANT USAGE ON SCHEMA ${s} TO ${role}`);
    await sql.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${s} TO ${role}`,
    );
    await sql.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${s} TO ${role}`);
    await sql.unsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await sql.unsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );
  }
  for (const table of APPEND_ONLY_TABLES) {
    await sql.unsafe(
      `REVOKE UPDATE, DELETE, TRUNCATE ON ${ident("public")}.${ident(table)} FROM ${role}`,
    );
  }
}
