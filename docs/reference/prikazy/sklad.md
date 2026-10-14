# Příkazy modulu Sklad

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Sklad](../moduly/sklad.md). Počet příkazů: 17.

### sklad.count

Řádky inventury s aktuálním stavem (stav se bere v okamžiku uzavření, ne založení).

- **Oprávnění:** `sklad.read` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### sklad.count.addLine

Přidá do otevřené inventury položku, která v systému na umístění není (nalezená zásoba).

- **Oprávnění:** `sklad.inventory` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `countId` | uuid | ano |  |  |  |
| `itemId` | uuid | ano |  |  |  |

### sklad.count.close

Uzavře inventuru a rozdíly (napočítáno − aktuální stav) zaúčtuje inventurním dokladem.

- **Oprávnění:** `sklad.inventory` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### sklad.count.saveLine

- **Oprávnění:** `sklad.inventory` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `lineId` | uuid | ano |  |  |  |
| `counted` | string \| number \| null | ano |  |  |  |

### sklad.count.start

- **Oprávnění:** `sklad.inventory` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `warehouseId` | uuid | ano |  |  |  |

### sklad.doc

Řádky dokladu.

- **Oprávnění:** `sklad.read` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### sklad.itemDetail

Stavy po umístěních a posledních 100 pohybů jedné karty.

- **Oprávnění:** `sklad.read` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### sklad.jobMaterial

Čistá spotřeba materiálu na zakázce (výdej − vratky).

- **Oprávnění:** `sklad.read` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### sklad.options

Podklady pro formuláře dokladů: umístění a aktivní karty se stavy po umístěních.

- **Oprávnění:** `sklad.read` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

_Bez vstupních polí._

### sklad.order

Příjemky k objednávce (kolik se kdy přijalo).

- **Oprávnění:** `sklad.read` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### sklad.order.create

- **Oprávnění:** `sklad.write` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `supplierId` | uuid | ano |  |  |  |
| `warehouseId` | uuid | ano |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `expectedDate` | datum (nebo null) | ne |  |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 500 |  |
| `send` | ano/ne | ano |  |  |  |
| `lines` | pole objektů | ano |  | počet 1–300 |  |
| `lines[].itemId` | uuid | ano |  |  |  |
| `lines[].qty` | string \| number | ano |  |  |  |
| `lines[].unitPriceMinor` | celé číslo (nebo null) | ne |  | hodnota 0–1000000000000 |  |

### sklad.order.receive

Příjem objednávky (i částečný): zaúčtuje příjemku, zvýší přijaté množství a přepočítá stav objednávky.

- **Oprávnění:** `sklad.write` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `supplierDocNo` | text (nebo null) | ne |  | délka ≤ 60 |  |
| `lines` | pole objektů | ano |  | počet ≤ 300 |  |
| `lines[].lineId` | uuid | ano |  |  |  |
| `lines[].qty` | string \| number | ano |  |  |  |
| `lines[].unitPriceMinor` | celé číslo (nebo null) | ne |  | hodnota 0–1000000000000 |  |

### sklad.order.setStatus

- **Oprávnění:** `sklad.write` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `status` | enum | ano | `sent`, `cancelled` |  |  |

### sklad.overview

Přehled zásob se stavy po umístěních a souhrnem.

- **Oprávnění:** `sklad.read` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `q` | text | ne |  | délka ≤ 100 |  |
| `category` | text | ne |  | délka ≤ 80 |  |
| `warehouseId` | uuid | ne |  |  |  |
| `lowOnly` | ano/ne | ne |  |  |  |

### sklad.post

- **Oprávnění:** `sklad.write` nebo `sklad.issue` nebo `sklad.inventory` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `type` | enum | ano | `receipt`, `issue`, `transfer`, `return`, `adjustment` |  |  |
| `date` | datum | ano |  |  |  |
| `warehouseId` | uuid | ano |  |  |  |
| `targetWarehouseId` | uuid (nebo null) | ne |  |  |  |
| `supplierId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `supplierDocNo` | text (nebo null) | ne |  | délka ≤ 60 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 500 |  |
| `lines` | pole objektů | ano |  | počet 1–500 |  |
| `lines[].itemId` | uuid | ano |  |  |  |
| `lines[].qty` | string \| number | ano |  |  |  |
| `lines[].unitPriceMinor` | celé číslo (nebo null) | ne |  | hodnota 0–1000000000000 |  |

### sklad.terminal.items

Hledání skladových karet pro rychlý výdej v terminálu: název, kód nebo EAN (bez ohledu na diakritiku), jen aktivní karty s množstvím na skladě. Vrací jen to, co k výdeji řemeslník potřebuje; ceny nikdy.

- **Oprávnění:** `sklad.issue` nebo `sklad.read` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/terminal.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `q` | text | ne |  | délka ≤ 80; výchozí `""` |  |

### sklad.warehouseStock

Zásoby na jednom umístění.

- **Oprávnění:** `sklad.read` (stačí kterékoli)
- **Definice:** `packages/modules/sklad/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
