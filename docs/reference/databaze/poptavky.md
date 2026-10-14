# Databáze: Modul CRM

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/poptavky/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [CRM](../moduly/poptavky.md). Počet tabulek: 7.

## inquiry

Poptávka (lead). Firma nemusí existovat (příchozí poptávka z webu má jen volný text); při převodu na zakázku se firma vytvoří nebo vybere. `convertedJobId` je záměrně bez cizího klíče — poptávky nesmí záviset na modulu zakázek.

Definice: `packages/modules/poptavky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `title` | `text` | ne |  |  |
| `company_id` | `uuid` | ano |  | → company.id (při smazání: no action) |
| `person_id` | `uuid` | ano |  | → person.id (při smazání: no action) |
| `company_name` | `text` | ano |  |  |
| `contact_name` | `text` | ano |  |  |
| `contact_email` | `text` | ano |  |  |
| `contact_phone` | `text` | ano |  |  |
| `stage_id` | `uuid` | ne |  | → pipeline_stage.id (při smazání: no action) |
| `source` | `text` | ano |  |  |
| `source_channel` | `text` | ano |  |  |
| `campaign` | `text` | ano |  |  |
| `expected_value_minor` | `bigint` | ne | `0` |  |
| `currency` | `text` | ne | `'CZK'` |  |
| `owner_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `next_step` | `text` | ano |  |  |
| `next_step_at` | `date` | ano |  |  |
| `lost_reason` | `text` | ano |  |  |
| `converted_job_id` | `uuid` | ano |  |  |
| `message` | `text` | ano |  |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `inquiry_stage_idx` | `stage_id` |  |
| `inquiry_owner_idx` | `owner_id` |  |
| `inquiry_company_idx` | `company_id` |  |
| `inquiry_next_step_idx` | `next_step_at` |  |
| `inquiry_title_trgm_idx` | `(výraz)` |  |
| `inquiry_custom_idx` | `custom` |  |

## inquiry_intake_key

Klíč příjmu poptávek (webhook, formulář na webu). Ukládá se jen hash; hodnotu klíče uvidí správce jednou.

Definice: `packages/modules/poptavky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `key_hash` | `text` | ne |  |  |
| `prefix` | `text` | ne |  |  |
| `last_used_at` | `timestamp with time zone` | ano |  |  |
| `revoked_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `inquiry_intake_key_hash_uq` | `key_hash` | unikátní |

## inquiry_intake

Záznam o každém příchozím požadavku (bez klíče a bez nadbytečných osobních údajů mimo to, co je v poptávce).

Definice: `packages/modules/poptavky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `key_id` | `uuid` | ano |  | → inquiry_intake_key.id (při smazání: no action) |
| `received_at` | `timestamp with time zone` | ne | `now()` |  |
| `outcome` | `text` | ne |  |  |
| `inquiry_id` | `uuid` | ano |  | → inquiry.id (při smazání: no action) |
| `ip` | `text` | ano |  |  |
| `error` | `text` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `inquiry_intake_received_idx` | `received_at` |  |

## crm_follower

Sledující zakázky: dostávají upozornění na změny a aktivity, i když zakázku nevedou.

Definice: `packages/modules/poptavky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `job_id` | `uuid` | ne |  | PK; → job.id (při smazání: cascade) |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: no action) |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `crm_follower_user_idx` | `user_id` |  |

Složený primární klíč: `job_id`, `user_id`.

## crm_activity_type

Typ aktivity (hovor, schůzka, úkol, termín, e-mail, obhlídka). Konfiguruje se; výchozí sadu zakládá seed.

Definice: `packages/modules/poptavky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `key` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `icon` | `text` | ne | `'circle'` |  |
| `default_duration_min` | `integer` | ano |  |  |
| `position` | `integer` | ne | `0` |  |
| `active` | `boolean` | ne | `true` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `crm_activity_type_key_uq` | `key` | unikátní, částečný |

## crm_activity

Aktivita: motor prodeje (co a kdy se má s obchodem udělat). Může se vázat na zakázku, firmu i osobu zároveň; vazby jsou měkká uuid bez cizího klíče (jako jinde). Přepočet `job.crm_*` provádí `crmApi.recomputeJobCrm`. Aktivita na celý den (`all_day`) má `due_at` v půlnoci pražského času.

Definice: `packages/modules/poptavky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `type_id` | `uuid` | ne |  | → crm_activity_type.id (při smazání: no action) |
| `subject` | `text` | ne |  |  |
| `due_at` | `timestamp with time zone` | ano |  |  |
| `all_day` | `boolean` | ne | `false` |  |
| `duration_min` | `integer` | ano |  |  |
| `priority` | `text` | ne | `'normal'` |  |
| `location` | `text` | ano |  |  |
| `note` | `text` | ano |  |  |
| `outcome` | `text` | ano |  |  |
| `done_at` | `timestamp with time zone` | ano |  |  |
| `done_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `assignee_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `job_id` | `uuid` | ano |  |  |
| `company_id` | `uuid` | ano |  |  |
| `person_id` | `uuid` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `crm_activity_job_idx` | `job_id` |  |
| `crm_activity_company_idx` | `company_id` |  |
| `crm_activity_person_idx` | `person_id` |  |
| `crm_activity_assignee_due_idx` | `assignee_id`, `due_at` |  |
| `crm_activity_due_idx` | `due_at` |  |

## crm_note

Poznámka u zakázky, firmy nebo osoby (polymorfní vazba), volitelně připnutá nahoru.

Definice: `packages/modules/poptavky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `body` | `text` | ne |  |  |
| `pinned` | `boolean` | ne | `false` |  |
| `entity_type` | `text` | ne |  |  |
| `entity_id` | `uuid` | ne |  |  |
| `author_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `crm_note_entity_idx` | `entity_type`, `entity_id` |  |

## Migrace

Složka `packages/modules/poptavky/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 3.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×3, ALTER TABLE ×10, CREATE INDEX ×7, CREATE UNIQUE INDEX ×1; tabulky: inquiry, inquiry_intake, inquiry_intake_key |
| 1 | `0001_crm_aktivity` | 2026-10-13 | CREATE TABLE ×4, ALTER TABLE ×12, CREATE INDEX ×7, CREATE UNIQUE INDEX ×1; tabulky: crm_activity, crm_activity_type, crm_follower, crm_note |
| 2 | `0002_inquiry_utm` | 2026-10-13 | ALTER TABLE ×2; tabulky: inquiry |
