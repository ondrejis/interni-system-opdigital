# Databáze: jádro

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/core/src/db/schema` (Drizzle) a žurnál migrací). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Tabulky platformy: uživatelé a role, audit, spolupráce (komentáře, úkoly, upozornění), soubory, nastavení, číselníky, pohledy. Počet tabulek: 44. Konvence sloupců (UUID v7, audit sloupce, měkké mazání, peníze v haléřích) popisují [ADR 002](../../adr/002-konvence-datoveho-modelu.md) a [ADR 003](../../adr/003-penize-a-mnozstvi.md).

## Schéma audit

Soubor `packages/core/src/db/schema/audit.ts`. Tabulky: `audit_log`.

### audit_log

Auditní záznam. Zapisuje se ve stejné transakci jako změna. Aplikační DB role má na tuto tabulku jen INSERT a SELECT (viz `db/grants.ts`) — nejde ho měnit ani mazat.

Definice: `packages/core/src/db/schema/audit.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `occurred_at` | `timestamp with time zone` | ne | `now()` |  |
| `actor_kind` | `text` | ne |  | hodnoty: user, system, agency, n8n, google, meta, job |
| `actor_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `action` | `text` | ne |  |  |
| `entity_type` | `text` | ne |  |  |
| `entity_id` | `text` | ne |  |  |
| `summary` | `text` | ano |  |  |
| `changes` | `jsonb` | ne | `'[]'::jsonb` |  |
| `request_id` | `text` | ano |  |  |
| `ip` | `text` | ano |  |  |
| `actor_label` | `text` | ano |  |  |
| `category` | `text` | ne | `'data'` | hodnoty: data, security, integration |
| `is_private` | `boolean` | ne | `false` |  |
| `entity_title` | `text` | ano |  |  |
| `context` | `jsonb` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `audit_log_entity_idx` | `entity_type`, `entity_id`, `occurred_at` |  |
| `audit_log_actor_idx` | `actor_id`, `occurred_at` |  |
| `audit_log_time_idx` | `occurred_at` |  |
| `audit_log_category_idx` | `category`, `occurred_at` |  |
| `audit_log_private_idx` | `occurred_at` | částečný |
| `audit_log_title_trgm_idx` | `(výraz)` |  |

## Schéma collab

Soubor `packages/core/src/db/schema/collab.ts`. Tabulky: `comment`, `notification`, `notification_delivery`, `notification_pref`, `push_subscription`, `reminder_sent`.

### comment

Komentář k libovolnému záznamu (polymorfní vazba), s @zmínkami.

Definice: `packages/core/src/db/schema/collab.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `entity_type` | `text` | ne |  |  |
| `entity_id` | `uuid` | ne |  |  |
| `author_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `body` | `text` | ne |  |  |
| `mentions` | `uuid[]` | ne | `'{}'::uuid[]` |  |
| `edited_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `comment_entity_idx` | `entity_type`, `entity_id`, `created_at` |  |

### notification

Upozornění uživatele. Je to zároveň „outbox“: vzniká ve stejné transakci jako změna, která ho vyvolala (selže-li transakce, upozornění nevznikne), a doručení do zařízení řeší worker z tabulky `notification_delivery`. `inbox = false` je upozornění jen pro push (uživatel má zvonek u dané události vypnutý, nebo jde o zkušební zprávu).

Definice: `packages/core/src/db/schema/collab.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: cascade) |
| `kind` | `text` | ne |  |  |
| `severity` | `text` | ne | `'normal'` | hodnoty: normal, urgent |
| `title` | `text` | ne |  |  |
| `body` | `text` | ano |  |  |
| `url` | `text` | ano |  |  |
| `entity_type` | `text` | ano |  |  |
| `entity_id` | `uuid` | ano |  |  |
| `inbox` | `boolean` | ne | `true` |  |
| `dedupe_key` | `text` | ano |  |  |
| `collapse_key` | `text` | ano |  |  |
| `count` | `integer` | ne | `1` |  |
| `read_at` | `timestamp with time zone` | ano |  |  |
| `pushed_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `notification_user_idx` | `user_id`, `read_at`, `created_at` |  |
| `notification_unpushed_idx` | `created_at` | částečný |
| `notification_dedupe_uq` | `user_id`, `dedupe_key` | unikátní, částečný |
| `notification_collapse_idx` | `user_id`, `collapse_key` | částečný |

### notification_delivery

Doručení upozornění jedním kanálem (push, e-mail). Řádek je zároveň fronta (`status`, `release_at`) a protokol (stav, důvod přeskočení, počet zařízení). Nikdy neobsahuje adresy odběrů ani klíče.

Definice: `packages/core/src/db/schema/collab.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `notification_id` | `uuid` | ne |  | → notification.id (při smazání: cascade) |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: cascade) |
| `channel` | `text` | ne |  | hodnoty: push, email |
| `status` | `text` | ne |  | hodnoty: queued, held, retry, sending, sent, failed, skipped |
| `mode` | `text` | ne | `'instant'` | hodnoty: instant, digest, quiet |
| `reason` | `text` | ano |  |  |
| `attempts` | `integer` | ne | `0` |  |
| `release_at` | `timestamp with time zone` | ne | `now()` |  |
| `claimed_at` | `timestamp with time zone` | ano |  |  |
| `sent_at` | `timestamp with time zone` | ano |  |  |
| `detail` | `jsonb` | ano |  |  |
| `last_error` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `notification_delivery_due_idx` | `release_at` | částečný |
| `notification_delivery_notification_idx` | `notification_id` |  |
| `notification_delivery_user_idx` | `user_id`, `created_at` |  |

### notification_pref

Předvolby upozornění uživatele (události × kanály, tiché hodiny, shrnutí). Struktura je zod schéma v jádru.

Definice: `packages/core/src/db/schema/collab.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: cascade) |
| `prefs` | `jsonb` | ne |  |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |

### push_subscription

Odběr push upozornění jednoho zařízení (Web Push). Adresa je podle prohlížeče; jeden uživatel jich má víc.

Definice: `packages/core/src/db/schema/collab.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: cascade) |
| `endpoint` | `text` | ne |  |  |
| `p256dh` | `text` | ne |  |  |
| `auth` | `text` | ne |  |  |
| `user_agent` | `text` | ano |  |  |
| `session_id` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `last_sent_at` | `timestamp with time zone` | ano |  |  |
| `failures` | `integer` | ne | `0` |  |
| `last_error` | `text` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `push_subscription_endpoint_uq` | `endpoint` | unikátní |
| `push_subscription_user_idx` | `user_id` |  |

### reminder_sent

Zámek proti opakovanému odeslání téže připomínky (STK, servisní interval, zítřejší rezervace…). Klíč skládá modul tak, aby obsahoval i stav (např. `stroje:<id>:stk:<datum>:7`), a znovu se tedy odešle až po změně termínu nebo při dalším stupni upozornění.

Definice: `packages/core/src/db/schema/collab.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `key` | `text` | ne |  | PK |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |

## Schéma config

Soubor `packages/core/src/db/schema/config.ts`. Tabulky: `setting`, `pipeline`, `pipeline_stage`, `lookup_list`, `lookup_item`, `number_series`, `vat_rate`, `custom_field_def`, `employee`.

### setting

Nastavení aplikace: klíč → JSON. Tajné hodnoty jsou uvnitř zašifrované (viz `security/crypto`).

Definice: `packages/core/src/db/schema/config.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `key` | `text` | ne |  | PK |
| `value` | `jsonb` | ne |  |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |

### pipeline

Pipeline (stavy procesu) konfigurovatelná v administraci, např. `job/default`.

Definice: `packages/core/src/db/schema/config.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `entity_type` | `text` | ne |  |  |
| `key` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `pipeline_key_uq` | `entity_type`, `key` | unikátní, částečný |

### pipeline_stage

Definice: `packages/core/src/db/schema/config.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `pipeline_id` | `uuid` | ne |  | → pipeline.id (při smazání: cascade) |
| `name` | `text` | ne |  |  |
| `color` | `text` | ne | `'gray'` |  |
| `position` | `integer` | ne |  |  |
| `kind` | `text` | ne | `'open'` | hodnoty: open, won, lost, done |
| `phase` | `text` | ano |  |  |
| `probability_pct` | `smallint` | ano |  |  |
| `rotting_days` | `smallint` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `pipeline_stage_idx` | `pipeline_id`, `position` |  |

### lookup_list

Číselníky (zdroje poptávek, důvody prohry, kategorie…).

Definice: `packages/core/src/db/schema/config.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `key` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `lookup_list_key_uq` | `key` | unikátní, částečný |

### lookup_item

Definice: `packages/core/src/db/schema/config.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `list_id` | `uuid` | ne |  | → lookup_list.id (při smazání: cascade) |
| `value` | `text` | ne |  |  |
| `label` | `text` | ne |  |  |
| `color` | `text` | ano |  |  |
| `position` | `integer` | ne | `0` |  |
| `active` | `boolean` | ne | `true` |  |
| `scopes` | `text[]` | ne | `'{}'::text[]` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `lookup_item_uq` | `list_id`, `value` | unikátní |

### number_series

Číselné řady dokladů. Číslo se přiděluje jedním UPDATE ve stejné transakci jako doklad (bez děr).

Definice: `packages/core/src/db/schema/config.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `key` | `text` | ne |  | PK |
| `pattern` | `text` | ne |  |  |
| `reset` | `text` | ne | `'yearly'` | hodnoty: yearly, never |
| `period` | `text` | ne | `''` |  |
| `last_value` | `integer` | ne | `0` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |

### vat_rate

Sazby DPH s platností; `rate_bp` v setinách procenta (21 % = 2100).

Definice: `packages/core/src/db/schema/config.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `code` | `text` | ne |  |  |
| `label` | `text` | ne |  |  |
| `rate_bp` | `integer` | ne |  |  |
| `valid_from` | `date` | ne |  |  |
| `valid_to` | `date` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `vat_rate_uq` | `code`, `valid_from` | unikátní |

### custom_field_def

Definice vlastního pole; hodnoty jsou ve sloupci `custom jsonb` příslušné entity.

Definice: `packages/core/src/db/schema/config.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `entity_type` | `text` | ne |  |  |
| `key` | `text` | ne |  |  |
| `label` | `text` | ne |  |  |
| `type` | `text` | ne |  | hodnoty: text, longtext, number, currency, date, select, multiselect, user, record, checkbox, url, phone, email |
| `options` | `jsonb` | ne | `'{}'::jsonb` |  |
| `required` | `boolean` | ne | `false` |  |
| `position` | `integer` | ne | `0` |  |
| `show_in_table` | `boolean` | ne | `true` |  |
| `show_in_form` | `boolean` | ne | `true` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `custom_field_key_uq` | `entity_type`, `key` | unikátní, částečný |

### employee

Údaje zaměstnance (1:1 k uživateli): docházka, náklady práce, řidičská oprávnění.

Definice: `packages/core/src/db/schema/config.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: no action) |
| `employee_no` | `text` | ano |  |  |
| `job_title` | `text` | ano |  |  |
| `phone` | `text` | ano |  |  |
| `employment_type` | `text` | ne | `'hpp'` | hodnoty: hpp, dpp, dpc, osvc, external |
| `workload` | `numeric(4, 2)` | ne | `'1.00'` |  |
| `hourly_cost_minor` | `bigint` | ano |  |  |
| `start_date` | `date` | ano |  |  |
| `license_groups` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

## Schéma dashboards

Soubor `packages/core/src/db/schema/dashboards.ts`. Tabulky: `dashboard`, `dashboard_share`, `dashboard_pref`.

### dashboard

Vlastní nástěnka: definice (widgety a mřížka) je JSON s verzí schématu (`schema_version`, migrace při čtení). `owner_id` je autor; nástěnka ze seedu klienta (`seed_key`) nemá autora. Výchozí nástěnka pro roli má `default_for_role` (vidí ji všichni z této role); `is_home` ji zároveň otevírá na úvodní stránce místo klasického Přehledu.

Definice: `packages/core/src/db/schema/dashboards.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `owner_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `definition` | `jsonb` | ne |  |  |
| `schema_version` | `integer` | ne | `1` |  |
| `seed_key` | `text` | ano |  |  |
| `default_for_role` | `text` | ano |  |  |
| `is_home` | `boolean` | ne | `false` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `dashboard_seed_key_uq` | `seed_key` | unikátní, částečný |
| `dashboard_home_role_uq` | `default_for_role` | unikátní, částečný |
| `dashboard_owner_idx` | `owner_id` |  |
| `dashboard_role_idx` | `default_for_role` |  |

### dashboard_share

Sdílení nástěnky s rolí (`kind = role`, `ref` = klíč role) nebo uživatelem (`kind = user`, `ref` = id).

Definice: `packages/core/src/db/schema/dashboards.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `dashboard_id` | `uuid` | ne |  | PK; → dashboard.id (při smazání: cascade) |
| `kind` | `text` | ne |  | PK; hodnoty: role, user |
| `ref` | `text` | ne |  | PK |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `dashboard_share_ref_idx` | `kind`, `ref` |  |

Složený primární klíč: `dashboard_id`, `kind`, `ref`.

### dashboard_pref

Pořadí nástěnek v přepínači na úvodní stránce, zvlášť pro každého uživatele.

Definice: `packages/core/src/db/schema/dashboards.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: cascade) |
| `dashboard_id` | `uuid` | ne |  | PK; → dashboard.id (při smazání: cascade) |
| `position` | `integer` | ne | `0` |  |

Složený primární klíč: `user_id`, `dashboard_id`.

## Schéma exports

Soubor `packages/core/src/db/schema/exports.ts`. Tabulky: `export_template`, `export_schedule`, `export_run`.

### export_template

Uložená sada sloupců a filtrů pod jménem; osobní, nebo sdílená v týmu. `config` je `ExportSpec` bez názvu souboru stroje.

Definice: `packages/core/src/db/schema/exports.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `owner_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `entity_type` | `text` | ne |  |  |
| `shared` | `boolean` | ne | `false` |  |
| `config` | `jsonb` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `export_template_entity_idx` | `entity_type`, `owner_id` |  |

### export_schedule

Plánovaný export: opakuje se denně / týdně / měsíčně v místním čase (Europe/Prague). Každý příjemce dostane export podle svých vlastních oprávnění. `next_run_at` posouvá worker; běh jedné periody je jednoznačný (`period_key`).

Definice: `packages/core/src/db/schema/exports.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `owner_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `template_id` | `uuid` | ano |  | → export_template.id (při smazání: set null) |
| `spec` | `jsonb` | ne |  |  |
| `frequency` | `text` | ne |  | hodnoty: daily, weekly, monthly |
| `weekday` | `integer` | ano |  |  |
| `month_day` | `integer` | ano |  |  |
| `time_local` | `text` | ne | `'06:00'` |  |
| `recipients` | `jsonb` | ne | `'[]'::jsonb` |  |
| `deliver` | `text` | ne | `'myexports'` | hodnoty: email, myexports, both |
| `active` | `boolean` | ne | `true` |  |
| `next_run_at` | `timestamp with time zone` | ano |  |  |
| `last_run_at` | `timestamp with time zone` | ano |  |  |
| `last_status` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `export_schedule_due_idx` | `next_run_at` | částečný |
| `export_schedule_owner_idx` | `owner_id` |  |

### export_run

Jeden export (ruční, plánovaný, nástěnka): záznam pro audit i pro „Moje exporty“. Velké exporty se zpracují na pozadí (`status`) a soubor leží v úložišti do `expires_at`; pak ho úklid smaže a stav se změní na `expired`.

Definice: `packages/core/src/db/schema/exports.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `source` | `text` | ne |  | hodnoty: manual, schedule, dashboard |
| `schedule_id` | `uuid` | ano |  | → export_schedule.id (při smazání: set null) |
| `template_id` | `uuid` | ano |  | → export_template.id (při smazání: set null) |
| `entity_type` | `text` | ne |  |  |
| `label` | `text` | ne |  |  |
| `format` | `text` | ne |  |  |
| `file_name` | `text` | ne |  |  |
| `status` | `text` | ne | `'queued'` | hodnoty: queued, running, done, failed, expired |
| `row_count` | `integer` | ano |  |  |
| `size_bytes` | `bigint` | ano |  |  |
| `file_key` | `text` | ano |  |  |
| `spec` | `jsonb` | ne |  |  |
| `error` | `text` | ano |  |  |
| `period_key` | `text` | ano |  |  |
| `deliver_email` | `boolean` | ne | `false` |  |
| `started_at` | `timestamp with time zone` | ano |  |  |
| `finished_at` | `timestamp with time zone` | ano |  |  |
| `expires_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `export_run_user_idx` | `user_id`, `created_at` |  |
| `export_run_pending_idx` | `created_at` | částečný |
| `export_run_expiry_idx` | `expires_at` | částečný |
| `export_run_period_uq` | `schedule_id`, `period_key`, `user_id` | unikátní, částečný |

## Schéma files

Soubor `packages/core/src/db/schema/files.ts`. Tabulky: `file`, `attachment`, `email_log`.

### file

Nahraný soubor. Obsah je v úložišti (`storage_key`), nikdy ne ve veřejné složce.

Definice: `packages/core/src/db/schema/files.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `storage_key` | `text` | ne |  | unikátní |
| `name` | `text` | ne |  |  |
| `mime` | `text` | ne |  |  |
| `size` | `bigint` | ne |  |  |
| `sha256` | `text` | ne |  |  |
| `kind` | `text` | ne |  | hodnoty: image, document |
| `width` | `integer` | ano |  |  |
| `height` | `integer` | ano |  |  |
| `thumb_key` | `text` | ano |  |  |
| `uploaded_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `file_uploaded_by_idx` | `uploaded_by` |  |

### attachment

Připojení souboru k záznamu (polymorfně).

Definice: `packages/core/src/db/schema/files.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `file_id` | `uuid` | ne |  | → file.id (při smazání: no action) |
| `entity_type` | `text` | ne |  |  |
| `entity_id` | `uuid` | ne |  |  |
| `kind` | `text` | ne | `'document'` |  |
| `taken_at` | `timestamp with time zone` | ano |  |  |
| `geo` | `jsonb` | ano |  |  |
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
| `attachment_entity_idx` | `entity_type`, `entity_id` |  |
| `attachment_uq` | `file_id`, `entity_type`, `entity_id` | unikátní, částečný |

### email_log

Odeslané e-maily. Záměrně bez těla zprávy — tělo může obsahovat tajný odkaz.

Definice: `packages/core/src/db/schema/files.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `to_email` | `text` | ne |  |  |
| `template` | `text` | ne |  |  |
| `subject` | `text` | ne |  |  |
| `status` | `text` | ne | `'queued'` | hodnoty: queued, sent, failed |
| `error` | `text` | ano |  |  |
| `entity_type` | `text` | ano |  |  |
| `entity_id` | `uuid` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `sent_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `email_log_time_idx` | `created_at` |  |

## Schéma identity

Soubor `packages/core/src/db/schema/identity.ts`. Tabulky: `role`, `role_permission`, `user`, `session`, `account`, `verification`, `two_factor`, `rate_limit`, `invitation`, `login_event`.

### role

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `key` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `description` | `text` | ano |  |  |
| `is_system` | `boolean` | ne | `false` |  |
| `require_2fa` | `boolean` | ne | `false` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `role_key_uq` | `key` | unikátní, částečný |

### role_permission

Oprávnění role. `scope`: `all` = všechny záznamy, `own` = jen vlastní/přidělené.

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `role_id` | `uuid` | ne |  | PK; → role.id (při smazání: cascade) |
| `permission` | `text` | ne |  | PK |
| `scope` | `text` | ne | `'all'` | hodnoty: all, own |

Složený primární klíč: `role_id`, `permission`.

### user

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `email` | `text` | ne |  |  |
| `email_verified` | `boolean` | ne | `false` |  |
| `image` | `text` | ano |  |  |
| `role_id` | `uuid` | ne |  | → role.id (při smazání: no action) |
| `active` | `boolean` | ne | `true` |  |
| `two_factor_enabled` | `boolean` | ne | `false` |  |
| `must_change_password` | `boolean` | ne | `false` |  |
| `last_login_at` | `timestamp with time zone` | ano |  |  |
| `short_name` | `text` | ano |  |  |
| `ico` | `text` | ano |  |  |
| `billing_tool` | `text` | ano |  |  |
| `avatar_color` | `text` | ano |  |  |
| `prefs` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `user_email_uq` | `(výraz)` | unikátní |
| `user_role_idx` | `role_id` |  |

### session

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `expires_at` | `timestamp with time zone` | ne |  |  |
| `token` | `text` | ne |  | unikátní |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `ip_address` | `text` | ano |  |  |
| `user_agent` | `text` | ano |  |  |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: cascade) |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `session_user_idx` | `user_id` |  |

### account

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `account_id` | `text` | ne |  |  |
| `provider_id` | `text` | ne |  |  |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: cascade) |
| `access_token` | `text` | ano |  |  |
| `refresh_token` | `text` | ano |  |  |
| `id_token` | `text` | ano |  |  |
| `access_token_expires_at` | `timestamp with time zone` | ano |  |  |
| `refresh_token_expires_at` | `timestamp with time zone` | ano |  |  |
| `scope` | `text` | ano |  |  |
| `password` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `account_user_idx` | `user_id` |  |

### verification

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `identifier` | `text` | ne |  |  |
| `value` | `text` | ne |  |  |
| `expires_at` | `timestamp with time zone` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `verification_identifier_idx` | `identifier` |  |

### two_factor

TOTP tajemství a záložní kódy (plugin `twoFactor` Better Auth).

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `secret` | `text` | ne |  |  |
| `backup_codes` | `text` | ne |  |  |
| `verified` | `boolean` | ne | `true` |  |
| `failed_verification_count` | `integer` | ne | `0` |  |
| `locked_until` | `timestamp with time zone` | ano |  |  |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: cascade) |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `two_factor_user_idx` | `user_id` |  |

### rate_limit

Omezení počtu požadavků na přihlášení a citlivé endpointy (Better Auth, úložiště v DB).

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `key` | `text` | ne |  | unikátní |
| `count` | `integer` | ne |  |  |
| `last_request` | `bigint` | ne |  |  |

### invitation

Pozvánka do systému. Platí 48 hodin; v DB je jen otisk tokenu.

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `email` | `text` | ne |  |  |
| `role_id` | `uuid` | ne |  | → role.id (při smazání: no action) |
| `token_hash` | `text` | ne |  | unikátní |
| `expires_at` | `timestamp with time zone` | ne |  |  |
| `accepted_at` | `timestamp with time zone` | ano |  |  |
| `revoked_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `invitation_email_idx` | `(výraz)` |  |

### login_event

Definice: `packages/core/src/db/schema/identity.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: cascade) |
| `outcome` | `text` | ne |  |  |
| `ip_address` | `text` | ano |  |  |
| `user_agent` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `login_event_user_idx` | `user_id`, `created_at` |  |

## Schéma integrations

Soubor `packages/core/src/db/schema/integrations.ts`. Tabulky: `webhook_endpoint`, `webhook_delivery`, `inbound_event`, `integration_credential`.

### webhook_endpoint

Odchozí webhook: adresa (n8n), tajemství pro podpis HMAC a odebírané události.

Definice: `packages/core/src/db/schema/integrations.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `url` | `text` | ne |  |  |
| `secret_enc` | `text` | ne |  |  |
| `events` | `text[]` | ne | `'{}'::text[]` |  |
| `include_private` | `boolean` | ne | `false` |  |
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
| `webhook_endpoint_active_idx` | `active` |  |

### webhook_delivery

Doručení jedné události jednomu endpointu: zároveň fronta (outbox) a protokol (5 pokusů, 1 min až 1 h).

Definice: `packages/core/src/db/schema/integrations.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `endpoint_id` | `uuid` | ne |  | → webhook_endpoint.id (při smazání: cascade) |
| `event_id` | `uuid` | ne |  |  |
| `event` | `text` | ne |  |  |
| `payload` | `jsonb` | ne |  |  |
| `status` | `text` | ne | `'pending'` | hodnoty: pending, delivered, failed |
| `attempts` | `integer` | ne | `0` |  |
| `next_attempt_at` | `timestamp with time zone` | ne | `now()` |  |
| `last_error` | `text` | ano |  |  |
| `delivered_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `webhook_delivery_event_uq` | `endpoint_id`, `event_id` | unikátní |
| `webhook_delivery_due_idx` | `next_attempt_at` | částečný |
| `webhook_delivery_failed_idx` | `created_at` | částečný |

### inbound_event

Příchozí událost z `/api/ingest/<source>` (Drive callback, Meta leady). Idempotence: dvojice (`source`, `external_id`) je unikátní, opakované doručení se nezpracuje podruhé; chyba zůstane ve stavu `failed` s důvodem.

Definice: `packages/core/src/db/schema/integrations.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `source` | `text` | ne |  |  |
| `external_id` | `text` | ne |  |  |
| `payload` | `jsonb` | ne |  |  |
| `status` | `text` | ne | `'received'` | hodnoty: received, processed, failed |
| `error` | `text` | ano |  |  |
| `entity_type` | `text` | ano |  |  |
| `entity_id` | `uuid` | ano |  |  |
| `received_at` | `timestamp with time zone` | ne | `now()` |  |
| `processed_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `inbound_event_uq` | `source`, `external_id` | unikátní |
| `inbound_event_status_idx` | `status`, `received_at` |  |

### integration_credential

Šifrovaná přihlašovací data poskytovatele (Meta token, Fakturoid klíč…). `user_id` je prázdné u společných přístupů agentury; jinak patří uživateli (osobní propojení). Obsah je zašifrovaný přes `cipher` (`data_enc`).

Definice: `packages/core/src/db/schema/integrations.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `provider` | `text` | ne |  | hodnoty: google, meta, fakturoid |
| `user_id` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `data_enc` | `text` | ne |  |  |
| `status` | `text` | ne | `'ok'` | hodnoty: ok, reauth, error |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `integration_credential_shared_uq` | `provider` | unikátní, částečný |
| `integration_credential_user_uq` | `provider`, `user_id` | unikátní, částečný |

## Schéma views

Soubor `packages/core/src/db/schema/views.ts`. Tabulky: `saved_view`, `view_favorite`, `search_document`, `private_record`, `recent_record`.

### saved_view

Uložený pohled na entitu (filtr + řazení + sloupce + seskupení), osobní nebo sdílený.

Definice: `packages/core/src/db/schema/views.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `entity_type` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `owner_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `shared` | `boolean` | ne | `false` |  |
| `pinned` | `boolean` | ne | `false` |  |
| `position` | `integer` | ne | `0` |  |
| `config` | `jsonb` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `saved_view_entity_idx` | `entity_type`, `owner_id` |  |

### view_favorite

Oblíbené pohledy uživatele (zobrazují se v postranním panelu).

Definice: `packages/core/src/db/schema/views.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: cascade) |
| `view_id` | `uuid` | ne |  | PK; → saved_view.id (při smazání: cascade) |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |

Složený primární klíč: `user_id`, `view_id`.

### search_document

Index pro hledání napříč entitami (Cmd+K). `search_text` je text bez diakritiky malými písmeny; trigramový index zrychlí `ILIKE '%…%'`. Aktualizuje ho servisní vrstva ve stejné transakci jako záznam.

Definice: `packages/core/src/db/schema/views.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `entity_type` | `text` | ne |  | PK |
| `entity_id` | `uuid` | ne |  | PK |
| `title` | `text` | ne |  |  |
| `subtitle` | `text` | ano |  |  |
| `search_text` | `text` | ne |  |  |
| `is_private` | `boolean` | ne | `false` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `search_document_private_idx` | `entity_type` | částečný |
| `search_document_trgm_idx` | `(výraz)` |  |

Složený primární klíč: `entity_type`, `entity_id`.

### private_record

Soukromé záznamy napříč entitami (D §5.1). Řádek vzniká a zaniká ve stejné transakci jako změna `is_private` (nebo smazání záznamu), takže průřezové dotazy (komentáře, soubory, historie, koš, soukromý přehled) nemusí znát tabulky.

Definice: `packages/core/src/db/schema/views.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `entity_type` | `text` | ne |  | PK |
| `entity_id` | `uuid` | ne |  | PK |
| `since` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `private_record_id_idx` | `entity_id` |  |

Složený primární klíč: `entity_type`, `entity_id`.

### recent_record

Naposledy otevřené záznamy uživatele (paleta Cmd+K, „Nedávné“; drží se posledních 8, C3).

Definice: `packages/core/src/db/schema/views.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: cascade) |
| `entity_type` | `text` | ne |  | PK |
| `entity_id` | `uuid` | ne |  | PK |
| `visited_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `recent_record_user_idx` | `user_id`, `visited_at` |  |

Složený primární klíč: `user_id`, `entity_type`, `entity_id`.

## Migrace

Složka `packages/core/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 15.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×11, ALTER TABLE ×14, CREATE INDEX ×10, CREATE UNIQUE INDEX ×2; tabulky: account, audit_log, invitation, login_event, rate_limit, role, role_permission, session, two_factor, user, verification |
| 1 | `0001_two_factor_lockout` | 2026-10-08 | ALTER TABLE ×3; tabulky: two_factor |
| 2 | `0002_platform` | 2026-10-08 | CREATE TABLE ×15, ALTER TABLE ×31, CREATE INDEX ×8, CREATE UNIQUE INDEX ×6; tabulky: attachment, comment, custom_field_def, email_log, employee, file, lookup_item, lookup_list, notification, number_series, pipeline, pipeline_stage, setting, task, vat_rate |
| 3 | `0003_views_and_search` | 2026-10-08 | CREATE TABLE ×3, ALTER TABLE ×5, CREATE INDEX ×2; tabulky: saved_view, search_document, view_favorite |
| 4 | `0004_search_function` | 2026-10-08 | CREATE OR REPLACE FUNCTION ×1 |
| 5 | `0005_reminder_sent` | 2026-10-08 | CREATE TABLE ×1; tabulky: reminder_sent |
| 6 | `0006_push` | 2026-10-08 | CREATE TABLE ×1, ALTER TABLE ×2, CREATE UNIQUE INDEX ×1, CREATE INDEX ×2; tabulky: notification, push_subscription |
| 7 | `0007_pipeline_phase` | 2026-10-09 | ALTER TABLE ×1; tabulky: pipeline_stage |
| 8 | `0008_terminal_op` | 2026-10-09 | CREATE TABLE ×1, ALTER TABLE ×1, CREATE INDEX ×1; tabulky: terminal_op |
| 9 | `0009_notifications` | 2026-10-09 | CREATE TABLE ×2, ALTER TABLE ×12, CREATE INDEX ×4, CREATE UNIQUE INDEX ×1; tabulky: notification, notification_delivery, notification_pref, push_subscription |
| 10 | `0010_dashboards_exports` | 2026-10-09 | CREATE TABLE ×6, ALTER TABLE ×16, CREATE UNIQUE INDEX ×3, CREATE INDEX ×9; tabulky: dashboard, dashboard_pref, dashboard_share, export_run, export_schedule, export_template |
| 11 | `0011_crm_stage_probability` | 2026-10-13 | ALTER TABLE ×2; tabulky: pipeline_stage |
| 12 | `0012_drop_terminal_op` | 2026-10-14 | DROP TABLE ×1; tabulky: terminal_op |
| 13 | `0013_opsys` | 2026-10-14 | CREATE TABLE ×6, ALTER TABLE ×84, DROP INDEX ×2, CREATE INDEX ×12, CREATE UNIQUE INDEX ×4; tabulky: attachment, audit_log, comment, core_task, custom_field_def, dashboard, employee, export_schedule, export_template, file, inbound_event, integration_credential, invitation, lookup_item, lookup_list, pipeline, pipeline_stage, private_record, recent_record, role, saved_view, search_document, task, user, vat_rate, webhook_delivery, webhook_endpoint |
| 14 | `0014_c1_drop_core_task` | 2026-10-14 | DROP TABLE ×1; tabulky: core_task |
