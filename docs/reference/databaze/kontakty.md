# Databáze: Modul Organizace a kontakty

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/kontakty/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Organizace a kontakty](../moduly/kontakty.md). Počet tabulek: 5.

## company

Organizace. Klient je organizace se `client_status` (ne samostatná entita). IČO je mezi živými záznamy unikátní. Viditelnost: kořen s vlastním zámkem (soukromá organizace nedědí do obchodů ani zakázek, R-31). `drive_*` píše jen modul Disk, `last_activity_at` modul Úkoly (oboje přes `writeSystemFields`).

Definice: `packages/modules/kontakty/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `official_name` | `text` | ano |  |  |
| `ico` | `text` | ano |  |  |
| `dic` | `text` | ano |  |  |
| `legal_form` | `text` | ano |  |  |
| `street` | `text` | ano |  |  |
| `city` | `text` | ano |  |  |
| `zip` | `text` | ano |  |  |
| `country` | `text` | ne | `'CZ'` |  |
| `web` | `text` | ano |  |  |
| `web_domain` | `text` | ano |  |  |
| `email` | `text` | ano |  |  |
| `phone` | `text` | ano |  |  |
| `industry` | `text` | ano |  |  |
| `owner_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `client_status` | `text` | ano |  | hodnoty: lead, active, paused, former |
| `client_since` | `date` | ano |  |  |
| `client_until` | `date` | ano |  |  |
| `client_end_reason` | `text` | ano |  |  |
| `services` | `text[]` | ne | `'{}'::text[]` |  |
| `client_context` | `jsonb` | ne | `'{}'::jsonb` |  |
| `drive_folder_id` | `text` | ano |  |  |
| `drive_status` | `text` | ne | `'none'` | hodnoty: none, pending, ready, error, timeout |
| `ares_synced_at` | `timestamp with time zone` | ano |  |  |
| `last_activity_at` | `timestamp with time zone` | ano |  |  |
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
| `company_ico_uq` | `ico` | unikátní, částečný |
| `company_name_trgm_idx` | `(výraz)` |  |
| `company_official_name_trgm_idx` | `(výraz)` |  |
| `company_ico_trgm_idx` | `(výraz)` |  |
| `company_city_trgm_idx` | `(výraz)` |  |
| `company_email_trgm_idx` | `(výraz)` |  |
| `company_phone_trgm_idx` | `(výraz)` |  |
| `company_web_domain_trgm_idx` | `(výraz)` |  |
| `company_web_domain_idx` | `web_domain` | částečný |
| `company_owner_idx` | `owner_id` |  |
| `company_client_status_idx` | `client_status` | částečný |
| `company_services_idx` | `services` |  |
| `company_tags_idx` | `tags` |  |
| `company_custom_idx` | `custom` |  |
| `company_private_idx` | `is_private` | částečný |

## person

Kontaktní osoba. Jméno se skládá ze `first_name` a `last_name` (`full_name` je generovaný sloupec pro název záznamu, hledání a řazení). E-maily a telefony jsou v `person_contact_point`; hlavní firma je `primary_company_id`, další firmy jsou v `person_company`.

Definice: `packages/modules/kontakty/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `first_name` | `text` | ano |  |  |
| `last_name` | `text` | ne |  |  |
| `full_name` | `text` | ano |  |  |
| `position` | `text` | ano |  |  |
| `primary_company_id` | `uuid` | ano |  | → company.id (při smazání: no action) |
| `linkedin` | `text` | ano |  |  |
| `is_decision_maker` | `boolean` | ne | `false` |  |
| `primary_email` | `text` | ano |  |  |
| `primary_phone` | `text` | ano |  |  |
| `last_activity_at` | `timestamp with time zone` | ano |  |  |
| `owner_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
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
| `person_full_name_trgm_idx` | `(výraz)` |  |
| `person_position_trgm_idx` | `(výraz)` |  |
| `person_primary_email_trgm_idx` | `(výraz)` |  |
| `person_primary_phone_trgm_idx` | `(výraz)` |  |
| `person_primary_company_idx` | `primary_company_id` |  |
| `person_owner_idx` | `owner_id` |  |
| `person_decision_idx` | `primary_company_id` | částečný |
| `person_tags_idx` | `tags` |  |
| `person_custom_idx` | `custom` |  |
| `person_private_idx` | `is_private` | částečný |

Kontrolní omezení: `person_last_name_chk`.

## person_contact_point

E-mail nebo telefon osoby se štítkem. `value_norm` je normalizovaná hodnota pro porovnání a hledání (e-mail malými písmeny, telefon v E.164). Duplicity mezi osobami se jen hlásí (KON-03), unikátní je údaj jen u jedné osoby a jen jeden údaj daného druhu je hlavní.

Definice: `packages/modules/kontakty/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `person_id` | `uuid` | ne |  | → person.id (při smazání: no action) |
| `kind` | `text` | ne |  | hodnoty: email, phone |
| `value` | `text` | ne |  |  |
| `value_norm` | `text` | ne |  |  |
| `label` | `text` | ano |  | hodnoty: work, mobile, private |
| `is_primary` | `boolean` | ne | `false` |  |
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
| `person_contact_point_person_idx` | `person_id` |  |
| `person_contact_point_norm_idx` | `kind`, `value_norm` |  |
| `person_contact_point_norm_trgm_idx` | `(výraz)` |  |
| `person_contact_point_value_uq` | `person_id`, `kind`, `value_norm` | unikátní, částečný |
| `person_contact_point_primary_uq` | `person_id`, `kind` | unikátní, částečný |

## person_company

Další organizace osoby (kromě hlavní, ta je v `person.primary_company_id`) s rolí a pozicí v nich. `is_primary` je vždy `false`; hlavní firma se do této tabulky nezapisuje (dotazy čtou obě místa).

Definice: `packages/modules/kontakty/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `person_id` | `uuid` | ne |  | → person.id (při smazání: no action) |
| `company_id` | `uuid` | ne |  | → company.id (při smazání: no action) |
| `role` | `text` | ano |  |  |
| `position` | `text` | ano |  |  |
| `is_primary` | `boolean` | ne | `false` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `person_company_uq` | `person_id`, `company_id` | unikátní, částečný |
| `person_company_company_idx` | `company_id` |  |

## ares_cache

Cache odpovědí ARES podle IČO (24 h, ORG-04); technická tabulka bez soft-delete.

Definice: `packages/modules/kontakty/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `ico` | `text` | ne |  | PK |
| `payload` | `jsonb` | ne |  |  |
| `fetched_at` | `timestamp with time zone` | ne | `now()` |  |

## Migrace

Složka `packages/modules/kontakty/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 2.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×5, ALTER TABLE ×18, CREATE UNIQUE INDEX ×4, CREATE INDEX ×26; tabulky: ares_cache, company, person, person_company, person_contact_point |
| 1 | `0001_worthless_bullseye` | 2026-10-14 | ALTER TABLE ×3, CREATE INDEX ×2; tabulky: person |
