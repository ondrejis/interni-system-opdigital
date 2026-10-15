# Databáze: Modul Hodiny

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/hodiny/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Hodiny](../moduly/hodiny.md). Počet tabulek: 1.

## time_entry

Odpracovaný čas: kdo, na které zakázce, případně u kterého úkolu, v který den a kolik minut (&gt; 0). Zakázka a úkol jsou měkké odkazy. Viditelnost se dědí od zakázky a úkolu (hodiny soukromé zakázky jsou soukromé), bez vlastního zámku.

Definice: `packages/modules/hodiny/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `job_id` | `uuid` | ne |  |  |
| `task_id` | `uuid` | ano |  |  |
| `date` | `date` | ne |  |  |
| `minutes` | `integer` | ne |  |  |
| `note` | `text` | ano |  |  |
| `is_private` | `boolean` | ne | `false` |  |
| `visibility_source` | `text` | ne | `'own'` | hodnoty: own, inherited |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `time_entry_user_date_idx` | `user_id`, `date` |  |
| `time_entry_job_idx` | `job_id`, `date` |  |
| `time_entry_task_idx` | `task_id` | částečný |
| `time_entry_private_idx` | `is_private` | částečný |

Kontrolní omezení: `time_entry_minutes_chk`.

## Migrace

Složka `packages/modules/hodiny/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×1, ALTER TABLE ×4, CREATE INDEX ×4; tabulky: time_entry |
