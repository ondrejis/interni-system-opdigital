# Příkazy modulu Stroje a vozidla

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Stroje a vozidla](../moduly/stroje.md). Počet příkazů: 20.

### stroje.assetCosts

Náklady stroje za posledních 12 měsíců: palivo bez DPH, servis a provoz; na jednotku.

- **Oprávnění:** `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `assetId` | uuid | ano |  |  |  |

### stroje.defect.report

Hlášení z terénu: závada, úkol odpovědné osobě; blokující závada stroj odstaví.

- **Oprávnění:** `stroje.log` nebo `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `assetId` | uuid | ano |  |  |  |
| `title` | text | ano |  | délka 3–200 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `severity` | enum | ano | `normal`, `blocking` |  |  |

### stroje.defect.resolve

- **Oprávnění:** `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `resolution` | text (nebo null) | ne |  | délka ≤ 1000 |  |

### stroje.fleet

Přehled vozového parku: karty se stavem, termíny, závadami a dnešní rezervací.

- **Oprávnění:** `stroje.read` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `includeRetired` | ano/ne | ne |  |  |  |

### stroje.fuel

- **Oprávnění:** `stroje.read` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `assetId` | uuid | ne |  |  |  |
| `month` | text | ne |  | vzor `^\d{4}-\d{2}$` |  |

### stroje.fuel.delete

- **Oprávnění:** `stroje.log` nebo `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### stroje.fuel.save

- **Oprávnění:** `stroje.log` nebo `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `assetId` | uuid | ano |  |  |  |
| `date` | datum | ano |  |  |  |
| `userId` | uuid (nebo null) | ne |  |  |  |
| `liters` | číslo | ano |  | hodnota 0–2000 |  |
| `totalMinor` | celé číslo | ano |  | hodnota 0–1000000000000 |  |
| `meterValue` | číslo (nebo null) | ne |  | hodnota 0–99999999 |  |
| `fullTank` | ano/ne | ano |  |  |  |
| `station` | text (nebo null) | ne |  | délka ≤ 120 |  |
| `payment` | enum | ano | `card`, `cash` |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `vatRate` | číslo | ne |  | hodnota 0–30 |  |

### stroje.interval.delete

- **Oprávnění:** `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### stroje.interval.save

- **Oprávnění:** `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `assetId` | uuid | ano |  |  |  |
| `title` | text | ano |  | délka 2–120 |  |
| `everyMeter` | celé číslo (nebo null) | ne |  | hodnota 1–10000000 |  |
| `everyMonths` | celé číslo (nebo null) | ne |  | hodnota 1–600 |  |
| `lastDate` | datum (nebo null) | ne |  |  |  |
| `lastMeter` | číslo (nebo null) | ne |  | hodnota 0–99999999 |  |

### stroje.jobFleet

Stroje na zakázce: provoz × interní sazba, palivo účtované na zakázku, rezervace.

- **Oprávnění:** `stroje.read` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### stroje.lastMeter

Poslední stav tachometru a trasa pro předvyplnění formuláře.

- **Oprávnění:** `stroje.log` nebo `stroje.write` nebo `stroje.read` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `assetId` | uuid | ano |  |  |  |

### stroje.log.delete

- **Oprávnění:** `stroje.log` nebo `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### stroje.log.save

- **Oprávnění:** `stroje.log` nebo `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `assetId` | uuid | ano |  |  |  |
| `date` | datum | ano |  |  |  |
| `userId` | uuid (nebo null) | ne |  |  |  |
| `meterStart` | číslo (nebo null) | ne |  | hodnota 0–99999999 |  |
| `meterEnd` | číslo (nebo null) | ne |  | hodnota 0–99999999 |  |
| `amount` | číslo (nebo null) | ne |  | hodnota 0–99999999 |  |
| `route` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `purpose` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `private` | ano/ne | ne |  |  |  |

### stroje.logs

- **Oprávnění:** `stroje.read` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `assetId` | uuid | ne |  |  |  |
| `month` | text | ne |  | vzor `^\d{4}-\d{2}$` |  |
| `userId` | uuid | ne |  |  |  |

### stroje.options

Stroje pro výběr ve formulářích a údaje o přihlášeném.

- **Oprávnění:** `stroje.read` nebo `stroje.log` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

_Bez vstupních polí._

### stroje.reservation.delete

- **Oprávnění:** `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### stroje.reservation.save

- **Oprávnění:** `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `assetId` | uuid | ano |  |  |  |
| `dateFrom` | datum | ano |  |  |  |
| `dateTo` | datum | ano |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `userId` | uuid (nebo null) | ne |  |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 300 |  |

### stroje.reservations

- **Oprávnění:** `stroje.read` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `from` | datum | ano |  |  |  |
| `to` | datum | ano |  |  |  |
| `assetId` | uuid | ne |  |  |  |

### stroje.service

- **Oprávnění:** `stroje.read` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `assetId` | uuid | ano |  |  |  |

### stroje.service.save

- **Oprávnění:** `stroje.write` (stačí kterékoli)
- **Definice:** `packages/modules/stroje/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `assetId` | uuid | ano |  |  |  |
| `date` | datum | ano |  |  |  |
| `kind` | enum | ano | `service`, `repair`, `tires`, `inspection`, `other` |  |  |
| `title` | text | ano |  | délka 2–200 |  |
| `vendor` | text (nebo null) | ne |  | délka ≤ 120 |  |
| `costMinor` | celé číslo (nebo null) | ne |  | hodnota 0–1000000000000 |  |
| `meterValue` | číslo (nebo null) | ne |  | hodnota 0–99999999 |  |
| `intervalId` | uuid (nebo null) | ne |  |  |  |
| `nextStkDate` | datum (nebo null) | ne |  |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 500 |  |
