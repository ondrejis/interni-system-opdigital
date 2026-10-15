# Databáze: Modul Kalendář

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/kalendar/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Kalendář](../moduly/kalendar.md). Počet tabulek: 4.

## calendar_account

Propojený Google účet uživatele (jeden na uživatele). `tokens_enc` jsou přístupové a obnovovací tokeny zašifrované přes `cipher` (nikdy v otevřené podobě); `status = reauth` znamená, že je potřeba souhlas obnovit.

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `google_email` | `text` | ne |  |  |
| `tokens_enc` | `text` | ne |  |  |
| `status` | `text` | ne | `'ok'` | hodnoty: ok, reauth, error |
| `last_sync_at` | `timestamp with time zone` | ano |  |  |
| `last_error` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `calendar_account_user_uq` | `user_id` | unikátní, částečný |

## calendar

Kalendář z Google účtu: zobrazení v OPSYS, cíl zápisu nových schůzek, synchronizační token a kanál pro push.

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `account_id` | `uuid` | ne |  | → calendar_account.id (při smazání: no action) |
| `google_id` | `text` | ne |  |  |
| `name` | `text` | ne |  |  |
| `color` | `text` | ano |  |  |
| `visible` | `boolean` | ne | `true` |  |
| `is_write_target` | `boolean` | ne | `false` |  |
| `sync_token` | `text` | ano |  |  |
| `watch_channel_id` | `text` | ano |  |  |
| `watch_expires_at` | `timestamp with time zone` | ano |  |  |
| `access_role` | `text` | ne | `'reader'` | hodnoty: owner, writer, reader, freeBusyReader |
| `is_primary` | `boolean` | ne | `false` |  |
| `time_zone` | `text` | ano |  |  |
| `sync_window_to` | `date` | ano |  |  |
| `last_sync_at` | `timestamp with time zone` | ano |  |  |
| `last_error` | `text` | ano |  |  |
| `watch_resource_id` | `text` | ano |  |  |
| `watch_token_hash` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `calendar_google_uq` | `account_id`, `google_id` | unikátní, částečný |
| `calendar_write_target_uq` | `account_id` | unikátní, částečný |
| `calendar_watch_channel_uq` | `watch_channel_id` | unikátní, částečný |
| `calendar_watch_expires_idx` | `watch_expires_at` | částečný |

## calendar_event

Zrcadlo události z Google Kalendáře (zdroj pravdy je Google; konflikt rozhodne novější změna). Vazby na úkol, obchod, organizaci a kontakt jsou měkké. Soukromou událost cizího uživatele ukazuje systém jen jako „Obsazeno“.

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `calendar_id` | `uuid` | ne |  | → calendar.id (při smazání: no action) |
| `google_id` | `text` | ne |  |  |
| `etag` | `text` | ano |  |  |
| `title` | `text` | ano |  |  |
| `starts_at` | `timestamp with time zone` | ne |  |  |
| `ends_at` | `timestamp with time zone` | ne |  |  |
| `all_day` | `boolean` | ne | `false` |  |
| `place` | `text` | ano |  |  |
| `meet_url` | `text` | ano |  |  |
| `attendees` | `jsonb` | ne | `'[]'::jsonb` |  |
| `is_google_private` | `boolean` | ne | `false` |  |
| `task_id` | `uuid` | ano |  |  |
| `deal_id` | `uuid` | ano |  |  |
| `company_id` | `uuid` | ano |  |  |
| `person_id` | `uuid` | ano |  |  |
| `linked_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `remote_deleted` | `boolean` | ne | `false` |  |
| `description` | `text` | ano |  |  |
| `html_link` | `text` | ano |  |  |
| `recurring_event_id` | `text` | ano |  |  |
| `original_start_at` | `timestamp with time zone` | ano |  |  |
| `visibility` | `text` | ne | `'default'` | hodnoty: default, public, private, confidential |
| `organizer_email` | `text` | ano |  |  |
| `google_updated_at` | `timestamp with time zone` | ano |  |  |
| `source` | `text` | ne | `'google'` | hodnoty: google, opsys |
| `remote_deleted_at` | `timestamp with time zone` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `calendar_event_google_uq` | `calendar_id`, `google_id` | unikátní |
| `calendar_event_task_uq` | `task_id` | unikátní, částečný |
| `calendar_event_recurring_idx` | `recurring_event_id` | částečný |
| `calendar_event_range_idx` | `starts_at`, `ends_at` |  |
| `calendar_event_task_idx` | `task_id` | částečný |
| `calendar_event_deal_idx` | `deal_id` | částečný |
| `calendar_event_company_idx` | `company_id` | částečný |
| `calendar_event_person_idx` | `person_id` | částečný |
| `calendar_event_title_trgm_idx` | `(výraz)` |  |

## calendar_push

Fronta zápisu do Googlu (outbox). Vzniká v transakci změny úkolu (`task.*` → handler) a zpracovává ji úloha `kalendar.push`; díky tomu zápis do Googlu nemůže předběhnout potvrzení změny a výpadek Googlu změnu neztratí. Na jeden úkol je nejvýš jeden nevyřízený řádek (další změny se slučují, `queued_at` se posune). U mazání nese `payload` identifikaci události (úkol už nemusí existovat).

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `task_id` | `uuid` | ano |  |  |
| `op` | `text` | ne | `'upsert'` | hodnoty: upsert, delete |
| `payload` | `jsonb` | ne | `'{}'::jsonb` |  |
| `want_meet` | `boolean` | ne | `false` |  |
| `queued_at` | `timestamp with time zone` | ne | `now()` |  |
| `attempts` | `integer` | ne | `0` |  |
| `next_attempt_at` | `timestamp with time zone` | ne | `now()` |  |
| `last_error` | `text` | ano |  |  |
| `done_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `calendar_push_task_uq` | `task_id` | unikátní, částečný |
| `calendar_push_due_idx` | `next_attempt_at` | částečný |

## Migrace

Složka `packages/modules/kalendar/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-15 | CREATE TABLE ×4, ALTER TABLE ×13, CREATE UNIQUE INDEX ×7, CREATE INDEX ×9; tabulky: calendar, calendar_account, calendar_event, calendar_push |
