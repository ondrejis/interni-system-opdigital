# Entity modulu Realizace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Realizace](../moduly/realizace.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## defect

**Vada** (množné číslo: Vady). Vada nebo reklamace na zakázce. Vidí ji ten, kdo vadu řeší, vede zakázku, nebo je v jejím týmu.

- **Modul:** [Realizace](../moduly/realizace.md)
- **Tabulka:** `defect` ([databáze](../databaze/realizace.md))
- **Seznam:** `/realizace/vady`, detail `/realizace/vady/<id>`
- **Oprávnění:** read: `realizace.read`, write: `realizace.write`
- **Název záznamu:** `title`, stav (kanban): `stage`
- **Rozsah „jen moje“:** sloupce `responsible_id`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterCreate`, `afterUpdate`, `search`, `scope`, `owners`
- **Definice:** `packages/modules/realizace/src/server.ts`

### Pole entity `defect`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | Název | text | ano |  |  |  |  | `title` |
| `job` | Zakázka | record | ano | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `stage` | Stav | status | ano | pipeline `defect/default` |  |  |  | `stage_id` |
| `severity` | Závažnost | select | ne | číselník `defect.severity` |  |  |  | `severity` |
| `responsible` | Řeší | user | ne |  |  |  |  | `responsible_id` |
| `foundAt` | Nalezeno | date | ne |  |  |  |  | `found_at` |
| `dueDate` | Termín opravy | date | ne |  |  |  |  | `due_date` |
| `fixedAt` | Opraveno | date | ne |  |  |  |  | `fixed_at` |
| `description` | Popis | longtext | ne |  |  |  |  | `description` |

#### Výchozí pipeline „Vady“ (`default`)

| Pořadí | Stav | Barva | Druh | Fáze |
| --- | --- | --- | --- | --- |
| 1 | Nahlášená | red |  |  |
| 2 | V řešení | orange |  |  |
| 3 | Opraveno | green | done |  |
| 4 | Uznáno bez opravy | gray | done |  |
| 5 | Zamítnuto | gray | lost |  |
