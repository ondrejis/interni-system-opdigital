# Databáze: Modul Realizace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/realizace/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Realizace](../moduly/realizace.md). Počet tabulek: 5.

## job_phase

Fáze harmonogramu zakázky. Termíny jsou data (pracovní dny řeší výpočty); `baseline*` je výchozí plán, `actual*` skutečnost. Stav plyne z průběhu (0 % plánováno, 1–99 % probíhá, 100 % hotovo).

Definice: `packages/modules/realizace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `name` | `text` | ne |  |  |
| `start_date` | `date` | ne |  |  |
| `end_date` | `date` | ne |  |  |
| `baseline_start` | `date` | ano |  |  |
| `baseline_end` | `date` | ano |  |  |
| `actual_start` | `date` | ano |  |  |
| `actual_end` | `date` | ano |  |  |
| `progress` | `integer` | ne | `0` |  |
| `status` | `text` | ne | `'planned'` |  |
| `planned_hours` | `integer` | ano |  |  |
| `responsible_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `depends_on_id` | `uuid` | ano |  | → job_phase.id (při smazání: no action) |
| `milestone` | `boolean` | ne | `false` |  |
| `note` | `text` | ano |  |  |
| `position` | `integer` | ne | `0` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_phase_job_idx` | `job_id`, `position` |  |
| `job_phase_range_idx` | `start_date`, `end_date` |  |

## site_diary

Stavební deník: jeden zápis na zakázku a den.

Definice: `packages/modules/realizace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `date` | `date` | ne |  |  |
| `weather` | `text` | ano |  |  |
| `temperature` | `integer` | ano |  |  |
| `people` | `text` | ano |  |  |
| `work` | `text` | ano |  |  |
| `machines` | `text` | ano |  |  |
| `materials` | `text` | ano |  |  |
| `events` | `text` | ano |  |  |
| `weather_data` | `jsonb` | ano |  |  |
| `workers` | `jsonb` | ano |  |  |
| `material_rows` | `jsonb` | ano |  |  |
| `machine_rows` | `jsonb` | ano |  |  |
| `incidents` | `jsonb` | ano |  |  |
| `photo_ids` | `jsonb` | ano |  |  |
| `for_investor` | `boolean` | ne | `false` |  |
| `signed_at` | `timestamp with time zone` | ano |  |  |
| `signed_by_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `signed_name` | `text` | ano |  |  |
| `signature_file_id` | `uuid` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `site_diary_job_date_uq` | `job_id`, `date` | unikátní, částečný |

## handover_protocol

Předávací protokol zakázky (i částečné předání). Podpis zákazníka je soubor připojený k zakázce.

Definice: `packages/modules/realizace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `number` | `text` | ne |  |  |
| `date` | `date` | ne |  |  |
| `note` | `text` | ano |  |  |
| `accepted_by` | `text` | ano |  |  |
| `status` | `text` | ne | `'draft'` |  |
| `signature_file_id` | `uuid` | ano |  |  |
| `signed_at` | `date` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `handover_number_uq` | `number` | unikátní |
| `handover_job_idx` | `job_id` |  |

## handover_item

Definice: `packages/modules/realizace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `protocol_id` | `uuid` | ne |  | → handover_protocol.id (při smazání: no action) |
| `position` | `integer` | ne | `0` |  |
| `text` | `text` | ne |  |  |
| `ok` | `boolean` | ne | `true` |  |
| `note` | `text` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `handover_item_protocol_idx` | `protocol_id`, `position` |  |

## defect

Vada nebo reklamace na zakázce. Stav je pipeline (kanban), takže jde spravovat jako ostatní záznamy.

Definice: `packages/modules/realizace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `title` | `text` | ne |  |  |
| `description` | `text` | ano |  |  |
| `stage_id` | `uuid` | ne |  | → pipeline_stage.id (při smazání: no action) |
| `severity` | `text` | ano |  |  |
| `found_at` | `date` | ano |  |  |
| `due_date` | `date` | ano |  |  |
| `responsible_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `fixed_at` | `date` | ano |  |  |
| `handover_id` | `uuid` | ano |  | → handover_protocol.id (při smazání: no action) |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `defect_job_idx` | `job_id` |  |
| `defect_stage_idx` | `stage_id` |  |
| `defect_responsible_idx` | `responsible_id` |  |
| `defect_due_idx` | `due_date` |  |

## Migrace

Složka `packages/modules/realizace/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 2.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×5, ALTER TABLE ×18, CREATE INDEX ×8, CREATE UNIQUE INDEX ×2; tabulky: defect, handover_item, handover_protocol, job_phase, site_diary |
| 1 | `0001_stavebni_denik` | 2026-10-09 | ALTER TABLE ×12; tabulky: site_diary |
