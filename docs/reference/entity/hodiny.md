# Entity modulu Hodiny

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Hodiny](../moduly/hodiny.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## time_entry

**Záznam hodin** (množné číslo: Záznamy hodin). Záznam odpracovaného času. Rozsah „jen moje“: vlastní záznamy. Viditelnost se dědí od zakázky a úkolu (soukromá zakázka = soukromé hodiny), vlastní zámek nemá.

- **Modul:** [Hodiny](../moduly/hodiny.md)
- **Tabulka:** `time_entry` ([databáze](../databaze/hodiny.md))
- **Seznam:** `/hodiny/zaznamy`, detail `/hodiny/zaznamy/<id>`
- **Oprávnění:** read: `hodiny.read`, write: `hodiny.write`, create: `hodiny.write`, delete: `hodiny.delete`
- **Název záznamu:** `date`
- **Rozsah „jen moje“:** sloupce `user_id`
- **Háčky a rozšíření entity:** `scope`, `ownerDefaults`
- **Definice:** `packages/modules/hodiny/src/entities.ts`

### Pole entity `time_entry`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `date` | Datum | date | ano |  |  |  |  | `date` |
| `user` | Kdo | user | ano |  |  |  |  | `user_id` |
| `job` | Zakázka | record | ano | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `task` | Úkol | record | ne | vazba na [`task`](ukoly.md#task) |  |  |  | `task_id` |
| `minutes` | Minuty | number | ano |  |  | min 1 | součet | `minutes` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |
