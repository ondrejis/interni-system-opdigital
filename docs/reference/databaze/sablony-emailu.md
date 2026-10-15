# Databáze: Modul Šablony e-mailů

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (definice tabulek v `packages/modules/sablony-emailu/src/schema.ts` (Drizzle) a žurnál migrací modulu). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Modul [Šablony e-mailů](../moduly/sablony-emailu.md). Počet tabulek: 1.

## email_template

Šablona e-mailu pro klienty a obchody (předmět a tělo s proměnnými jako `{{jmeno}}`). Tělo je Tiptap JSON, `body_text` je prostý text pro hledání a odkaz Gmailu. Viditelnost: kořen s vlastním zámkem.

Definice: `packages/modules/sablony-emailu/src/schema.ts`.

| Sloupec | Typ | Může být prázdný | Výchozí | Poznámka |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | ne | generuje aplikace | PK |
| `name` | `text` | ne |  |  |
| `category` | `text` | ano |  |  |
| `language` | `text` | ne | `'cs'` | hodnoty: cs, sk, en |
| `subject` | `text` | ne | `''` |  |
| `body_json` | `jsonb` | ano |  |  |
| `body_text` | `text` | ne | `''` |  |
| `usage_count` | `integer` | ne | `0` |  |
| `is_private` | `boolean` | ne | `false` |  |
| `visibility_source` | `text` | ne | `'own'` | hodnoty: own, inherited |
| `tags` | `text[]` | ne | `'{}'::text[]` |  |
| `created_at` | `timestamp with time zone` | ne | `now()` |  |
| `updated_at` | `timestamp with time zone` | ne | `now()` |  |
| `created_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `updated_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_at` | `timestamp with time zone` | ano |  |  |
| `deleted_by` | `uuid` | ano |  | → user.id (při smazání: no action) |
| `deleted_batch` | `uuid` | ano |  |  |

| Index | Sloupce | Druh |
| --- | --- | --- |
| `email_template_name_trgm_idx` | `(výraz)` |  |
| `email_template_subject_trgm_idx` | `(výraz)` |  |
| `email_template_category_idx` | `category` |  |
| `email_template_usage_idx` | `usage_count` |  |
| `email_template_tags_idx` | `tags` |  |
| `email_template_private_idx` | `is_private` | částečný |

## Migrace

Složka `packages/modules/sablony-emailu/drizzle`; pouze dopředné a zpětně kompatibilní (expand → contract, [ADR 009](../../adr/009-fronta-uloh-a-migrace.md)). Počet: 1.

| Pořadí | Název | Datum | Obsah |
| --- | --- | --- | --- |
| 0 | `0000_init` | 2026-10-14 | CREATE TABLE ×1, ALTER TABLE ×3, CREATE INDEX ×6; tabulky: email_template |
