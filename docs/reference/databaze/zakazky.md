# Databáze: Modul Zakázky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/zakazky/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Zakázky](../moduly/zakazky.md). Počet tabulek: 5.

## job

Zakázka. `number` se přiděluje z řady `zakazky.cislo` (`Z-{YYYY}-{NNN}`). Viditelnost: kořen s vlastním zámkem (rodiče nemá; soukromý klient do zakázek nedědí, R-31). Odkazy na organizaci, obchod a aktuální fázi jsou měkké (bez cizího klíče). `drive_*` píše jen modul Disk, `marketing_stage` modul Finance přes `setMarketingStage`.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `number` | `text` | ne |  |  |
| `title` | `text` | ne |  |  |
| `company_id` | `uuid` | ne |  |  |
| `type` | `text` | ne |  | hodnoty: web, marketing, systemy |
| `status` | `text` | ne | `'planned'` | hodnoty: planned, active, paused, done, cancelled |
| `current_phase_id` | `uuid` | ano |  |  |
| `billing_model` | `text` | ne | `'one_off'` | hodnoty: one_off, intro_then_retainer, retainer, hourly |
| `marketing_stage` | `text` | ano |  | hodnoty: intro, decision, retainer, ended |
| `owner_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `start_date` | `date` | ano |  |  |
| `due_date` | `date` | ano |  |  |
| `completed_at` | `timestamp with time zone` | ano |  |  |
| `price_minor` | `bigint` | ano |  |  |
| `description` | `text` | ano |  |  |
| `deal_id` | `uuid` | ano |  |  |
| `template_id` | `uuid` | ano |  | → job_template.id (při smazání: no action) |
| `drive_folder_id` | `text` | ano |  |  |
| `drive_status` | `text` | ne | `'none'` | hodnoty: none, pending, ready, error, timeout |
| `is_private` | `boolean` | ne | `false` |  |
| `visibility_source` | `text` | ne | `'own'` | hodnoty: own, inherited |
| `tags` | `text[]` | ne | `'{}'::text[]` |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_number_uq` | `number` | unikátní |
| `job_company_idx` | `company_id` |  |
| `job_owner_idx` | `owner_id` |  |
| `job_status_idx` | `status`, `type` |  |
| `job_deal_idx` | `deal_id` | částečný |
| `job_due_idx` | `due_date` | částečný |
| `job_template_idx` | `template_id` |  |
| `job_title_trgm_idx` | `(výraz)` |  |
| `job_number_trgm_idx` | `(výraz)` |  |
| `job_tags_idx` | `tags` |  |
| `job_custom_idx` | `custom` |  |
| `job_private_idx` | `is_private` | částečný |

## job_phase

Fáze zakázky (z šablony typu, upravitelné). Zdědí viditelnost zakázky (bez vlastního zámku).

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `name` | `text` | ne |  |  |
| `position` | `integer` | ne |  |  |
| `role` | `text` | ano |  | hodnoty: intro_evaluation, retainer |
| `status` | `text` | ne | `'not_started'` | hodnoty: not_started, in_progress, done, skipped |
| `planned_start` | `date` | ano |  |  |
| `planned_end` | `date` | ano |  |  |
| `completed_at` | `timestamp with time zone` | ano |  |  |
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
| `job_phase_job_idx` | `job_id`, `position` |  |
| `job_phase_status_idx` | `status` |  |
| `job_phase_private_idx` | `is_private` | částečný |

## job_member

Tým zakázky: vedoucí a členové. Člen zakázku vidí i při oprávnění „jen moje“.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `role` | `text` | ne | `'member'` | hodnoty: lead, member |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_member_uq` | `job_id`, `user_id` | unikátní, částečný |
| `job_member_user_idx` | `user_id` |  |

## job_participant

Další kontakty na zakázce (investor, TDI, projektant…) s rolí na zakázce.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `person_id` | `uuid` | ne |  |  |
| `role` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_participant_uq` | `job_id`, `person_id` | unikátní, částečný |
| `job_participant_person_idx` | `person_id` |  |

## job_template

Šablona zakázky: fáze, úkoly a platby ve verzovaném JSON (`payload`). Archivuje se, nemaže.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `type` | `text` | ne |  | hodnoty: web, marketing, systemy |
| `description` | `text` | ano |  |  |
| `default_billing_model` | `text` | ne | `'one_off'` | hodnoty: one_off, intro_then_retainer, retainer, hourly |
| `is_default` | `boolean` | ne | `false` |  |
| `archived_at` | `timestamp with time zone` | ano |  |  |
| `payload` | `jsonb` | ne | `'{"v":1,"phases":[],"tasks":[],"payments":[]}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_template_type_idx` | `type` |  |
| `job_template_default_uq` | `type` | unikátní, částečný |

## Migrace

Složka `packages/modules/zakazky/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×5, ALTER TABLE ×21, CREATE UNIQUE INDEX ×4, CREATE INDEX ×17; tabulky: job, job_member, job_participant, job_phase, job_template |
