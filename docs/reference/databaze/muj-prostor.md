# Databáze: Modul Můj prostor

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/muj-prostor/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Můj prostor](../moduly/muj-prostor.md). Počet tabulek: 4.

## recurring_service

Opakovaná služba klienta (hosting, údržba webu) s cenou za období a dalším termínem obnovy.

Definice: `packages/modules/muj-prostor/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `company_id` | `uuid` | ne |  |  |
| `job_id` | `uuid` | ano |  |  |
| `kind` | `text` | ne |  | hodnoty: hosting, maintenance |
| `name` | `text` | ne |  |  |
| `web` | `text` | ano |  |  |
| `price_minor` | `bigint` | ano |  |  |
| `period` | `text` | ne | `'yearly'` | hodnoty: yearly, monthly |
| `since` | `date` | ano |  |  |
| `next_renewal` | `date` | ano |  |  |
| `status` | `text` | ne | `'active'` | hodnoty: active, paused, canceled |
| `runs_at` | `text` | ano |  |  |
| `auto_prepare_invoice` | `boolean` | ne | `false` |  |
| `invoice_lead_days` | `integer` | ne | `14` |  |
| `fakturoid_subject_id` | `text` | ano |  |  |
| `note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `recurring_service_company_idx` | `company_id` |  |
| `recurring_service_renewal_idx` | `next_renewal` | částečný |
| `recurring_service_name_trgm_idx` | `(výraz)` |  |

## web_domain

Doména klienta nebo agentury: registrátor, expirace, kdo platí, varování `warn_days` předem. Doména je mezi živými unikátní.

Definice: `packages/modules/muj-prostor/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `domain` | `text` | ne |  |  |
| `company_id` | `uuid` | ano |  |  |
| `registrar` | `text` | ano |  |  |
| `expires_on` | `date` | ano |  |  |
| `payer` | `text` | ne | `'client'` | hodnoty: agency, client |
| `auto_renew` | `boolean` | ne | `false` |  |
| `renewal_price_minor` | `bigint` | ano |  |  |
| `dns` | `text` | ano |  |  |
| `recurring_service_id` | `uuid` | ano |  | → recurring_service.id (při smazání: no action) |
| `warn_days` | `integer` | ne | `30` |  |
| `note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `web_domain_domain_uq` | `(výraz)` | unikátní, částečný |
| `web_domain_expires_idx` | `expires_on` |  |
| `web_domain_company_idx` | `company_id` | částečný |
| `web_domain_domain_trgm_idx` | `(výraz)` |  |

## email_library_item

Soukromá knihovna e-mailových textů vlastníka (odděleně od sdílených šablon, lze přesouvat mezi nimi).

Definice: `packages/modules/muj-prostor/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `title` | `text` | ne |  |  |
| `category` | `text` | ano |  |  |
| `subject` | `text` | ne | `''` |  |
| `body_json` | `jsonb` | ano |  |  |
| `body_text` | `text` | ne | `''` |  |
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
| `email_library_item_title_trgm_idx` | `(výraz)` |  |
| `email_library_item_body_trgm_idx` | `(výraz)` |  |
| `email_library_item_category_idx` | `category` |  |
| `email_library_item_tags_idx` | `tags` |  |

## recurring_invoice

Návrh opakované faktury za období služby (v3, Fakturoid): koncept → schválená → odeslaná do Fakturoidu. Pro službu a začátek období je jen jeden návrh (`recurring_invoice_period_uq`).

Definice: `packages/modules/muj-prostor/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `recurring_service_id` | `uuid` | ne |  | → recurring_service.id (při smazání: no action) |
| `period_from` | `date` | ne |  |  |
| `period_to` | `date` | ne |  |  |
| `amount_minor` | `bigint` | ne |  |  |
| `status` | `text` | ne | `'draft'` | hodnoty: draft, approved, sent_to_fakturoid, canceled |
| `fakturoid_id` | `text` | ano |  |  |
| `fakturoid_number` | `text` | ano |  |  |
| `fakturoid_url` | `text` | ano |  |  |
| `payment_id` | `uuid` | ano |  |  |
| `approved_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `approved_at` | `timestamp with time zone` | ano |  |  |
| `error` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `recurring_invoice_period_uq` | `recurring_service_id`, `period_from` | unikátní, částečný |
| `recurring_invoice_status_idx` | `status` |  |

## Migrace

Složka `packages/modules/muj-prostor/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 2.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×4, ALTER TABLE ×15, CREATE INDEX ×11, CREATE UNIQUE INDEX ×2; tabulky: email_library_item, recurring_invoice, recurring_service, web_domain |
| 1 | `0001_zippy_avengers` | 2026-10-15 | ALTER TABLE ×1; tabulky: recurring_invoice |
