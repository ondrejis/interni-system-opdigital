# Databáze: Modul Fakturace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/fakturace/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Fakturace](../moduly/fakturace.md). Počet tabulek: 6.

## invoice

Faktura. Koncept nemá číslo (přidělí se při vystavení, aby v řadě nevznikaly díry). Stav: `draft` → `issued` → `partial` (část uhrazena) → `paid`; `credited` = zrušeno dobropisem. Součty jsou v haléřích a počítají se při uložení z položek.

Definice: `packages/modules/fakturace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `number` | `text` | ano |  |  |
| `title` | `text` | ne | `''` |  |
| `kind` | `text` | ne |  |  |
| `state` | `text` | ne | `'draft'` |  |
| `job_id` | `uuid` | ano |  | → job.id (při smazání: no action) |
| `company_id` | `uuid` | ne |  | → company.id (při smazání: no action) |
| `person_id` | `uuid` | ano |  | → person.id (při smazání: no action) |
| `issue_date` | `date` | ano |  |  |
| `taxable_date` | `date` | ano |  |  |
| `due_date` | `date` | ano |  |  |
| `currency` | `text` | ne | `'CZK'` |  |
| `variable_symbol` | `text` | ano |  |  |
| `note` | `text` | ano |  |  |
| `net_minor` | `bigint` | ne | `0` |  |
| `vat_minor` | `bigint` | ne | `0` |  |
| `gross_minor` | `bigint` | ne | `0` |  |
| `paid_minor` | `bigint` | ne | `0` |  |
| `overdue` | `boolean` | ne | `false` |  |
| `original_invoice_id` | `uuid` | ano |  | → invoice.id (při smazání: no action) |
| `supplier` | `jsonb` | ano |  |  |
| `customer` | `jsonb` | ano |  |  |
| `issued_at` | `date` | ano |  |  |
| `vat_mode` | `text` | ne | `'standard'` |  |
| `retention_minor` | `bigint` | ne | `0` |  |
| `statement_id` | `uuid` | ano |  |  |
| `locked_at` | `timestamp with time zone` | ano |  |  |
| `sent_on` | `date` | ano |  |  |
| `reminder_count` | `integer` | ne | `0` |  |
| `last_reminder_on` | `date` | ano |  |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `invoice_number_uq` | `number` | unikátní, částečný |
| `invoice_job_idx` | `job_id` |  |
| `invoice_company_idx` | `company_id` |  |
| `invoice_state_idx` | `state` |  |
| `invoice_due_idx` | `due_date` |  |
| `invoice_custom_idx` | `custom` |  |
| `invoice_title_trgm_idx` | `(výraz)` |  |
| `invoice_number_trgm_idx` | `(výraz)` |  |
| `invoice_variable_symbol_trgm_idx` | `(výraz)` |  |

## invoice_line

Definice: `packages/modules/fakturace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `invoice_id` | `uuid` | ne |  | → invoice.id (při smazání: no action) |
| `position` | `integer` | ne | `0` |  |
| `description` | `text` | ne |  |  |
| `quantity` | `numeric(14, 3)` | ne | `'1'` |  |
| `unit` | `text` | ne | `'ks'` |  |
| `unit_price_minor` | `bigint` | ne | `0` |  |
| `vat_rate_bp` | `integer` | ne | `2100` |  |
| `net_minor` | `bigint` | ne | `0` |  |
| `vat_minor` | `bigint` | ne | `0` |  |
| `gross_minor` | `bigint` | ne | `0` |  |
| `budget_item_id` | `uuid` | ano |  |  |
| `role` | `text` | ne | `'work'` |  |
| `ref_invoice_id` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `invoice_line_invoice_idx` | `invoice_id`, `position` |  |
| `invoice_line_ref_idx` | `ref_invoice_id` |  |

## payment

Úhrada faktury; částečné úhrady jsou povolené.

Definice: `packages/modules/fakturace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `invoice_id` | `uuid` | ne |  | → invoice.id (při smazání: no action) |
| `date` | `date` | ne |  |  |
| `amount_minor` | `bigint` | ne |  |  |
| `method` | `text` | ano |  |  |
| `note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `payment_invoice_idx` | `invoice_id`, `date` |  |

## invoice_dispatch

Evidence odeslání vydané faktury e-mailem (doklad nebo upomínka). Tělo zprávy se neukládá (jen předmět); stav doručení do SMTP drží `email_log` (měkký odkaz `emailLogId`) a zrcadlí se sem úlohou i při čtení.

Definice: `packages/modules/fakturace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `invoice_id` | `uuid` | ne |  | → invoice.id (při smazání: no action) |
| `kind` | `text` | ne |  |  |
| `to_email` | `text` | ne |  |  |
| `cc` | `jsonb` | ne | `'[]'::jsonb` |  |
| `subject` | `text` | ne |  |  |
| `email_log_id` | `uuid` | ano |  |  |
| `status` | `text` | ne | `'queued'` |  |
| `error` | `text` | ano |  |  |
| `sent_by` | `uuid` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `sent_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `invoice_dispatch_invoice_idx` | `invoice_id`, `created_at` |  |
| `invoice_dispatch_pending_idx` | `status` | částečný |

## received_invoice

Přijatá (nákladová) faktura od dodavatele. Rozpadá se na řádky s oddílem rozpočtu zakázky, tím vstupuje do skutečných nákladů (poskytovatel nákladů fakturace). Schválená faktura je zamčená; úprava = vrátit do konceptu.

Definice: `packages/modules/fakturace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `number` | `text` | ne |  |  |
| `job_id` | `uuid` | ano |  | → job.id (při smazání: no action) |
| `supplier_id` | `uuid` | ano |  | → company.id (při smazání: no action) |
| `supplier` | `jsonb` | ano |  |  |
| `variable_symbol` | `text` | ano |  |  |
| `constant_symbol` | `text` | ano |  |  |
| `order_id` | `uuid` | ano |  |  |
| `issue_date` | `date` | ano |  |  |
| `taxable_date` | `date` | ano |  |  |
| `due_date` | `date` | ano |  |  |
| `received_date` | `date` | ano |  |  |
| `currency` | `text` | ne | `'CZK'` |  |
| `net_minor` | `bigint` | ne | `0` |  |
| `vat_minor` | `bigint` | ne | `0` |  |
| `gross_minor` | `bigint` | ne | `0` |  |
| `paid_minor` | `bigint` | ne | `0` |  |
| `paid_date` | `date` | ano |  |  |
| `state` | `text` | ne | `'draft'` |  |
| `vat_mode` | `text` | ne | `'standard'` |  |
| `file_id` | `uuid` | ano |  |  |
| `note` | `text` | ano |  |  |
| `locked_at` | `timestamp with time zone` | ano |  |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `received_invoice_job_idx` | `job_id` |  |
| `received_invoice_supplier_idx` | `supplier_id` |  |
| `received_invoice_state_idx` | `state` |  |
| `received_invoice_number_trgm_idx` | `(výraz)` |  |
| `received_invoice_variable_symbol_trgm_idx` | `(výraz)` |  |
| `received_invoice_dup_uq` | `supplier_id`, `(výraz)` | unikátní, částečný |

## received_invoice_line

Řádek přijaté faktury rozpadnutý na oddíl rozpočtu (a případně položku) zakázky.

Definice: `packages/modules/fakturace/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `invoice_id` | `uuid` | ne |  | → received_invoice.id (při smazání: no action) |
| `position` | `integer` | ne | `0` |  |
| `description` | `text` | ne |  |  |
| `section_id` | `uuid` | ano |  |  |
| `item_id` | `uuid` | ano |  |  |
| `category` | `text` | ne | `'other'` |  |
| `net_minor` | `bigint` | ne | `0` |  |
| `vat_rate_bp` | `integer` | ne | `2100` |  |
| `vat_minor` | `bigint` | ne | `0` |  |
| `gross_minor` | `bigint` | ne | `0` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `received_invoice_line_invoice_idx` | `invoice_id`, `position` |  |

## Migrace

Složka `packages/modules/fakturace/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 6.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×3, ALTER TABLE ×10, CREATE UNIQUE INDEX ×1, CREATE INDEX ×7; tabulky: invoice, invoice_line, payment |
| 1 | `0001_prijate_faktury_zadrzne` | 2026-10-09 | CREATE TABLE ×2, ALTER TABLE ×10, CREATE INDEX ×4; tabulky: invoice, invoice_line, received_invoice, received_invoice_line |
| 2 | `0002_radky_role_zadrzne` | 2026-10-09 | ALTER TABLE ×2, CREATE INDEX ×1; tabulky: invoice_line |
| 3 | `0003_received_duplicate` | 2026-10-09 | CREATE UNIQUE INDEX ×1; tabulky: received_invoice |
| 4 | `0004_odeslani_faktur` | 2026-10-09 | CREATE TABLE ×1, ALTER TABLE ×4, CREATE INDEX ×2; tabulky: invoice, invoice_dispatch |
| 5 | `0005_trgm_hledani` | 2026-10-09 | CREATE INDEX ×5; tabulky: invoice, received_invoice |
