# Databáze: Modul Reklama

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/reklama/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Reklama](../moduly/reklama.md). Počet tabulek: 6.

## ad_account

Reklamní účet z Meta Ads (synchronizace stahuje jen čtení). `company_id` je měkký odkaz na klienta.

Definice: `packages/modules/reklama/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `meta_id` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `timezone` | `text` | ano |  |  |
| `currency` | `text` | ano |  |  |
| `owner_kind` | `text` | ne | `'agency'` | hodnoty: agency, client |
| `company_id` | `uuid` | ano |  |  |
| `active` | `boolean` | ne | `true` |  |
| `last_sync_at` | `timestamp with time zone` | ano |  |  |
| `last_sync_error` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `ad_account_meta_uq` | `meta_id` | unikátní |
| `ad_account_company_idx` | `company_id` | částečný |
| `ad_account_name_trgm_idx` | `(výraz)` |  |

## ad_campaign

Kampaň reklamního účtu; `job_id` je měkký odkaz na marketingovou zakázku, ke které se kampaň vztahuje.

Definice: `packages/modules/reklama/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `account_id` | `uuid` | ne |  | → ad_account.id (při smazání: no action) |
| `meta_id` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `objective` | `text` | ano |  |  |
| `status` | `text` | ano |  |  |
| `job_id` | `uuid` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `ad_campaign_meta_uq` | `meta_id` | unikátní |
| `ad_campaign_account_idx` | `account_id` |  |
| `ad_campaign_job_idx` | `job_id` | částečný |
| `ad_campaign_name_trgm_idx` | `(výraz)` |  |

## ad_set

Sada reklam (ad set) v kampani.

Definice: `packages/modules/reklama/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `campaign_id` | `uuid` | ne |  | → ad_campaign.id (při smazání: no action) |
| `meta_id` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `status` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `ad_set_meta_uq` | `meta_id` | unikátní |
| `ad_set_campaign_idx` | `campaign_id` |  |

## ad

Reklama v sadě; `creative_url` je odkaz na náhled kreativy.

Definice: `packages/modules/reklama/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `ad_set_id` | `uuid` | ne |  | → ad_set.id (při smazání: no action) |
| `meta_id` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `status` | `text` | ano |  |  |
| `creative_url` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `ad_meta_uq` | `meta_id` | unikátní |
| `ad_ad_set_idx` | `ad_set_id` |  |

## ad_insight_daily

Denní statistiky objektu (kampaň, sada, reklama): útrata v haléřích, zobrazení, kliky, leady. Posledních 7 dní se při synchronizaci přepisuje. Technická tabulka bez soft-delete; unikátní je `(level, object_id, date)`.

Definice: `packages/modules/reklama/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `date` | `date` | ne |  |  |
| `level` | `text` | ne |  | hodnoty: campaign, adset, ad |
| `object_id` | `uuid` | ne |  |  |
| `spend_minor` | `bigint` | ne | `0` |  |
| `impressions` | `bigint` | ne | `0` |  |
| `clicks` | `integer` | ne | `0` |  |
| `leads` | `integer` | ne | `0` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `ad_insight_daily_uq` | `level`, `object_id`, `date` | unikátní |
| `ad_insight_daily_date_idx` | `date` |  |

## lead_form_mapping

Mapování Meta formuláře na pipeline obchodů: do které fáze lead padá, kdo je vlastník a jaké služby se předvyplní. Příchozí leady loguje core `inbound_event`.

Definice: `packages/modules/reklama/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `meta_form_id` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `pipeline_id` | `uuid` | ano |  |  |
| `stage_id` | `uuid` | ano |  |  |
| `owner_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `default_services` | `text[]` | ne | `'{}'::text[]` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `lead_form_mapping_form_uq` | `meta_form_id` | unikátní, částečný |

## Migrace

Složka `packages/modules/reklama/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-15 | CREATE TABLE ×6, ALTER TABLE ×19, CREATE UNIQUE INDEX ×6, CREATE INDEX ×8; tabulky: ad, ad_account, ad_campaign, ad_insight_daily, ad_set, lead_form_mapping |
