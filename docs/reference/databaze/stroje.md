# Databáze: Modul Stroje a vozidla

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/stroje/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Stroje a vozidla](../moduly/stroje.md). Počet tabulek: 7.

## asset

Vozidlo nebo stroj. Měří se v km (auta) nebo motohodinách (stroje); `meterValue` je poslední známý stav. `internalRateMinor` je interní sazba za km nebo motohodinu, kterou se stroj počítá do nákladů zakázky. Zakázka (v knize jízd, tankování, rezervaci) je měkký odkaz bez cizího klíče, aby modul fungoval i bez Zakázek.

Definice: `packages/modules/stroje/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `kind` | `text` | ne | `'van'` |  |
| `plate` | `text` | ano |  |  |
| `vin` | `text` | ano |  |  |
| `brand` | `text` | ano |  |  |
| `model` | `text` | ano |  |  |
| `year` | `integer` | ano |  |  |
| `fuel` | `text` | ne | `'diesel'` |  |
| `meter` | `text` | ne | `'km'` |  |
| `meter_value` | `numeric(12, 1)` | ne | `'0'` |  |
| `tank_liters` | `integer` | ano |  |  |
| `status` | `text` | ne | `'active'` |  |
| `responsible_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `purchase_date` | `date` | ano |  |  |
| `purchase_price_minor` | `bigint` | ano |  |  |
| `internal_rate_minor` | `bigint` | ano |  |  |
| `stk_date` | `date` | ano |  |  |
| `insurance_date` | `date` | ano |  |  |
| `vignette_date` | `date` | ano |  |  |
| `fuel_card` | `text` | ano |  |  |
| `note` | `text` | ano |  |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `asset_plate_uq` | `plate` | unikátní, částečný |
| `asset_status_idx` | `status` |  |
| `asset_name_trgm_idx` | `(výraz)` |  |
| `asset_custom_idx` | `custom` |  |

## asset_log

Kniha jízd (km) i provoz strojů (motohodiny) v jedné tabulce.

Definice: `packages/modules/stroje/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `asset_id` | `uuid` | ne |  | → asset.id (při smazání: no action) |
| `date` | `date` | ne |  |  |
| `user_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `meter_start` | `numeric(12, 1)` | ano |  |  |
| `meter_end` | `numeric(12, 1)` | ano |  |  |
| `amount` | `numeric(12, 1)` | ne |  |  |
| `route` | `text` | ano |  |  |
| `purpose` | `text` | ano |  |  |
| `job_id` | `uuid` | ano |  |  |
| `private` | `boolean` | ne | `false` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `asset_log_asset_idx` | `asset_id`, `date` |  |
| `asset_log_job_idx` | `job_id` |  |
| `asset_log_user_idx` | `user_id` |  |

## asset_fuel

Definice: `packages/modules/stroje/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `asset_id` | `uuid` | ne |  | → asset.id (při smazání: no action) |
| `date` | `date` | ne |  |  |
| `user_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `liters` | `numeric(10, 2)` | ne |  |  |
| `total_minor` | `bigint` | ne |  |  |
| `vat_rate` | `numeric(5, 2)` | ne | `'21'` |  |
| `meter_value` | `numeric(12, 1)` | ano |  |  |
| `full_tank` | `boolean` | ne | `true` |  |
| `station` | `text` | ano |  |  |
| `payment` | `text` | ne | `'card'` |  |
| `job_id` | `uuid` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `asset_fuel_asset_idx` | `asset_id`, `date` |  |
| `asset_fuel_job_idx` | `job_id` |  |

## asset_interval

Servisní interval: každých X km/mth nebo Y měsíců (co nastane dřív).

Definice: `packages/modules/stroje/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `asset_id` | `uuid` | ne |  | → asset.id (při smazání: no action) |
| `title` | `text` | ne |  |  |
| `every_meter` | `integer` | ano |  |  |
| `every_months` | `integer` | ano |  |  |
| `last_date` | `date` | ano |  |  |
| `last_meter` | `numeric(12, 1)` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `asset_interval_asset_idx` | `asset_id` |  |

## asset_service

Definice: `packages/modules/stroje/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `asset_id` | `uuid` | ne |  | → asset.id (při smazání: no action) |
| `date` | `date` | ne |  |  |
| `kind` | `text` | ne | `'service'` |  |
| `title` | `text` | ne |  |  |
| `vendor` | `text` | ano |  |  |
| `cost_minor` | `bigint` | ne | `0` |  |
| `meter_value` | `numeric(12, 1)` | ano |  |  |
| `interval_id` | `uuid` | ano |  | → asset_interval.id (při smazání: no action) |
| `note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `asset_service_asset_idx` | `asset_id`, `date` |  |

## asset_reservation

Definice: `packages/modules/stroje/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `asset_id` | `uuid` | ne |  | → asset.id (při smazání: no action) |
| `date_from` | `date` | ne |  |  |
| `date_to` | `date` | ne |  |  |
| `job_id` | `uuid` | ano |  |  |
| `user_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `asset_reservation_asset_idx` | `asset_id`, `date_from` |  |
| `asset_reservation_job_idx` | `job_id` |  |

## asset_defect

Závada nahlášená z terénu. Blokující závada stroj odstaví (`asset.status = service`), dokud není vyřešena.

Definice: `packages/modules/stroje/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `asset_id` | `uuid` | ne |  | → asset.id (při smazání: no action) |
| `title` | `text` | ne |  |  |
| `description` | `text` | ano |  |  |
| `severity` | `text` | ne | `'normal'` |  |
| `status` | `text` | ne | `'open'` |  |
| `reported_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `task_id` | `uuid` | ano |  | → task.id (při smazání: no action) |
| `resolution` | `text` | ano |  |  |
| `resolved_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `asset_defect_asset_idx` | `asset_id`, `status` |  |
| `asset_defect_status_idx` | `status` |  |

## Migrace

Složka `packages/modules/stroje/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×7, ALTER TABLE ×27, CREATE UNIQUE INDEX ×1, CREATE INDEX ×14; tabulky: asset, asset_defect, asset_fuel, asset_interval, asset_log, asset_reservation, asset_service |
