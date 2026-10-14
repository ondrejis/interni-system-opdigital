# Databáze: Modul Sklad

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/sklad/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Sklad](../moduly/sklad.md). Počet tabulek: 9.

## warehouse

Umístění zásob: sklad, dílna, vozidlo (materiál v dodávce) nebo stavba. Vozidlo a zakázka jsou měkké odkazy.

Definice: `packages/modules/sklad/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `kind` | `text` | ne | `'warehouse'` |  |
| `asset_id` | `uuid` | ano |  |  |
| `job_id` | `uuid` | ano |  |  |
| `responsible_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `active` | `boolean` | ne | `true` |  |
| `note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

## stock_item

Skladová karta. `totalQty` je součet přes všechna umístění a udržuje ho výhradně skladové jádro (`engine.ts`); `avgCost` je vážený průměr nákupní ceny bez DPH v haléřích se 4 desetinnými místy. Odvozené sloupce (`avgCostMinor`, `valueMinor`, `belowMin`) počítá databáze, aby šly filtrovat a sčítat v seznamu.

Definice: `packages/modules/sklad/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `code` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `category` | `text` | ano |  |  |
| `unit` | `text` | ne | `'ks'` |  |
| `ean` | `text` | ano |  |  |
| `min_qty` | `numeric(14, 3)` | ne | `'0'` |  |
| `total_qty` | `numeric(14, 3)` | ne | `'0'` |  |
| `supplier_id` | `uuid` | ano |  | → company.id (při smazání: no action) |
| `last_price_minor` | `bigint` | ano |  |  |
| `avg_cost` | `numeric(16, 4)` | ne | `'0'` |  |
| `avg_cost_minor` | `bigint` | ano |  |  |
| `value_minor` | `bigint` | ano |  |  |
| `below_min` | `boolean` | ano |  |  |
| `vat_rate` | `numeric(5, 2)` | ne | `'21'` |  |
| `note` | `text` | ano |  |  |
| `active` | `boolean` | ne | `true` |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `stock_item_code_uq` | `code` | unikátní, částečný |
| `stock_item_supplier_idx` | `supplier_id` |  |
| `stock_item_name_trgm_idx` | `(výraz)` |  |
| `stock_item_code_trgm_idx` | `(výraz)` |  |
| `stock_item_ean_trgm_idx` | `(výraz)` |  |
| `stock_item_custom_idx` | `custom` |  |

## stock_level

Stav jedné položky na jednom umístění.

Definice: `packages/modules/sklad/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `item_id` | `uuid` | ne |  | PK; → stock_item.id (při smazání: cascade) |
| `warehouse_id` | `uuid` | ne |  | PK; → warehouse.id (při smazání: cascade) |
| `qty` | `numeric(14, 3)` | ne | `'0'` |  |

Složený primární klíč: `item_id`, `warehouse_id`.

## purchase_order

Objednávka u dodavatele. Stav: `draft` → `sent` → `partial` → `received`, nebo `cancelled`.

Definice: `packages/modules/sklad/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `number` | `text` | ne |  |  |
| `supplier_id` | `uuid` | ne |  | → company.id (při smazání: no action) |
| `warehouse_id` | `uuid` | ne |  | → warehouse.id (při smazání: no action) |
| `job_id` | `uuid` | ano |  |  |
| `status` | `text` | ne | `'draft'` |  |
| `date` | `date` | ne |  |  |
| `expected_date` | `date` | ano |  |  |
| `note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `purchase_order_number_uq` | `number` | unikátní |
| `po_supplier_idx` | `supplier_id` |  |

## purchase_order_line

Definice: `packages/modules/sklad/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `order_id` | `uuid` | ne |  | → purchase_order.id (při smazání: cascade) |
| `item_id` | `uuid` | ne |  | → stock_item.id (při smazání: no action) |
| `qty` | `numeric(14, 3)` | ne |  |  |
| `received_qty` | `numeric(14, 3)` | ne | `'0'` |  |
| `unit_price_minor` | `bigint` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `po_line_order_idx` | `order_id` |  |

## stock_count

Inventura jednoho umístění. Stav: `open` → `closed` (rozdíly se zaúčtují inventurním dokladem).

Definice: `packages/modules/sklad/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `number` | `text` | ne |  |  |
| `warehouse_id` | `uuid` | ne |  | → warehouse.id (při smazání: no action) |
| `status` | `text` | ne | `'open'` |  |
| `note` | `text` | ano |  |  |
| `closed_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `stock_count_number_uq` | `number` | unikátní |
| `stock_count_open_uq` | `warehouse_id` | unikátní, částečný |

## stock_count_line

Definice: `packages/modules/sklad/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `count_id` | `uuid` | ne |  | → stock_count.id (při smazání: cascade) |
| `item_id` | `uuid` | ne |  | → stock_item.id (při smazání: no action) |
| `expected_qty` | `numeric(14, 3)` | ne |  |  |
| `counted_qty` | `numeric(14, 3)` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `stock_count_line_count_idx` | `count_id` |  |

## stock_doc

Skladový doklad (neměnný, vzniká jen zaúčtováním). Směr pohybu podle typu: `receipt` + do `warehouseId` · `issue` − z `warehouseId` na zakázku · `transfer` − z `warehouseId`, + do `targetWarehouseId` · `return` + do `warehouseId` ze zakázky · `adjustment` ± ve `warehouseId` (znaménko u řádku). Zakázka je měkký odkaz.

Definice: `packages/modules/sklad/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `number` | `text` | ne |  |  |
| `type` | `text` | ne |  |  |
| `date` | `date` | ne |  |  |
| `warehouse_id` | `uuid` | ne |  | → warehouse.id (při smazání: no action) |
| `target_warehouse_id` | `uuid` | ano |  | → warehouse.id (při smazání: no action) |
| `supplier_id` | `uuid` | ano |  | → company.id (při smazání: no action) |
| `job_id` | `uuid` | ano |  |  |
| `purchase_order_id` | `uuid` | ano |  | → purchase_order.id (při smazání: no action) |
| `count_id` | `uuid` | ano |  | → stock_count.id (při smazání: no action) |
| `supplier_doc_no` | `text` | ano |  |  |
| `note` | `text` | ano |  |  |
| `total_minor` | `bigint` | ne | `0` |  |
| `line_count` | `integer` | ne | `0` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `stock_doc_number_uq` | `number` | unikátní |
| `stock_doc_job_idx` | `job_id` |  |
| `stock_doc_date_idx` | `date` |  |
| `stock_doc_warehouse_idx` | `warehouse_id` |  |

## stock_doc_line

Definice: `packages/modules/sklad/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `doc_id` | `uuid` | ne |  | → stock_doc.id (při smazání: cascade) |
| `item_id` | `uuid` | ne |  | → stock_item.id (při smazání: no action) |
| `qty` | `numeric(14, 3)` | ne |  |  |
| `unit_cost` | `numeric(16, 4)` | ne |  |  |
| `total_minor` | `bigint` | ne |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `stock_doc_line_item_idx` | `item_id` |  |
| `stock_doc_line_doc_idx` | `doc_id` |  |

## Migrace

Složka `packages/modules/sklad/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 2.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×9, ALTER TABLE ×28, CREATE UNIQUE INDEX ×5, CREATE INDEX ×11; tabulky: purchase_order, purchase_order_line, stock_count, stock_count_line, stock_doc, stock_doc_line, stock_item, stock_level, warehouse |
| 1 | `0001_trgm_hledani` | 2026-10-09 | CREATE INDEX ×2; tabulky: stock_item |
