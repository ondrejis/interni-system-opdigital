# Databáze: Modul Zakázky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/zakazky/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Zakázky](../moduly/zakazky.md). Počet tabulek: 5.

## job

Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `number` | `text` | ne |  |  |
| `title` | `text` | ne |  |  |
| `company_id` | `uuid` | ne |  | → company.id (při smazání: no action) |
| `person_id` | `uuid` | ano |  | → person.id (při smazání: no action) |
| `stage_id` | `uuid` | ne |  | → pipeline_stage.id (při smazání: no action) |
| `value_minor` | `bigint` | ne | `0` |  |
| `currency` | `text` | ne | `'CZK'` |  |
| `address` | `text` | ano |  |  |
| `start_date` | `date` | ano |  |  |
| `end_date` | `date` | ano |  |  |
| `manager_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `description` | `text` | ano |  |  |
| `phase` | `text` | ne | `'preparation'` |  |
| `phase_changed_at` | `timestamp with time zone` | ano |  |  |
| `paused_from` | `text` | ano |  |  |
| `lost_reason` | `text` | ano |  |  |
| `won_at` | `date` | ano |  |  |
| `handover_at` | `date` | ano |  |  |
| `closed_at` | `date` | ano |  |  |
| `warranty_months` | `integer` | ano |  |  |
| `warranty_until` | `date` | ano |  |  |
| `color` | `text` | ano |  |  |
| `source_inquiry_id` | `uuid` | ano |  |  |
| `template_id` | `uuid` | ano |  |  |
| `expected_close_date` | `date` | ano |  |  |
| `crm_probability_pct` | `smallint` | ano |  |  |
| `crm_source` | `text` | ano |  |  |
| `crm_source_channel` | `text` | ano |  |  |
| `crm_campaign` | `text` | ano |  |  |
| `site_city` | `text` | ano |  |  |
| `crm_stage_entered_at` | `timestamp with time zone` | ano |  |  |
| `crm_next_activity_at` | `timestamp with time zone` | ano |  |  |
| `crm_last_activity_at` | `timestamp with time zone` | ano |  |  |
| `crm_open_activities` | `integer` | ne | `0` |  |
| `crm_overdue_activities` | `integer` | ne | `0` |  |
| `crm_rotting` | `boolean` | ne | `false` |  |
| `crm_weighted_minor` | `bigint` | ne | `0` |  |
| `crm_archived_at` | `timestamp with time zone` | ano |  |  |
| `crm_lost_note` | `text` | ano |  |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_number_uq` | `number` | unikátní |
| `job_phase_idx` | `phase` |  |
| `job_company_idx` | `company_id` |  |
| `job_stage_idx` | `stage_id` |  |
| `job_manager_idx` | `manager_id` |  |
| `job_crm_close_idx` | `expected_close_date` |  |
| `job_crm_next_activity_idx` | `crm_next_activity_at` |  |
| `job_title_trgm_idx` | `(výraz)` |  |
| `job_number_trgm_idx` | `(výraz)` |  |
| `job_address_trgm_idx` | `(výraz)` |  |
| `job_custom_idx` | `custom` |  |

## job_member

Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `job_id` | `uuid` | ne |  | PK; → job.id (při smazání: cascade) |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: no action) |
| `role` | `text` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_member_user_idx` | `user_id` |  |

Složený primární klíč: `job_id`, `user_id`.

## job_stage_history

Historie stavů zakázky: jeden řádek na pobyt ve stavu (`left_at` je prázdné u aktuálního). Zapisuje ji změna stavu (`lifecycle/history.ts`); z ní se počítají dny ve stavu (pás fází), konverze a rychlost obchodu.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `stage_id` | `uuid` | ne |  | → pipeline_stage.id (při smazání: no action) |
| `phase` | `text` | ano |  |  |
| `entered_at` | `timestamp with time zone` | ne | `now()` |  |
| `left_at` | `timestamp with time zone` | ano |  |  |
| `changed_by` | `uuid` | ano |  | → user.id (při smazání: no action) |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_stage_history_job_idx` | `job_id`, `entered_at` |  |
| `job_stage_history_stage_idx` | `stage_id` |  |

## job_participant

Další lidé na zakázce kromě hlavní kontaktní osoby (investor, TDI, projektant…), s rolí na zakázce.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: cascade) |
| `person_id` | `uuid` | ne |  | → person.id (při smazání: no action) |
| `role` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_participant_uq` | `job_id`, `person_id` | unikátní, částečný |
| `job_participant_person_idx` | `person_id` |  |

## job_template

Šablona zakázky: úkoly, složky a role týmu v JSON (tvar určuje `templates` v modulu).

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `description` | `text` | ano |  |  |
| `payload` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

## Migrace

Složka `packages/modules/zakazky/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×5, ALTER TABLE ×17, CREATE UNIQUE INDEX ×2, CREATE INDEX ×14; tabulky: job, job_member, job_participant, job_stage_history, job_template |
