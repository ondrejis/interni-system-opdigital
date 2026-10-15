# Databáze: Modul Google Disk

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/disk/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Google Disk](../moduly/disk.md). Počet tabulek: 2.

## drive_request

Požadavek na složku (log odchozích událostí `drive.*` a jejich výsledku). `id` je zároveň `requestId` v těle webhooku (`data.requestId`) a `eventId` v callbacku z n8n, proto se negeneruje. `pending` a `sent` starší než 10 minut převede úloha `disk.timeout` na `timeout`.

Definice: `packages/modules/disk/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne |  | PK |
| `event` | `text` | ne |  |  |
| `entity_type` | `text` | ne |  | hodnoty: company, job |
| `entity_id` | `uuid` | ne |  |  |
| `payload` | `jsonb` | ne |  |  |
| `state` | `text` | ne | `'pending'` | hodnoty: pending, sent, done, error, timeout |
| `attempts` | `integer` | ne | `0` |  |
| `error` | `text` | ano |  |  |
| `requested_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `requested_at` | `timestamp with time zone` | ne | `now()` |  |
| `done_at` | `timestamp with time zone` | ano |  |  |
| `client_id` | `uuid` | ne |  |  |
| `event_id` | `uuid` | ano |  |  |
| `blocked_by` | `uuid` | ano |  |  |
| `sent_at` | `timestamp with time zone` | ano |  |  |
| `is_private` | `boolean` | ne | `false` |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `drive_request_client_open_idx` | `client_id`, `requested_at` | částečný |
| `drive_request_event_uq` | `event_id` | unikátní, částečný |
| `drive_request_blocked_idx` | `blocked_by` | částečný |
| `drive_request_entity_idx` | `entity_type`, `entity_id`, `requested_at` |  |
| `drive_request_open_idx` | `requested_at` | částečný |
| `drive_request_error_idx` | `requested_at` | částečný |

## drive_folder

Známé složky na Disku: kořen klienta či zakázky a jeho podsložky (služby, Archiv). Jedna složka na entitu a podklíč.

Definice: `packages/modules/disk/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `entity_type` | `text` | ne |  | hodnoty: company, job |
| `entity_id` | `uuid` | ne |  |  |
| `subkey` | `text` | ne | `''` | hodnoty: , web, marketing, systemy, archive |
| `folder_id` | `text` | ne |  |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `drive_folder_entity_uq` | `entity_type`, `entity_id`, `subkey` | unikátní |

## Migrace

Složka `packages/modules/disk/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 2.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×2, ALTER TABLE ×4, CREATE UNIQUE INDEX ×1, CREATE INDEX ×3; tabulky: drive_folder, drive_request |
| 1 | `0001_dark_franklin_richards` | 2026-10-14 | ALTER TABLE ×5, CREATE INDEX ×2, CREATE UNIQUE INDEX ×1; tabulky: drive_request |
