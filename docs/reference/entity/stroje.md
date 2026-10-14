# Entity modulu Stroje a vozidla

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Stroje a vozidla](../moduly/stroje.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## asset

**Stroj nebo vozidlo** (množné číslo: Stroje a vozidla).

- **Modul:** [Stroje a vozidla](../moduly/stroje.md)
- **Tabulka:** `asset` ([databáze](../databaze/stroje.md))
- **Seznam:** `/stroje/evidence`, detail `/stroje/evidence/<id>`
- **Oprávnění:** read: `stroje.read`, write: `stroje.write`
- **Název záznamu:** `name`
- **Rozsah „jen moje“:** sloupce `responsible_id`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterUpdate`, `beforeDelete`, `search`
- **Definice:** `packages/modules/stroje/src/entities.ts`

### Pole entity `asset`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `kind` | Druh | select | ano | `car`, `van`, `truck`, `excavator`, `loader`, `roller`, `trailer`, `small` |  | výchozí `van` |  | `kind` |
| `plate` | SPZ | text | ne |  |  |  |  | `plate` |
| `status` | Stav | select | ne | `active`, `service`, `retired` |  |  |  | `status` |
| `responsible` | Odpovídá | user | ne |  |  |  |  | `responsible_id` |
| `meter` | Měří se v | select | ano | `km`, `mth` |  | výchozí `km` |  | `meter` |
| `meterValue` | Stav tachometru | number | ne |  |  |  |  | `meter_value` |
| `stkDate` | STK do | date | ne |  |  |  |  | `stk_date` |
| `insuranceDate` | Ručení do | date | ne |  |  |  |  | `insurance_date` |
| `vignetteDate` | Známka do | date | ne |  |  |  |  | `vignette_date` |
| `fuel` | Palivo | select | ano | `diesel`, `petrol`, `lpg`, `electric`, `none` |  | výchozí `diesel` |  | `fuel` |
| `tankLiters` | Nádrž (l) | number | ne |  |  | min 0, max 100000 |  | `tank_liters` |
| `brand` | Značka | text | ne |  |  |  |  | `brand` |
| `model` | Model | text | ne |  |  |  |  | `model` |
| `year` | Rok výroby | number | ne |  |  | min 1900, max 2100 |  | `year` |
| `vin` | VIN / výrobní číslo | text | ne |  |  |  |  | `vin` |
| `internalRate` | Interní sazba (za km / mth) | currency | ne |  | `stroje.write` | min 0 |  | `internal_rate_minor` |
| `purchaseDate` | Pořízeno | date | ne |  |  |  |  | `purchase_date` |
| `purchasePrice` | Pořizovací cena | currency | ne |  | `stroje.write` | min 0 |  | `purchase_price_minor` |
| `fuelCard` | Palivová karta | text | ne |  |  |  |  | `fuel_card` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## asset_defect

**Závada** (množné číslo: Závady).

- **Modul:** [Stroje a vozidla](../moduly/stroje.md)
- **Tabulka:** `asset_defect` ([databáze](../databaze/stroje.md))
- **Seznam:** `/stroje/zavady`, detail `/stroje/zavady/<id>`
- **Oprávnění:** read: `stroje.read`, write: `stroje.write`
- **Název záznamu:** `title`
- **Vytvoření:** jen příkazy modulu (Závadu nahlaste tlačítkem „Nahlásit závadu“ na stránce Stroje.)
- **Smazání:** nelze (Závady se nemažou, jsou součástí historie stroje. Označte je za vyřešené.)
- **Háčky a rozšíření entity:** `search`
- **Definice:** `packages/modules/stroje/src/entities.ts`

### Pole entity `asset_defect`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | Závada | text | ne |  |  |  | jen pro čtení | `title` |
| `asset` | Stroj | record | ne | vazba na [`asset`](stroje.md#asset) |  |  | jen pro čtení | `asset_id` |
| `severity` | Závažnost | select | ne | `normal`, `blocking` |  |  | jen pro čtení | `severity` |
| `status` | Stav | select | ne | `open`, `resolved` |  |  | jen pro čtení | `status` |
| `reportedBy` | Nahlásil(a) | user | ne |  |  |  | jen pro čtení | `reported_by` |
| `createdAt` | Nahlášeno | date | ne |  |  |  | jen pro čtení | `created_at` |
| `description` | Popis | longtext | ne |  |  |  |  | `description` |
| `resolution` | Řešení | longtext | ne |  |  |  | jen pro čtení | `resolution` |
