# Entity modulu Sklad

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Sklad](../moduly/sklad.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## stock_item

**Skladová karta** (množné číslo: Skladové karty).

- **Modul:** [Sklad](../moduly/sklad.md)
- **Tabulka:** `stock_item` ([databáze](../databaze/sklad.md))
- **Seznam:** `/sklad/karty`, detail `/sklad/karty/<id>`
- **Oprávnění:** read: `sklad.read`, write: `sklad.write`
- **Název záznamu:** `name`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterCreate`, `afterUpdate`, `beforeDelete`, `search`
- **Definice:** `packages/modules/sklad/src/entities.ts`

### Pole entity `stock_item`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `code` | Kód | text | ano |  |  |  |  | `code` |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `category` | Kategorie | select | ne | číselník `sklad.category` |  |  |  | `category` |
| `unit` | Jednotka | select | ano | číselník `sklad.unit` |  | výchozí `ks` |  | `unit` |
| `totalQty` | Skladem | number | ne |  |  |  | jen pro čtení | `total_qty` |
| `minQty` | Minimum | number | ne |  |  | min 0 |  | `min_qty` |
| `belowMin` | Pod minimem | checkbox | ne |  |  |  | jen pro čtení | `below_min` |
| `avgCost` | Průměrná cena | currency | ne |  | `sklad.write` |  | jen pro čtení | `avg_cost_minor` |
| `lastPrice` | Poslední nákupní cena | currency | ne |  | `sklad.write` |  |  | `last_price_minor` |
| `value` | Hodnota zásoby | currency | ne |  | `sklad.write` |  | jen pro čtení, součet | `value_minor` |
| `supplier` | Dodavatel | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `supplier_id` |
| `ean` | EAN | text | ne |  |  |  |  | `ean` |
| `vatRate` | DPH (%) | number | ne |  |  | min 0, max 100 |  | `vat_rate` |
| `active` | Aktivní | checkbox | ne |  |  |  |  | `active` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## warehouse

**Umístění** (množné číslo: Umístění).

- **Modul:** [Sklad](../moduly/sklad.md)
- **Tabulka:** `warehouse` ([databáze](../databaze/sklad.md))
- **Seznam:** `/sklad/umisteni`, detail `/sklad/umisteni/<id>`
- **Oprávnění:** read: `sklad.read`, write: `sklad.write`
- **Název záznamu:** `name`
- **Háčky a rozšíření entity:** `afterUpdate`, `beforeDelete`, `search`
- **Definice:** `packages/modules/sklad/src/entities.ts`

### Pole entity `warehouse`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `kind` | Typ | select | ano | `warehouse`, `workshop`, `vehicle`, `site` |  | výchozí `warehouse` |  | `kind` |
| `responsible` | Odpovídá | user | ne |  |  |  |  | `responsible_id` |
| `job` | Zakázka (stavba) | record | ne | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `asset` | Vozidlo | record | ne | vazba na [`asset`](stroje.md#asset) |  |  |  | `asset_id` |
| `active` | Aktivní | checkbox | ne |  |  |  |  | `active` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## stock_doc

**Skladový doklad** (množné číslo: Skladové doklady).

- **Modul:** [Sklad](../moduly/sklad.md)
- **Tabulka:** `stock_doc` ([databáze](../databaze/sklad.md))
- **Seznam:** `/sklad/doklady`, detail `/sklad/doklady/<id>`
- **Oprávnění:** read: `sklad.read`, write: `sklad.write`
- **Název záznamu:** `number`
- **Vytvoření:** jen příkazy modulu (Doklady vznikají zaúčtováním na stránce Sklad.)
- **Smazání:** nelze (Skladové doklady se nemažou. Chybu opravte vratkou nebo inventurním rozdílem.)
- **Háčky a rozšíření entity:** `search`
- **Definice:** `packages/modules/sklad/src/entities.ts`

### Pole entity `stock_doc`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `number` | Číslo | text | ne |  |  |  | jen pro čtení | `number` |
| `type` | Typ | select | ne | `receipt`, `issue`, `transfer`, `return`, `adjustment` |  |  | jen pro čtení | `type` |
| `date` | Datum | date | ne |  |  |  | jen pro čtení | `date` |
| `warehouse` | Umístění | record | ne | vazba na [`warehouse`](sklad.md#warehouse) |  |  | jen pro čtení | `warehouse_id` |
| `target` | Cílové umístění | record | ne | vazba na [`warehouse`](sklad.md#warehouse) |  |  | jen pro čtení | `target_warehouse_id` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  | jen pro čtení | `job_id` |
| `supplier` | Dodavatel | record | ne | vazba na [`company`](kontakty.md#company) |  |  | jen pro čtení | `supplier_id` |
| `total` | Hodnota | currency | ne |  | `sklad.write` |  | jen pro čtení, součet | `total_minor` |
| `lineCount` | Položek | number | ne |  |  |  | jen pro čtení | `line_count` |
| `supplierDocNo` | Doklad dodavatele | text | ne |  |  |  | jen pro čtení | `supplier_doc_no` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## purchase_order

**Objednávka** (množné číslo: Objednávky).

- **Modul:** [Sklad](../moduly/sklad.md)
- **Tabulka:** `purchase_order` ([databáze](../databaze/sklad.md))
- **Seznam:** `/sklad/objednavky`, detail `/sklad/objednavky/<id>`
- **Oprávnění:** read: `sklad.read`, write: `sklad.write`
- **Název záznamu:** `number`
- **Vytvoření:** jen příkazy modulu
- **Háčky a rozšíření entity:** `beforeDelete`, `search`
- **Definice:** `packages/modules/sklad/src/entities.ts`

### Pole entity `purchase_order`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `number` | Číslo | text | ne |  |  |  | jen pro čtení | `number` |
| `supplier` | Dodavatel | record | ne | vazba na [`company`](kontakty.md#company) |  |  | jen pro čtení | `supplier_id` |
| `status` | Stav | select | ne | `draft`, `sent`, `partial`, `received`, `cancelled` |  |  | jen pro čtení | `status` |
| `date` | Vystaveno | date | ne |  |  |  | jen pro čtení | `date` |
| `expectedDate` | Očekávaná dodávka | date | ne |  |  |  |  | `expected_date` |
| `warehouse` | Příjem do | record | ne | vazba na [`warehouse`](sklad.md#warehouse) |  |  | jen pro čtení | `warehouse_id` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  | jen pro čtení | `job_id` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## stock_count

**Inventura** (množné číslo: Inventury).

- **Modul:** [Sklad](../moduly/sklad.md)
- **Tabulka:** `stock_count` ([databáze](../databaze/sklad.md))
- **Seznam:** `/sklad/inventury`, detail `/sklad/inventury/<id>`
- **Oprávnění:** read: `sklad.read`, write: `sklad.inventory`
- **Název záznamu:** `number`
- **Vytvoření:** jen příkazy modulu
- **Háčky a rozšíření entity:** `beforeDelete`, `search`
- **Definice:** `packages/modules/sklad/src/entities.ts`

### Pole entity `stock_count`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `number` | Číslo | text | ne |  |  |  | jen pro čtení | `number` |
| `warehouse` | Umístění | record | ne | vazba na [`warehouse`](sklad.md#warehouse) |  |  | jen pro čtení | `warehouse_id` |
| `status` | Stav | select | ne | `open`, `closed` |  |  | jen pro čtení | `status` |
| `createdAt` | Založena | date | ne |  |  |  | jen pro čtení | `created_at` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |
