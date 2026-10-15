# Databáze: Modul Úkoly a poznámky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/ukoly/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Úkoly a poznámky](../moduly/ukoly.md). Počet tabulek: 4.

## task_type

Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…). Systémové typy se nemažou; `is_calendar_event` zobrazí úkol v kalendáři.

Definice: `packages/modules/ukoly/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `key` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `icon` | `text` | ano |  |  |
| `color` | `text` | ano |  |  |
| `is_calendar_event` | `boolean` | ne | `false` |  |
| `is_system` | `boolean` | ne | `false` |  |
| `position` | `integer` | ne | `0` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `task_type_key_uq` | `key` | unikátní, částečný |

## task

Úkol a aktivita (hovor, schůzka, e-mail, termín jsou typy úkolu). Popis je prostý text, podúkol má jednu úroveň (`parent_id`). Vazby na obchod, organizaci, kontakt, zakázku a její fázi jsou měkké (bez cizího klíče). Viditelnost: dědí od obchodu, zakázky a nadřazeného úkolu a smí mít i vlastní zámek.

Definice: `packages/modules/ukoly/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `title` | `text` | ne |  |  |
| `description` | `text` | ano |  |  |
| `type_key` | `text` | ne | `'task'` |  |
| `status` | `text` | ne | `'todo'` | hodnoty: todo, in_progress, done, canceled |
| `priority` | `text` | ne | `'none'` | hodnoty: none, low, medium, high, urgent |
| `assignee_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `due_date` | `date` | ano |  |  |
| `due_time` | `time` | ano |  |  |
| `duration_min` | `integer` | ano |  |  |
| `all_day` | `boolean` | ne | `false` |  |
| `place` | `text` | ano |  |  |
| `estimate_min` | `integer` | ano |  |  |
| `outcome` | `text` | ano |  |  |
| `completed_at` | `timestamp with time zone` | ano |  |  |
| `parent_id` | `uuid` | ano |  | → task.id (při smazání: no action) |
| `deal_id` | `uuid` | ano |  |  |
| `company_id` | `uuid` | ano |  |  |
| `person_id` | `uuid` | ano |  |  |
| `job_id` | `uuid` | ano |  |  |
| `job_phase_id` | `uuid` | ano |  |  |
| `send_invites` | `boolean` | ne | `false` |  |
| `source_template_task` | `text` | ano |  |  |
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
| `task_assignee_idx` | `assignee_id`, `status`, `due_date` |  |
| `task_open_due_idx` | `due_date` | částečný |
| `task_completed_idx` | `completed_at` | částečný |
| `task_deal_idx` | `deal_id` | částečný |
| `task_company_idx` | `company_id` | částečný |
| `task_person_idx` | `person_id` | částečný |
| `task_job_idx` | `job_id` | částečný |
| `task_job_phase_idx` | `job_phase_id` | částečný |
| `task_parent_idx` | `parent_id` | částečný |
| `task_created_by_idx` | `created_by` |  |
| `task_title_trgm_idx` | `(výraz)` |  |
| `task_tags_idx` | `tags` |  |
| `task_custom_idx` | `custom` |  |
| `task_private_idx` | `is_private` | částečný |

Kontrolní omezení: `task_duration_chk`.

## task_attendee

Účastník úkolu nebo schůzky: uživatel (`ref` = id), kontakt (`ref` = id), nebo e-mail (`ref` = adresa).

Definice: `packages/modules/ukoly/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `task_id` | `uuid` | ne |  | → task.id (při smazání: no action) |
| `kind` | `text` | ne |  | hodnoty: user, person, email |
| `ref` | `text` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `task_attendee_uq` | `task_id`, `kind`, `ref` | unikátní, částečný |
| `task_attendee_ref_idx` | `kind`, `ref` |  |

## note

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `title` | `text` | ano |  |  |
| `body_json` | `jsonb` | ano |  |  |
| `body_text` | `text` | ne | `''` |  |
| `pinned` | `boolean` | ne | `false` |  |
| `version` | `integer` | ne | `1` |  |
| `deal_id` | `uuid` | ano |  |  |
| `company_id` | `uuid` | ano |  |  |
| `person_id` | `uuid` | ano |  |  |
| `job_id` | `uuid` | ano |  |  |
| `is_private` | `boolean` | ne | `false` |  |
| `visibility_source` | `text` | ne | `'own'` | hodnoty: own, inherited |
| `tags` | `text[]` | ne | `'{}'::text[]` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `note_title_trgm_idx` | `(výraz)` |  |
| `note_body_trgm_idx` | `(výraz)` |  |
| `note_deal_idx` | `deal_id` | částečný |
| `note_company_idx` | `company_id` | částečný |
| `note_person_idx` | `person_id` | částečný |
| `note_job_idx` | `job_id` | částečný |
| `note_pinned_idx` | `updated_at` | částečný |
| `note_tags_idx` | `tags` |  |
| `note_private_idx` | `is_private` | částečný |

Kontrolní omezení: `note_version_chk`, `note_single_link_chk`.

## Migrace

Složka `packages/modules/ukoly/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 2.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×4, ALTER TABLE ×15, CREATE INDEX ×24, CREATE UNIQUE INDEX ×2; tabulky: note, task, task_attendee, task_type |
| 1 | `0001_uko_n_note_version` | 2026-10-14 | ALTER TABLE ×2; tabulky: note |
