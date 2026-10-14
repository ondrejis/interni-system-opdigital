# Entity modulu Docházka

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Docházka](../moduly/dochazka.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## time_entry

**Záznam docházky** (množné číslo: Záznamy docházky).

- **Modul:** [Docházka](../moduly/dochazka.md)
- **Tabulka:** `time_entry` ([databáze](../databaze/dochazka.md))
- **Seznam:** `/dochazka/zaznamy`, detail `/dochazka/zaznamy/<id>`
- **Oprávnění:** read: `dochazka.read`, write: `dochazka.approve`
- **Název záznamu:** `date`
- **Rozsah „jen moje“:** sloupce `user_id`
- **Vytvoření:** jen příkazy modulu (Docházku zapisujte na stránce Docházka (týden, píchačka).)
- **Smazání:** nelze (Docházku zapisujte na stránce Docházka (týden, píchačka).)
- **Háčky a rozšíření entity:** `beforeCreate`, `afterUpdate`, `beforeDelete`, `search`
- **Definice:** `packages/modules/dochazka/src/server.ts`

### Pole entity `time_entry`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `date` | Datum | date | ne |  |  |  | jen pro čtení | `date` |
| `user` | Zaměstnanec | user | ne |  |  |  | jen pro čtení | `user_id` |
| `kind` | Druh | select | ne | `work`, `travel`, `workshop`, `admin`, `vacation`, `sick`, `doctor`, `holiday`, `comp` |  |  | jen pro čtení | `kind` |
| `minutes` | Minuty | number | ne |  |  |  | jen pro čtení, součet | `minutes` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  | jen pro čtení | `job_id` |
| `status` | Stav | select | ne | `draft`, `submitted`, `approved`, `returned` |  |  | jen pro čtení | `status` |
| `note` | Poznámka | text | ne |  |  |  | jen pro čtení | `note` |
| `source` | Zdroj | select | ne | `manual`, `clock` |  |  | jen pro čtení | `source` |
