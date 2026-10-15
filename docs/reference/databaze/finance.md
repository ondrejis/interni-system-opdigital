# Databáze: Modul Finance

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/finance/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Finance](../moduly/finance.md). Počet tabulek: 5.

## retainer

Retainer zakázky: opakovaná měsíční platba s dnem vystavení (1–28) a fakturujícím (pevný, nebo střídavý). Měsíce jsou `YYYY-MM`. Platby z něj generuje úloha `finance.retainer.generate` (idempotentně podle `payment_retainer_month_uq`).

Definice: `packages/modules/finance/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  |  |
| `amount_minor` | `bigint` | ne |  |  |
| `from_month` | `text` | ne |  |  |
| `to_month` | `text` | ano |  |  |
| `issue_day` | `integer` | ne | `1` |  |
| `issuer_mode` | `text` | ne | `'fixed'` | hodnoty: fixed, alternate |
| `issuer_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `first_issuer_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `active` | `boolean` | ne | `true` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `retainer_job_idx` | `job_id` |  |
| `retainer_active_idx` | `from_month` | částečný |

Kontrolní omezení: `retainer_amount_chk`, `retainer_issue_day_chk`, `retainer_from_month_chk`.

## payment

Platba (plánovaná, vystavená, zaplacená, zrušená). `job_id` je prázdné jen u plateb z Fakturoidu (`kind = recurring`, R-12): taková platba je vždy soukromá a mimo saldo. Viditelnost: dědí od zakázky a smí mít vlastní zámek. Měsíční retainer platba je v zakázce jedna na měsíc.

Definice: `packages/modules/finance/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ano |  |  |
| `company_id` | `uuid` | ano |  |  |
| `description` | `text` | ne |  |  |
| `kind` | `text` | ne | `'one_off'` | hodnoty: one_off, intro, retainer, extra, recurring |
| `period_month` | `text` | ano |  |  |
| `amount_minor` | `bigint` | ne |  |  |
| `issuer_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `status` | `text` | ne | `'planned'` | hodnoty: planned, issued, paid, canceled |
| `invoice_number` | `text` | ano |  |  |
| `invoice_url` | `text` | ano |  |  |
| `issued_on` | `date` | ano |  |  |
| `due_on` | `date` | ano |  |  |
| `paid_on` | `date` | ano |  |  |
| `allocation_mode` | `text` | ne | `'rules'` | hodnoty: rules, manual |
| `source` | `text` | ne | `'manual'` | hodnoty: manual, template, retainer, fakturoid |
| `retainer_id` | `uuid` | ano |  | → retainer.id (při smazání: no action) |
| `note` | `text` | ano |  |  |
| `is_private` | `boolean` | ne | `false` |  |
| `visibility_source` | `text` | ne | `'own'` | hodnoty: own, inherited |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `payment_retainer_month_uq` | `job_id`, `retainer_id`, `period_month` | unikátní, částečný |
| `payment_job_idx` | `job_id`, `status` | částečný |
| `payment_company_idx` | `company_id` | částečný |
| `payment_status_due_idx` | `status`, `due_on` |  |
| `payment_paid_idx` | `paid_on` | částečný |
| `payment_issued_idx` | `issued_on` | částečný |
| `payment_issuer_idx` | `issuer_id` |  |
| `payment_description_trgm_idx` | `(výraz)` |  |
| `payment_invoice_number_trgm_idx` | `(výraz)` |  |
| `payment_private_idx` | `is_private` | částečný |

Kontrolní omezení: `payment_amount_chk`, `payment_period_month_chk`.

## payment_allocation

Podíl uživatele na platbě v haléřích; součet podílů se rovná částce platby. Dědí viditelnost platby.

Definice: `packages/modules/finance/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `payment_id` | `uuid` | ne |  | PK; → payment.id (při smazání: no action) |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: no action) |
| `amount_minor` | `bigint` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `payment_allocation_user_idx` | `user_id` |  |

Složený primární klíč: `payment_id`, `user_id`.

Kontrolní omezení: `payment_allocation_amount_chk`.

## split_rule

Pravidlo rozdělení plateb zakázky mezi lidi: procenta, pevná částka za platbu, nebo pevná celková částka; platí pro všechny druhy plateb nebo jen pro jeden, od–do měsíce (`YYYY-MM`). Pořadí určuje `position`.

Definice: `packages/modules/finance/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  |  |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `mode` | `text` | ne |  | hodnoty: percent, fixed_per_payment, fixed_total |
| `percent` | `numeric(5, 2)` | ano |  |  |
| `fixed_minor` | `bigint` | ano |  |  |
| `applies_to` | `text` | ne | `'all'` | hodnoty: all, one_off, intro, retainer, extra, recurring |
| `valid_from_month` | `text` | ano |  |  |
| `valid_to_month` | `text` | ano |  |  |
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
| `split_rule_job_idx` | `job_id`, `position` |  |
| `split_rule_user_idx` | `user_id` |  |

Kontrolní omezení: `split_rule_percent_chk`, `split_rule_fixed_chk`.

## settlement

Vyrovnání mezi partnery (ruční záznam, že jeden druhému zaplatil nebo zafakturoval): kdo, komu, kolik, kdy, jak. Storno vyplní `canceled_at` (záznam se nemaže). Počítá se jen se sdílenými zakázkami.

Definice: `packages/modules/finance/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `from_user_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `to_user_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `amount_minor` | `bigint` | ne |  |  |
| `settled_on` | `date` | ne |  |  |
| `method` | `text` | ne |  | hodnoty: invoice, transfer, offset |
| `reference` | `text` | ano |  |  |
| `note` | `text` | ano |  |  |
| `canceled_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `settlement_date_idx` | `settled_on` |  |
| `settlement_users_idx` | `from_user_id`, `to_user_id` |  |

Kontrolní omezení: `settlement_amount_chk`, `settlement_users_chk`.

## Migrace

Složka `packages/modules/finance/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×5, ALTER TABLE ×24, CREATE UNIQUE INDEX ×1, CREATE INDEX ×16; tabulky: payment, payment_allocation, retainer, settlement, split_rule |
