import { createDb } from "@rebar/core/db";
import { sql } from "drizzle-orm";
import type { DemoServices } from "./kit";

/** Tabulky, které zůstávají (uživatelé, role, nastavení, číselníky, řady, pipeline): všechno ostatní jsou obchodní data. */
const KEEP = new Set([
  "account",
  "session",
  "user",
  "verification",
  "two_factor",
  "invitation",
  "login_event",
  "role",
  "role_permission",
  "rate_limit",
  "push_subscription",
  "setting",
  "vat_rate",
  "number_series",
  "pipeline",
  "pipeline_stage",
  "lookup_list",
  "lookup_item",
  "custom_field_def",
  "crm_activity_type",
  "approval_rule",
  "saved_view",
  "view_favorite",
  "employee",
  "email_log",
  "calendar_feed",
  "__drizzle_migrations",
]);

/** Tabulky, jejichž záznamy seed označuje jako demo (`custom.demo = true`); podle nich se pozná, že v databázi nejsou cizí data. */
export const MARKED_TABLES = [
  "company",
  "person",
  "inquiry",
  "job",
  "asset",
  "stock_item",
  "event",
  "invoice",
  "received_invoice",
] as const;

type Row = Record<string, unknown>;

export async function businessRowCount(s: DemoServices): Promise<number> {
  let total = 0;
  for (const t of ["company", "person", "job", "inquiry", "invoice"]) {
    const [r] = (await s.db.execute(
      sql.raw(`select count(*)::int as n from "${t}" where deleted_at is null`),
    )) as unknown as Row[];
    total += Number(r?.n ?? 0);
  }
  return total;
}

export async function unmarkedRowCount(s: DemoServices): Promise<number> {
  let total = 0;
  for (const t of MARKED_TABLES) {
    const [r] = (await s.db.execute(
      sql.raw(
        `select count(*)::int as n from "${t}" where deleted_at is null and coalesce(custom->>'demo', '') <> 'true'`,
      ),
    )) as unknown as Row[];
    total += Number(r?.n ?? 0);
  }
  return total;
}

/** Značka dokončeného (`complete`) nebo rozpracovaného (přerušeného) nasazení demo dat. */
export async function demoMarker(s: DemoServices): Promise<{ exists: boolean; complete: boolean }> {
  const rows = (await s.db.execute(
    sql`select value from setting where key = 'demo-seed'`,
  )) as unknown as { value: { complete?: boolean } }[];
  return { exists: rows.length > 0, complete: rows[0]?.value?.complete === true };
}

export async function writeDemoMarker(s: DemoServices, complete: boolean) {
  await s.db.execute(
    sql`insert into setting (key, value) values ('demo-seed', ${JSON.stringify({ version: 1, complete })}::jsonb)
        on conflict (key) do update set value = excluded.value, updated_at = now()`,
  );
}

/**
 * Smaže všechna obchodní data (zakázky, kontakty, faktury, sklad, stroje, kalendář, úkoly, soubory…).
 * Uživatelé, role, nastavení, číselníky a číselné řady zůstávají; řada zakázek tedy pokračuje za dosavadními čísly.
 * Potřebuje připojení pod vlastníkem schématu (`DATABASE_MIGRATE_URL`): aplikační role nesmí TRUNCATE.
 */
export async function wipeBusinessData(
  s: DemoServices,
  migratorUrl: string | undefined,
  log: (m: string) => void,
) {
  if (!migratorUrl)
    throw new Error(
      "Mazání dat vyžaduje DATABASE_MIGRATE_URL (připojení pod vlastníkem schématu). Aplikační role nesmí TRUNCATE.",
    );
  // soubory na disku: nejdřív podle záznamů v databázi
  const files = (await s.db.execute(sql`select storage_key from file`)) as unknown as {
    storage_key: string;
  }[];
  for (const f of files) await s.deps.storage.delete(f.storage_key).catch(() => {});

  const h = createDb(migratorUrl, { max: 1 });
  try {
    const tables = (
      await h.sql<{ table_name: string }[]>`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`
    )
      .map((t) => t.table_name)
      .filter((t) => !KEEP.has(t) && !t.startsWith("__"));
    // zálohy jsou na straně provozovatele; tady jen kontrola, že TRUNCATE CASCADE nesáhne na ponechané tabulky
    const refs = await h.sql<{ child: string; parent: string }[]>`
      select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
      from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`;
    for (const r of refs) {
      const child = r.child.replaceAll('"', "");
      const parent = r.parent.replaceAll('"', "");
      if (KEEP.has(child) && tables.includes(parent))
        throw new Error(
          `Tabulka ${child} (ponechaná) odkazuje na mazanou tabulku ${parent}; mazání přerušeno.`,
        );
    }
    await h.sql.unsafe(
      `TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
    await h.sql`delete from setting where key = 'demo-seed'`;
    log(
      `Smazáno ${tables.length} tabulek s obchodními daty (uživatelé, role, nastavení a číselné řady zůstaly).`,
    );
  } finally {
    await h.close();
  }
}
