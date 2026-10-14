# Databáze: Modul Kalendář

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/kalendar/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Kalendář](../moduly/kalendar.md). Počet tabulek: 6.

## calendar_resource

Zdroj, který lze v kalendáři obsadit: zasedačka, projektor, školicí místnost… (stroje mají vlastní rezervace).

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `kind` | `text` | ne | `'room'` |  |
| `active` | `boolean` | ne | `true` |  |
| `note` | `text` | ano |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `calendar_resource_active_idx` | `active` |  |

## event

Událost. Časy jsou okamžiky (UTC). U celodenní události je `startsAt` místní půlnoc prvního dne a `endsAt` místní půlnoc dne po posledním (jako v iCalendar). Opakování (`recurrence`) se rozbaluje v místním čase, takže se přes změnu letního času drží stejná hodina. Zakázka je měkký odkaz bez cizího klíče.

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `title` | `text` | ne |  |  |
| `type` | `text` | ne | `'meeting'` |  |
| `starts_at` | `timestamp with time zone` | ne |  |  |
| `ends_at` | `timestamp with time zone` | ne |  |  |
| `all_day` | `boolean` | ne | `false` |  |
| `location` | `text` | ano |  |  |
| `owner_id` | `uuid` | ne |  | → user.id (při smazání: no action) |
| `resource_id` | `uuid` | ano |  | → calendar_resource.id (při smazání: no action) |
| `job_id` | `uuid` | ano |  |  |
| `note` | `text` | ano |  |  |
| `recurrence` | `text` | ano |  |  |
| `recurrence_until` | `date` | ano |  |  |
| `reminder_minutes` | `integer` | ano |  |  |
| `custom` | `jsonb` | ne | `'{}'::jsonb` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `event_starts_idx` | `starts_at` |  |
| `event_owner_idx` | `owner_id` |  |
| `event_resource_idx` | `resource_id` |  |
| `event_job_idx` | `job_id` |  |
| `event_custom_idx` | `custom` |  |

## event_attendee

Další účastníci události (vlastník je v `event.ownerId`).

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `event_id` | `uuid` | ne |  | PK; → event.id (při smazání: cascade) |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: cascade) |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `event_attendee_user_idx` | `user_id` |  |

Složený primární klíč: `event_id`, `user_id`.

## calendar_feed

Osobní tajný odkaz na odběr kalendáře (iCalendar) pro Google, Apple, Outlook. V databázi je jen otisk (SHA-256) tokenu, takže únik databáze odkazy neprozradí; token se uživateli ukáže jen při vytvoření.

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `user_id` | `uuid` | ne |  | PK; → user.id (při smazání: cascade) |
| `token_hash` | `text` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `last_fetch_at` | `timestamp with time zone` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `calendar_feed_token_uq` | `token_hash` | unikátní |

## calendar_import

Import cizího kalendáře (tajná adresa iCal z Googlu nebo iCloudu): v systému se ukáže jako „obsazeno“.

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `user_id` | `uuid` | ne |  | → user.id (při smazání: cascade) |
| `name` | `text` | ne |  |  |
| `url_encrypted` | `text` | ne |  |  |
| `last_sync_at` | `timestamp with time zone` | ano |  |  |
| `last_error` | `text` | ano |  |  |
| `event_count` | `integer` | ne | `0` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `calendar_import_user_idx` | `user_id` |  |

## external_event

Definice: `packages/modules/kalendar/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `import_id` | `uuid` | ne |  | → calendar_import.id (při smazání: cascade) |
| `uid` | `text` | ne |  |  |
| `title` | `text` | ano |  |  |
| `starts_at` | `timestamp with time zone` | ne |  |  |
| `ends_at` | `timestamp with time zone` | ne |  |  |
| `all_day` | `boolean` | ne | `false` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `external_event_import_idx` | `import_id` |  |
| `external_event_starts_idx` | `starts_at` |  |

## Migrace

Složka `packages/modules/kalendar/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-08 | CREATE TABLE ×6, ALTER TABLE ×11, CREATE UNIQUE INDEX ×1, CREATE INDEX ×10; tabulky: calendar_feed, calendar_import, calendar_resource, event, event_attendee, external_event |
