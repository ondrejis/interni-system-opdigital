# Databáze: Modul Obchody

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/obchody/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Obchody](../moduly/obchody.md). Počet tabulek: 3.

## deal

Obchod (příležitost). Pipeline `deal/default`: `stage_id` je stav pipeline (atribut `status`), `result` říká, zda je obchod otevřený, vyhraný, nebo prohraný. Viditelnost: kořen s vlastním zámkem. Odkazy na organizaci a kontakt jsou měkké. `next_activity_at`, `last_activity_at` a `next_task_id` jsou systémová pole, která píše modul Úkoly (`writeSystemFields`); `meta_leadgen_id` je idempotenční klíč Meta leadu.

Definice: `packages/modules/obchody/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `title` | `text` | ne |  |  |
| `company_id` | `uuid` | ano |  |  |
| `person_id` | `uuid` | ano |  |  |
| `stage_id` | `uuid` | ne |  | → pipeline_stage.id (při smazání: no action) |
| `stage_entered_at` | `timestamp with time zone` | ne | `now()` |  |
| `result` | `text` | ne | `'open'` | hodnoty: open, won, lost |
| `value_minor` | `bigint` | ano |  |  |
| `weighted_minor` | `bigint` | ano |  |  |
| `services` | `text[]` | ne | `'{}'::text[]` |  |
| `expected_close_date` | `date` | ano |  |  |
| `owner_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `source` | `text` | ne | `'manual'` | hodnoty: manual, meta, web_form, referral, other |
| `source_detail` | `text` | ano |  |  |
| `meta_campaign_id` | `text` | ano |  |  |
| `meta_adset_id` | `text` | ano |  |  |
| `meta_ad_id` | `text` | ano |  |  |
| `meta_leadgen_id` | `text` | ano |  |  |
| `won_at` | `timestamp with time zone` | ano |  |  |
| `lost_at` | `timestamp with time zone` | ano |  |  |
| `lost_reason` | `text` | ano |  |  |
| `lost_note` | `text` | ano |  |  |
| `first_opened_at` | `timestamp with time zone` | ano |  |  |
| `opened_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `next_activity_at` | `timestamp with time zone` | ano |  |  |
| `last_activity_at` | `timestamp with time zone` | ano |  |  |
| `next_task_id` | `uuid` | ano |  |  |
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
| `deal_meta_leadgen_uq` | `meta_leadgen_id` | unikátní, částečný |
| `deal_stage_idx` | `stage_id`, `result` |  |
| `deal_company_idx` | `company_id` |  |
| `deal_person_idx` | `person_id` |  |
| `deal_owner_idx` | `owner_id` |  |
| `deal_open_close_idx` | `expected_close_date` | částečný |
| `deal_next_activity_idx` | `next_activity_at` | částečný |
| `deal_unopened_idx` | `created_at` | částečný |
| `deal_title_trgm_idx` | `(výraz)` |  |
| `deal_services_idx` | `services` |  |
| `deal_tags_idx` | `tags` |  |
| `deal_custom_idx` | `custom` |  |
| `deal_private_idx` | `is_private` | částečný |

## deal_participant

Další kontakty u obchodu (kromě hlavního kontaktu). Zdědí viditelnost obchodu.

Definice: `packages/modules/obchody/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `deal_id` | `uuid` | ne |  | → deal.id (při smazání: no action) |
| `person_id` | `uuid` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `deal_participant_uq` | `deal_id`, `person_id` | unikátní, částečný |
| `deal_participant_person_idx` | `person_id` |  |

## deal_stage_history

Historie fází obchodu: jeden řádek na pobyt ve fázi (`left_at` je prázdné u aktuální). Jen přírůstky; z ní se počítá doba ve fázi, konverze a rychlost obchodu.

Definice: `packages/modules/obchody/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `deal_id` | `uuid` | ne |  | → deal.id (při smazání: no action) |
| `from_stage_id` | `uuid` | ano |  | → pipeline_stage.id (při smazání: no action) |
| `to_stage_id` | `uuid` | ne |  | → pipeline_stage.id (při smazání: no action) |
| `entered_at` | `timestamp with time zone` | ne | `now()` |  |
| `left_at` | `timestamp with time zone` | ano |  |  |
| `duration_sec` | `integer` | ano |  |  |
| `by_user_id` | `uuid` | ano |  | → user.id (při smazání: no action) |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `deal_stage_history_deal_idx` | `deal_id`, `entered_at` |  |
| `deal_stage_history_stage_idx` | `to_stage_id` |  |

## Migrace

Složka `packages/modules/obchody/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×3, ALTER TABLE ×14, CREATE UNIQUE INDEX ×2, CREATE INDEX ×15; tabulky: deal, deal_participant, deal_stage_history |
