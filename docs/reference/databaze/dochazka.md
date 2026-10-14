# Databáze: Modul Docházka

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/dochazka/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Docházka](../moduly/dochazka.md). Počet tabulek: 2.

## time_entry

Záznam docházky. Doba je v minutách. Zápis je buď ručně (od–do s přestávkou, nebo přímo hodiny), nebo z píchačky (`source = clock`): běžící záznam má `startedAt` a nemá `endedAt`. Zakázka a fáze jsou měkké odkazy (bez cizího klíče), aby docházka fungovala i bez modulů Zakázky a Realizace. `hourlyCostMinor` je snímek nákladu zaměstnance v době zápisu.

Definice: `packages/modules/dochazka/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `date` | `date` | ne |  |  |
| `kind` | `text` | ne | `'work'` |  |
| `started_at` | `timestamp with time zone` | ano |  |  |
| `ended_at` | `timestamp with time zone` | ano |  |  |
| `break_minutes` | `integer` | ne | `0` |  |
| `break_started_at` | `timestamp with time zone` | ano |  |  |
| `minutes` | `integer` | ne | `0` |  |
| `job_id` | `uuid` | ano |  |  |
| `phase_id` | `uuid` | ano |  |  |
| `note` | `text` | ano |  |  |
| `source` | `text` | ne | `'manual'` |  |
| `status` | `text` | ne | `'draft'` |  |
| `hourly_cost_minor` | `bigint` | ne | `0` |  |
| `reviewer_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `reviewed_at` | `timestamp with time zone` | ano |  |  |
| `review_note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `time_entry_user_date_idx` | `user_id`, `date` |  |
| `time_entry_job_idx` | `job_id` |  |
| `time_entry_status_idx` | `status` |  |
| `time_entry_note_trgm_idx` | `(výraz)` |  |
| `time_entry_running_uq` | `user_id` | unikátní, částečný |

## time_lock

Uzavřený měsíc (podklad pro mzdy): v něm už se docházka nemění.

Definice: `packages/modules/dochazka/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `month` | `text` | ne |  | PK |
| `locked_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `locked_at` | `timestamp with time zone` | ne | `now()` |  |

## Migrace

Složka `packages/modules/dochazka/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 2.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×2, ALTER TABLE ×5, CREATE INDEX ×3, CREATE UNIQUE INDEX ×1; tabulky: time_entry, time_lock |
| 1 | `0001_trgm_hledani` | 2026-10-09 | CREATE INDEX ×1; tabulky: time_entry |
