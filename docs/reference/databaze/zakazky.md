# Databáze: Modul Zakázky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/zakazky/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Zakázky](../moduly/zakazky.md). Počet tabulek: 21.

## job

Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `number` | `text` | ne |  |  |
| `title` | `text` | ne |  |  |
| `company_id` | `uuid` | ne |  | → company.id (při smazání: no action) |
| `person_id` | `uuid` | ano |  | → person.id (při smazání: no action) |
| `stage_id` | `uuid` | ne |  | → pipeline_stage.id (při smazání: no action) |
| `value_minor` | `bigint` | ne | `0` |  |
| `currency` | `text` | ne | `'CZK'` |  |
| `address` | `text` | ano |  |  |
| `start_date` | `date` | ano |  |  |
| `end_date` | `date` | ano |  |  |
| `manager_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `description` | `text` | ano |  |  |
| `phase` | `text` | ne | `'preparation'` |  |
| `phase_changed_at` | `timestamp with time zone` | ano |  |  |
| `paused_from` | `text` | ano |  |  |
| `lost_reason` | `text` | ano |  |  |
| `won_at` | `date` | ano |  |  |
| `handover_at` | `date` | ano |  |  |
| `closed_at` | `date` | ano |  |  |
| `vat_mode` | `text` | ne | `'standard'` |  |
| `retention_bp` | `integer` | ne | `0` |  |
| `warranty_months` | `integer` | ano |  |  |
| `warranty_until` | `date` | ano |  |  |
| `site_lat` | `numeric(9, 6)` | ano |  |  |
| `site_lng` | `numeric(9, 6)` | ano |  |  |
| `color` | `text` | ano |  |  |
| `source_inquiry_id` | `uuid` | ano |  |  |
| `template_id` | `uuid` | ano |  |  |
| `sum_contract_minor` | `bigint` | ne | `0` |  |
| `sum_planned_cost_minor` | `bigint` | ne | `0` |  |
| `sum_cost_minor` | `bigint` | ne | `0` |  |
| `sum_invoiced_minor` | `bigint` | ne | `0` |  |
| `sum_paid_minor` | `bigint` | ne | `0` |  |
| `sum_margin_pct` | `numeric(7, 1)` | ano |  |  |
| `sum_drawdown_pct` | `numeric(7, 1)` | ano |  |  |
| `sum_health` | `text` | ano |  |  |
| `sum_unpaired_count` | `integer` | ne | `0` |  |
| `sum_at` | `timestamp with time zone` | ano |  |  |
| `expected_close_date` | `date` | ano |  |  |
| `crm_probability_pct` | `smallint` | ano |  |  |
| `crm_source` | `text` | ano |  |  |
| `crm_source_channel` | `text` | ano |  |  |
| `crm_campaign` | `text` | ano |  |  |
| `site_city` | `text` | ano |  |  |
| `crm_stage_entered_at` | `timestamp with time zone` | ano |  |  |
| `crm_next_activity_at` | `timestamp with time zone` | ano |  |  |
| `crm_last_activity_at` | `timestamp with time zone` | ano |  |  |
| `crm_open_activities` | `integer` | ne | `0` |  |
| `crm_overdue_activities` | `integer` | ne | `0` |  |
| `crm_rotting` | `boolean` | ne | `false` |  |
| `crm_weighted_minor` | `bigint` | ne | `0` |  |
| `crm_archived_at` | `timestamp with time zone` | ano |  |  |
| `crm_lost_note` | `text` | ano |  |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_number_uq` | `number` | unikátní |
| `job_phase_idx` | `phase` |  |
| `job_company_idx` | `company_id` |  |
| `job_stage_idx` | `stage_id` |  |
| `job_manager_idx` | `manager_id` |  |
| `job_crm_close_idx` | `expected_close_date` |  |
| `job_crm_next_activity_idx` | `crm_next_activity_at` |  |
| `job_title_trgm_idx` | `(výraz)` |  |
| `job_number_trgm_idx` | `(výraz)` |  |
| `job_address_trgm_idx` | `(výraz)` |  |
| `job_custom_idx` | `custom` |  |

## job_member

Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `job_id` | `uuid` | ne |  | PK; → job.id (při smazání: cascade) |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: no action) |
| `role` | `text` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_member_user_idx` | `user_id` |  |

Složený primární klíč: `job_id`, `user_id`.

## job_stage_history

Historie stavů zakázky: jeden řádek na pobyt ve stavu (`left_at` je prázdné u aktuálního). Zapisuje ji změna stavu (`lifecycle/history.ts`); z ní se počítají dny ve stavu (pás fází), konverze a rychlost obchodu.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `stage_id` | `uuid` | ne |  | → pipeline_stage.id (při smazání: no action) |
| `phase` | `text` | ano |  |  |
| `entered_at` | `timestamp with time zone` | ne | `now()` |  |
| `left_at` | `timestamp with time zone` | ano |  |  |
| `changed_by` | `uuid` | ano |  | → user.id (při smazání: no action) |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_stage_history_job_idx` | `job_id`, `entered_at` |  |
| `job_stage_history_stage_idx` | `stage_id` |  |

## job_participant

Další lidé na zakázce kromě hlavní kontaktní osoby (investor, TDI, projektant…), s rolí na zakázce.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: cascade) |
| `person_id` | `uuid` | ne |  | → person.id (při smazání: no action) |
| `role` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_participant_uq` | `job_id`, `person_id` | unikátní, částečný |
| `job_participant_person_idx` | `person_id` |  |

## job_cost

Ruční náklad zakázky (nákup bez skladu, subdodávka, kontejner…). Automatické náklady dodávají jiné moduly.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `date` | `date` | ne |  |  |
| `category` | `text` | ne |  |  |
| `title` | `text` | ne |  |  |
| `supplier_id` | `uuid` | ano |  | → company.id (při smazání: no action) |
| `supplier_name` | `text` | ano |  |  |
| `amount_minor` | `bigint` | ne |  |  |
| `section_id` | `uuid` | ano |  |  |
| `item_id` | `uuid` | ano |  |  |
| `order_id` | `uuid` | ano |  |  |
| `source` | `text` | ano |  |  |
| `source_ref` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_cost_job_idx` | `job_id`, `date` |  |
| `job_cost_source_idx` | `source`, `source_ref` |  |
| `job_cost_section_idx` | `section_id` |  |

## job_change

Vícepráce (kladná částka) a méněpráce (záporná). Schválená položka je součástí ceny zakázky a nejde měnit.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `number` | `integer` | ne |  |  |
| `title` | `text` | ne |  |  |
| `description` | `text` | ano |  |  |
| `amount_minor` | `bigint` | ne |  |  |
| `status` | `text` | ne | `'draft'` |  |
| `decided_at` | `date` | ano |  |  |
| `decided_by` | `text` | ano |  |  |
| `object_id` | `uuid` | ano |  |  |
| `reason` | `text` | ano |  |  |
| `cost_impact_minor` | `bigint` | ne | `0` |  |
| `applied_at` | `timestamp with time zone` | ano |  |  |
| `locked_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_change_number_uq` | `job_id`, `number` | unikátní |

## job_change_line

Řádek změny (ZBV): nová položka, změna množství nebo odebrání existující. Schválením se propíše do rozpočtu realizační verze (viz `budget_item`), původní hodnoty položky zůstanou.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `change_id` | `uuid` | ne |  | → job_change.id (při smazání: no action) |
| `position` | `integer` | ne | `0` |  |
| `kind` | `text` | ne |  |  |
| `item_id` | `uuid` | ano |  |  |
| `section_id` | `uuid` | ano |  |  |
| `title` | `text` | ne |  |  |
| `unit` | `text` | ne | `'ks'` |  |
| `item_kind` | `text` | ne | `'other'` |  |
| `quantity_before` | `numeric(14, 3)` | ne | `'0'` |  |
| `quantity_after` | `numeric(14, 3)` | ne | `'0'` |  |
| `unit_cost_minor` | `bigint` | ne | `0` |  |
| `unit_price_minor` | `bigint` | ne | `0` |  |
| `vat_rate_bp` | `integer` | ne | `2100` |  |
| `price_impact_minor` | `bigint` | ne | `0` |  |
| `cost_impact_minor` | `bigint` | ne | `0` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_change_line_change_idx` | `change_id`, `position` |  |

## budget_version

Verze rozpočtu zakázky. `offer` je nabídka zákazníkovi, `realization` pracovní rozpočet realizace. Vyhraná nabídka se zamkne a zkopíruje do realizační verze (původní hodnoty položek se uloží).

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `kind` | `text` | ne |  |  |
| `number` | `integer` | ne | `1` |  |
| `title` | `text` | ano |  |  |
| `status` | `text` | ne | `'draft'` |  |
| `locked_at` | `timestamp with time zone` | ano |  |  |
| `locked_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `source_version_id` | `uuid` | ano |  |  |
| `note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `budget_version_uq` | `job_id`, `kind`, `number` | unikátní |

## budget_object

Stavební objekt (SO 01 …). Každá verze má skrytý výchozí objekt „Celá zakázka“ (`isDefault`).

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `version_id` | `uuid` | ne |  | → budget_version.id (při smazání: no action) |
| `code` | `text` | ano |  |  |
| `title` | `text` | ne |  |  |
| `is_default` | `boolean` | ne | `false` |  |
| `responsible_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `position` | `integer` | ne | `0` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `budget_object_version_idx` | `version_id`, `position` |  |

## budget_section

Oddíl rozpočtu (Elektro, Zemní práce, ZTI …); může mít nadřazený oddíl, takže jde o strom.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `version_id` | `uuid` | ne |  | → budget_version.id (při smazání: no action) |
| `object_id` | `uuid` | ne |  | → budget_object.id (při smazání: no action) |
| `parent_id` | `uuid` | ano |  |  |
| `code` | `text` | ano |  |  |
| `title` | `text` | ne |  |  |
| `position` | `integer` | ne | `0` |  |
| `cost_category` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `budget_section_version_idx` | `version_id`, `position` |  |
| `budget_section_object_idx` | `object_id` |  |

## budget_item

Položka rozpočtu. Má nákladovou i prodejní jednotkovou cenu (marže). `original*` se uloží při zamčení verze a už se nemění, takže je vidět „původní → aktuální“ po schválených změnách.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `version_id` | `uuid` | ne |  | → budget_version.id (při smazání: no action) |
| `section_id` | `uuid` | ne |  | → budget_section.id (při smazání: no action) |
| `position` | `integer` | ne | `0` |  |
| `code` | `text` | ano |  |  |
| `title` | `text` | ne |  |  |
| `kind` | `text` | ne | `'other'` |  |
| `unit` | `text` | ne | `'ks'` |  |
| `quantity` | `numeric(14, 3)` | ne | `'1'` |  |
| `unit_cost_minor` | `bigint` | ne | `0` |  |
| `unit_price_minor` | `bigint` | ne | `0` |  |
| `vat_rate_bp` | `integer` | ne | `2100` |  |
| `start_date` | `date` | ano |  |  |
| `end_date` | `date` | ano |  |  |
| `spec` | `text` | ano |  |  |
| `note` | `text` | ano |  |  |
| `original_quantity` | `numeric(14, 3)` | ano |  |  |
| `original_unit_cost_minor` | `bigint` | ano |  |  |
| `original_unit_price_minor` | `bigint` | ano |  |  |
| `change_id` | `uuid` | ano |  |  |
| `catalog_item_id` | `uuid` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `budget_item_section_idx` | `section_id`, `position` |  |
| `budget_item_version_idx` | `version_id` |  |

## budget_calc_line

Řádek výkazu výměr u položky: proměnná, popis, vzorec a výsledek; množství položky = součet výsledků.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `item_id` | `uuid` | ne |  | → budget_item.id (při smazání: no action) |
| `position` | `integer` | ne | `0` |  |
| `variable` | `text` | ano |  |  |
| `description` | `text` | ano |  |  |
| `formula` | `text` | ne | `''` |  |
| `result` | `numeric(14, 3)` | ne | `'0'` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `budget_calc_line_item_idx` | `item_id`, `position` |  |

## cost_allocation

Přiřazení automatického nákladu (docházka, sklad, stroje, přijatá faktura, deník) k oddílu a položce rozpočtu. Samotný náklad zůstává ve svém modulu (poskytovatel nákladů ho vrací živě s `source` a `ref`); tady je jen párování. Náklad bez řádku zde je „nespárovaný“ a ukáže se jako úkol k doplnění.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `source` | `text` | ne |  |  |
| `source_ref` | `text` | ne |  |  |
| `section_id` | `uuid` | ne |  | → budget_section.id (při smazání: no action) |
| `item_id` | `uuid` | ano |  |  |
| `amount_minor` | `bigint` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `cost_allocation_job_idx` | `job_id` |  |
| `cost_allocation_source_idx` | `source`, `source_ref` |  |

## work_statement

Soupis provedených prací za období (a stavební objekt): podklad pro dílčí fakturu zákazníkovi.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `object_id` | `uuid` | ano |  |  |
| `number` | `integer` | ne |  |  |
| `period_from` | `date` | ne |  |  |
| `period_to` | `date` | ne |  |  |
| `status` | `text` | ne | `'draft'` |  |
| `claimed_minor` | `bigint` | ne | `0` |  |
| `approved_minor` | `bigint` | ne | `0` |  |
| `decided_at` | `timestamp with time zone` | ano |  |  |
| `decided_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `invoice_id` | `uuid` | ano |  |  |
| `note` | `text` | ano |  |  |
| `locked_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `work_statement_number_uq` | `job_id`, `number` | unikátní |

## work_statement_line

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `statement_id` | `uuid` | ne |  | → work_statement.id (při smazání: no action) |
| `item_id` | `uuid` | ne |  | → budget_item.id (při smazání: no action) |
| `position` | `integer` | ne | `0` |  |
| `quantity_period` | `numeric(14, 3)` | ne | `'0'` |  |
| `quantity_total` | `numeric(14, 3)` | ne | `'0'` |  |
| `amount_period_minor` | `bigint` | ne | `0` |  |
| `amount_total_minor` | `bigint` | ne | `0` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `work_statement_line_statement_idx` | `statement_id`, `position` |  |

## job_order

Objednávka dodavateli na zakázku (materiál, subdodávka). Po schválení se zamkne. Skladové objednávky řeší modul Sklad.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `number` | `text` | ne |  |  |
| `title` | `text` | ne |  |  |
| `supplier_id` | `uuid` | ano |  | → company.id (při smazání: no action) |
| `supplier_name` | `text` | ano |  |  |
| `order_date` | `date` | ano |  |  |
| `delivery_date` | `date` | ano |  |  |
| `section_id` | `uuid` | ano |  |  |
| `status` | `text` | ne | `'draft'` |  |
| `total_minor` | `bigint` | ne | `0` |  |
| `note` | `text` | ano |  |  |
| `locked_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_order_number_uq` | `number` | unikátní |
| `job_order_job_idx` | `job_id` |  |

## job_order_line

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `order_id` | `uuid` | ne |  | → job_order.id (při smazání: no action) |
| `position` | `integer` | ne | `0` |  |
| `item_id` | `uuid` | ano |  |  |
| `title` | `text` | ne |  |  |
| `unit` | `text` | ne | `'ks'` |  |
| `quantity` | `numeric(14, 3)` | ne | `'1'` |  |
| `unit_price_minor` | `bigint` | ne | `0` |  |
| `vat_rate_bp` | `integer` | ne | `2100` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_order_line_order_idx` | `order_id`, `position` |  |

## approval_rule

Pravidlo schvalování: doklad daného typu (`change`, `statement`, `order`, `received_invoice`) od částky `minAmountMinor` schvaluje držitel oprávnění `approverPermission` (nebo konkrétní uživatel). Pod nejnižším limitem se doklad schválí automaticky podle nastavení typu. Vyhodnocuje se nejvyšší odpovídající pravidlo.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `doc_type` | `text` | ne |  |  |
| `min_amount_minor` | `bigint` | ne | `0` |  |
| `approver_permission` | `text` | ano |  |  |
| `approver_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `active` | `boolean` | ne | `true` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `approval_rule_doc_type_idx` | `doc_type` |  |

## approval

Žádost o schválení konkrétního dokladu (měkký odkaz na doklad v modulu, který ho vlastní).

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `doc_type` | `text` | ne |  |  |
| `doc_id` | `uuid` | ne |  |  |
| `job_id` | `uuid` | ano |  | → job.id (při smazání: no action) |
| `amount_minor` | `bigint` | ne | `0` |  |
| `status` | `text` | ne | `'pending'` |  |
| `requested_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `requested_at` | `timestamp with time zone` | ne | `now()` |  |
| `decided_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `decided_at` | `timestamp with time zone` | ano |  |  |
| `comment` | `text` | ano |  |  |
| `rule_id` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `approval_doc_idx` | `doc_type`, `doc_id` |  |
| `approval_status_idx` | `status` |  |

## job_template

Šablona zakázky: kostra rozpočtu, úkoly, složky a role týmu v JSON (tvar určuje `templates` v modulu).

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `description` | `text` | ano |  |  |
| `payload` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

## job_share

Odkaz pro investora (jen ke čtení). V databázi je jen otisk tokenu; `scope` říká, co investor vidí.

Definice: `packages/modules/zakazky/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `job_id` | `uuid` | ne |  | → job.id (při smazání: no action) |
| `token_hash` | `text` | ne |  |  |
| `label` | `text` | ano |  |  |
| `scope` | `jsonb` | ne | `'{}'::jsonb` |  |
| `expires_at` | `timestamp with time zone` | ano |  |  |
| `revoked_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `job_share_token_uq` | `token_hash` | unikátní |
| `job_share_job_idx` | `job_id` |  |

## Migrace

Složka `packages/modules/zakazky/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 13.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×2, ALTER TABLE ×8, CREATE UNIQUE INDEX ×1, CREATE INDEX ×6; tabulky: job, job_member |
| 1 | `0001_rozpocet_naklady_zmeny` | 2026-10-08 | CREATE TABLE ×3, ALTER TABLE ×10, CREATE UNIQUE INDEX ×1, CREATE INDEX ×2; tabulky: job_change, job_cost, job_estimate_line |
| 2 | `0002_zakazka_model` | 2026-10-09 | CREATE TABLE ×15, ALTER TABLE ×68, CREATE INDEX ×18, CREATE UNIQUE INDEX ×4; tabulky: approval, approval_rule, budget_calc_line, budget_item, budget_object, budget_section, budget_version, cost_allocation, job, job_change, job_change_line, job_cost, job_order, job_order_line, job_share, job_template, work_statement, work_statement_line |
| 3 | `0003_zakazka_souhrn` | 2026-10-09 | ALTER TABLE ×9; tabulky: job |
| 4 | `0004_job_cost_source` | 2026-10-09 | ALTER TABLE ×2, CREATE INDEX ×1; tabulky: job_cost |
| 5 | `0005_job_sum_unpaired` | 2026-10-09 | ALTER TABLE ×1; tabulky: job |
| 6 | `0006_lifecycle_phases` | 2026-10-09 | UPDATE ×4, INSERT INTO ×1; tabulky: job, pipeline_stage |
| 7 | `0007_rozpocet_z_odhadu` | 2026-10-09 | INSERT INTO ×4 |
| 8 | `0008_zrusit_odhad` | 2026-10-09 | DROP TABLE ×1; tabulky: job_estimate_line |
| 9 | `0009_zmeny_radky_ze_starych` | 2026-10-09 | INSERT INTO ×1, UPDATE ×1; tabulky: job_change, job_change_line |
| 10 | `0010_trgm_hledani` | 2026-10-09 | CREATE INDEX ×2; tabulky: job |
| 11 | `0011_crm_zakazka` | 2026-10-13 | CREATE TABLE ×2, ALTER TABLE ×22, CREATE UNIQUE INDEX ×1, CREATE INDEX ×5; tabulky: job, job_participant, job_stage_history |
| 12 | `0012_crm_historie_stavu` | 2026-10-13 | INSERT INTO ×1, UPDATE ×1; tabulky: job, job_stage_history |
