# Entity modulu Obchody

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Obchody](../moduly/obchody.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## deal

**Obchod** (množné číslo: Obchody). Obchod (příležitost) v pipeline `deal/default` (kanban podle atributu `status`). Výsledek (`result`) určují příkazy `win`/`lose`/`reopen`; fáze se přesouvá `moveStage`. Systémová pole píše modul Úkoly, `first_opened_at` příkaz `markOpened`.

- **Modul:** [Obchody](../moduly/obchody.md)
- **Tabulka:** `deal` ([databáze](../databaze/obchody.md))
- **Seznam:** `/obchody`, detail `/obchody/<id>`
- **Oprávnění:** read: `obchody.read`, write: `obchody.write`, create: `obchody.create`, delete: `obchody.delete`, export: `obchody.export`
- **Název záznamu:** `title`, stav (kanban): `status`
- **Rozsah „jen moje“:** sloupce `owner_id`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `search`, `ownerDefaults`
- **Definice:** `packages/modules/obchody/src/entities.ts`

### Pole entity `deal`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | Název | text | ano |  |  |  |  | `title` |
| `company` | Organizace | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `person` | Kontakt | record | ne | vazba na [`person`](kontakty.md#person) |  |  |  | `person_id` |
| `status` | Fáze | status | ano | pipeline `deal/default` |  |  |  | `stage_id` |
| `value` | Hodnota | currency | ne |  |  | min 0 | součet | `value_minor` |
| `weighted` | Vážená hodnota | currency | ne |  |  |  | jen pro čtení, součet | `weighted_minor` |
| `services` | Služby | multiselect | ne | `web`, `marketing`, `systemy` |  |  |  | `services` |
| `owner` | Vlastník | user | ne |  |  |  |  | `owner_id` |
| `expectedCloseDate` | Očekávané uzavření | date | ne |  |  |  |  | `expected_close_date` |
| `nextActivityAt` | Další aktivita | date | ne |  |  |  | jen pro čtení | `next_activity_at` |
| `result` | Výsledek | select | ne | `open`, `won`, `lost` |  | výchozí `open` | jen pro čtení | `result` |
| `source` | Zdroj | select | ne | `manual`, `meta`, `web_form`, `referral`, `other` |  | výchozí `manual` |  | `source` |
| `sourceDetail` | Detail zdroje | text | ne |  |  |  |  | `source_detail` |
| `lastActivityAt` | Poslední aktivita | date | ne |  |  |  | jen pro čtení | `last_activity_at` |
| `stageEnteredAt` | Ve fázi od | date | ne |  |  |  | jen pro čtení | `stage_entered_at` |
| `wonAt` | Vyhráno | date | ne |  |  |  | jen pro čtení | `won_at` |
| `lostAt` | Prohráno | date | ne |  |  |  | jen pro čtení | `lost_at` |
| `lostReason` | Důvod prohry | select | ne | číselník `deal.lost_reason` |  |  |  | `lost_reason` |
| `lostNote` | Poznámka k prohře | longtext | ne |  |  |  |  | `lost_note` |
| `firstOpenedAt` | Poprvé otevřeno | date | ne |  |  |  | jen pro čtení | `first_opened_at` |
| `tags` | Štítky | multiselect | ne | číselník `tag` |  |  |  | `tags` |

#### Výchozí pipeline „Obchody“ (`default`)

| Pořadí | Stav | Barva | Druh | Fáze |
| --- | --- | --- | --- | --- |
| 1 | Nová poptávka | gray |  |  |
| 2 | Kontaktováno | blue |  |  |
| 3 | Schůzka / konzultace | teal |  |  |
| 4 | Nabídka odeslaná | indigo |  |  |
| 5 | Vyjednávání | orange |  |  |
