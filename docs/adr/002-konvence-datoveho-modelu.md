# ADR 002: Konvence datového modelu

- Stav: přijato (2026-10-08; audit Q3 — balíček `uuid` schválen)
- Kontext: `docs/AUDIT.md` §3, §7

## Rozhodnutí

Platí pro všechny tabulky jádra i modulů:

- **ID:** `uuid` verze 7, generuje aplikace (balíček `uuid`; PostgreSQL 17 nemá `uuidv7()`). Better Auth se nastaví na stejný generátor.
- **Sloupce:** `created_at`, `updated_at`, `created_by`, `updated_by` na každé tabulce. `updated_at` se nastavuje v repozitáři, ne jen výchozí hodnotou.
- **Mazání:** soft delete (`deleted_at`) s možností obnovy. Fyzické mazání jen administrátorskou akcí. Všechny dotazy ve výchozím stavu vynechávají smazané.
- **Audit:** každý zápis vytvoří řádek v `audit_log` **ve stejné transakci** (strukturovaný diff `[{field, old, new}]`). Aplikační DB role má na `audit_log` jen INSERT a SELECT.
- **Stavy procesů** (poptávky, zakázky) jsou řádky v `pipeline_stage` (název, barva, pořadí, druh `open|won|lost|done`), ne hodnoty natvrdo v kódu. Technické enumy jsou `text` s `CHECK`.
- **Polymorfní vazby** (úkoly, komentáře, soubory) přes `entity_type` + `entity_id` (uuid).
- **Vlastní pole:** definice v `custom_field_def`, hodnoty ve sloupci `custom jsonb` na entitě, GIN index.
- **Číselné řady:** tabulka `number_series`, číslo se přiděluje v transakci jedním `UPDATE … RETURNING`, bez děr.
- **Hledání:** centrální `search_document` (unaccent, trigram, tsvector).
- **Názvy:** tabulky a sloupce `snake_case` anglicky, UI texty česky ze slovníku.
