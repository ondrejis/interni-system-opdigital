# Entity modulu Šablony e-mailů

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Šablony e-mailů](../moduly/sablony-emailu.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## email_template

**Šablona e-mailu** (množné číslo: Šablony e-mailů). Šablona e-mailu s proměnnými z příspěvků modulů (`emailVars`). Šablony jsou sdílené (vidí je každý s oprávněním `sablony-emailu.read`); autor je může zamknout jako soukromé (vidí je jen vlastník). Soukromá knihovna textů vlastníka je v Můj prostor. Text e-mailu je atribut `bodyText` (prostý text, ve kterém se hledá a který jde do Gmailu); tělo jako dokument Tiptap (`body_json`) se z něj odvozuje v háčcích níže, aby se nerozešly.

- **Modul:** [Šablony e-mailů](../moduly/sablony-emailu.md)
- **Tabulka:** `email_template` ([databáze](../databaze/sablony-emailu.md))
- **Seznam:** `/sablony-emailu`, detail `/sablony-emailu/<id>`
- **Oprávnění:** read: `sablony-emailu.read`, write: `sablony-emailu.write`, create: `sablony-emailu.create`, delete: `sablony-emailu.delete`
- **Název záznamu:** `name`
- **Rozsah „jen moje“:** sloupce `created_by`
- **Háčky a rozšíření entity:** `afterCreate`, `beforeUpdate`, `search`
- **Definice:** `packages/modules/sablony-emailu/src/entities.ts`

### Pole entity `email_template`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `category` | Kategorie | text | ne |  |  |  |  | `category` |
| `language` | Jazyk | select | ne | `cs`, `sk`, `en` |  | výchozí `cs` |  | `language` |
| `subject` | Předmět | text | ne |  |  |  |  | `subject` |
| `bodyText` | Text e-mailu | longtext | ne |  |  | výchozí |  | `body_text` |
| `usageCount` | Použito | number | ne |  |  |  | jen pro čtení | `usage_count` |
| `tags` | Štítky | multiselect | ne | číselník `tag` |  |  |  | `tags` |
