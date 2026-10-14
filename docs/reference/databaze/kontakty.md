# Databáze: Modul Organizace a kontakty

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/kontakty/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Organizace a kontakty](../moduly/kontakty.md). Počet tabulek: 3.

## company

Firma: klient, dodavatel nebo subdodavatel. IČO je mezi živými záznamy unikátní.

Definice: `packages/modules/kontakty/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `ico` | `text` | ano |  |  |
| `dic` | `text` | ano |  |  |
| `street` | `text` | ano |  |  |
| `city` | `text` | ano |  |  |
| `zip` | `text` | ano |  |  |
| `email` | `text` | ano |  |  |
| `phone` | `text` | ano |  |  |
| `web` | `text` | ano |  |  |
| `note` | `text` | ano |  |  |
| `roles` | `text[]` | ne | `'{client}'::text[]` |  |
| `type` | `text` | ano |  |  |
| `parent_company_id` | `uuid` | ano |  | → company.id (při smazání: no action) |
| `tags` | `text[]` | ne | `'{}'::text[]` |  |
| `owner_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `ares_checked_at` | `timestamp with time zone` | ano |  |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `company_ico_uq` | `ico` | unikátní, částečný |
| `company_name_trgm_idx` | `(výraz)` |  |
| `company_ico_trgm_idx` | `(výraz)` |  |
| `company_city_trgm_idx` | `(výraz)` |  |
| `company_email_trgm_idx` | `(výraz)` |  |
| `company_phone_trgm_idx` | `(výraz)` |  |
| `company_dic_trgm_idx` | `(výraz)` |  |
| `company_street_trgm_idx` | `(výraz)` |  |
| `company_zip_trgm_idx` | `(výraz)` |  |
| `company_web_trgm_idx` | `(výraz)` |  |
| `company_owner_idx` | `owner_id` |  |
| `company_parent_idx` | `parent_company_id` |  |
| `company_custom_idx` | `custom` |  |

## person

Kontaktní osoba, volitelně u firmy.

Definice: `packages/modules/kontakty/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `email` | `text` | ano |  |  |
| `phone` | `text` | ano |  |  |
| `position` | `text` | ano |  |  |
| `role` | `text` | ano |  |  |
| `email_type` | `text` | ano |  |  |
| `phone_type` | `text` | ano |  |  |
| `tags` | `text[]` | ne | `'{}'::text[]` |  |
| `company_id` | `uuid` | ano |  | → company.id (při smazání: no action) |
| `note` | `text` | ano |  |  |
| `owner_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `person_name_trgm_idx` | `(výraz)` |  |
| `person_position_trgm_idx` | `(výraz)` |  |
| `person_email_trgm_idx` | `(výraz)` |  |
| `person_phone_trgm_idx` | `(výraz)` |  |
| `person_company_idx` | `company_id` |  |
| `person_owner_idx` | `owner_id` |  |
| `person_custom_idx` | `custom` |  |

## person_contact_point

Další e-maily a telefony osoby s typem (práce, mobil, domů…). Hlavní e-mail a telefon zůstávají ve sloupcích osoby (`person.email`, `person.phone`) kvůli hledání a kontrole duplicit; tady jsou jen doplňující údaje.

Definice: `packages/modules/kontakty/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `person_id` | `uuid` | ne |  | → person.id (při smazání: no action) |
| `kind` | `text` | ne |  |  |
| `value` | `text` | ne |  |  |
| `label` | `text` | ano |  |  |
| `position` | `integer` | ne | `0` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `person_contact_point_person_idx` | `person_id` |  |
| `person_contact_point_value_idx` | `kind`, `value` |  |

## Migrace

Složka `packages/modules/kontakty/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 3.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×2, ALTER TABLE ×7, CREATE UNIQUE INDEX ×1, CREATE INDEX ×7; tabulky: company, person |
| 1 | `0001_trgm_hledani` | 2026-10-09 | CREATE INDEX ×11; tabulky: company, person |
| 2 | `0002_crm_kontakty` | 2026-10-13 | CREATE TABLE ×1, ALTER TABLE ×11, CREATE INDEX ×3; tabulky: company, person, person_contact_point |
