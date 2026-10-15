# Příkazy modulu Finance

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Finance](../moduly/finance.md). Počet příkazů: 25.

### finance.balance

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `basis` | enum | ne | `paid`, `issued` |  |  |

### finance.balance.months

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `basis` | enum | ne | `paid`, `issued` |  |  |
| `month` | text | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |

### finance.client.overview

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |
| `year` | celé číslo | ne |  | hodnota 2000–2200 |  |

### finance.job.overview

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### finance.payment.create

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.payments_write` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `description` | text | ano |  | délka 1–200 |  |
| `kind` | enum | ne | `one_off`, `intro`, `retainer`, `extra` | výchozí `"one_off"` |  |
| `amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `issuerId` | uuid | ano |  |  |  |
| `periodMonth` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `issuedOn` | datum (nebo null) | ne |  |  |  |
| `dueOn` | datum (nebo null) | ne |  |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `status` | enum | ne | `planned`, `issued`, `paid` | výchozí `"planned"` |  |
| `invoiceNumber` | text (nebo null) | ne |  | délka ≤ 80 |  |
| `invoiceUrl` | text (nebo null) | ne |  | délka ≤ 500 |  |
| `paidOn` | datum (nebo null) | ne |  |  |  |
| `allocations` | pole objektů | ne |  | počet ≤ 10 |  |
| `allocations[].userId` | uuid | ano |  |  |  |
| `allocations[].amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `confirmRecalc` | ano/ne | ne |  | výchozí `false` |  |

### finance.payment.get

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### finance.payment.list

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `period` | objekt | ne |  |  |  |
| `period.from` | datum | ne |  |  |  |
| `period.to` | datum | ne |  |  |  |
| `dateField` | enum | ne | `effective`, `issued`, `paid`, `due` | výchozí `"effective"` |  |
| `statuses` | pole (enum) | ne | `planned`, `issued`, `paid`, `canceled` | počet ≤ 4 |  |
| `kinds` | pole (enum) | ne | `one_off`, `intro`, `retainer`, `extra`, `recurring` | počet ≤ 5 |  |
| `issuerId` | uuid | ne |  |  |  |
| `jobType` | enum | ne | `web`, `marketing`, `systemy` |  |  |
| `companyId` | uuid | ne |  |  |  |
| `jobId` | uuid | ne |  |  |  |
| `overdueOnly` | ano/ne | ne |  | výchozí `false` |  |
| `search` | text | ne |  | délka ≤ 120 |  |
| `includePrivate` | ano/ne | ne |  | výchozí `true` |  |
| `sort` | enum | ne | `createdAt`, `description`, `amountMinor`, `status`, `dueOn`, `issuedOn`, `paidOn` | výchozí `"createdAt"` |  |
| `direction` | enum | ne | `asc`, `desc` | výchozí `"desc"` |  |
| `limit` | celé číslo | ne |  | hodnota 1–500; výchozí `100` |  |
| `offset` | celé číslo | ne |  | hodnota ≥ 0; výchozí `0` |  |

### finance.payment.overrideAllocation

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.splits_edit` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `allocations` | pole objektů (nebo null) | ano |  | počet ≤ 10 |  |
| `allocations[].userId` | uuid | ano |  |  |  |
| `allocations[].amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `confirmRecalc` | ano/ne | ne |  | výchozí `false` |  |

### finance.payment.recalc

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.payments_write` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `confirmRecalc` | ano/ne | ne |  | výchozí `false` |  |

### finance.payment.transition

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.payments_write` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `to` | enum | ano | `planned`, `issued`, `paid`, `canceled` |  |  |
| `invoiceNumber` | text (nebo null) | ne |  | délka ≤ 80 |  |
| `invoiceUrl` | text (nebo null) | ne |  | délka ≤ 500 |  |
| `issuedOn` | datum (nebo null) | ne |  |  |  |
| `dueOn` | datum (nebo null) | ne |  |  |  |
| `paidOn` | datum (nebo null) | ne |  |  |  |
| `confirmRecalc` | ano/ne | ne |  | výchozí `false` |  |

### finance.payment.update

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.payments_write` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `description` | text | ne |  | délka 1–200 |  |
| `kind` | enum | ne | `one_off`, `intro`, `retainer`, `extra` |  |  |
| `amountMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `issuerId` | uuid | ne |  |  |  |
| `periodMonth` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `issuedOn` | datum (nebo null) | ne |  |  |  |
| `dueOn` | datum (nebo null) | ne |  |  |  |
| `paidOn` | datum (nebo null) | ne |  |  |  |
| `invoiceNumber` | text (nebo null) | ne |  | délka ≤ 80 |  |
| `invoiceUrl` | text (nebo null) | ne |  | délka ≤ 500 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `allocations` | pole objektů | ne |  | počet ≤ 10 |  |
| `allocations[].userId` | uuid | ano |  |  |  |
| `allocations[].amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `resetAllocation` | ano/ne | ne |  |  |  |
| `confirmRecalc` | ano/ne | ne |  | výchozí `false` |  |

### finance.reports

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `year` | celé číslo | ne |  | hodnota 2000–2200 |  |
| `includePrivate` | ano/ne | ne |  | výchozí `false` |  |
| `basis` | enum | ne | `paid`, `issued` | výchozí `"paid"` |  |

### finance.retainer.change

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.payments_write` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `effectiveFrom` | text | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `amountMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `issueDay` | celé číslo | ne |  | hodnota 1–28 |  |
| `issuerMode` | enum | ne | `fixed`, `alternate` |  |  |
| `issuerId` | uuid | ne |  |  |  |
| `firstIssuerId` | uuid (nebo null) | ne |  |  |  |
| `split` | pole objektů | ne |  | počet ≤ 30 |  |
| `split[].userId` | uuid | ano |  |  |  |
| `split[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `split[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `split[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `split[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `split[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `split[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |

### finance.retainer.continue

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.payments_write` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `fromMonth` | text | ano |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `issueDay` | celé číslo | ano |  | hodnota 1–28 |  |
| `issuerMode` | enum | ano | `fixed`, `alternate` |  |  |
| `issuerId` | uuid | ano |  |  |  |
| `firstIssuerId` | uuid | ne |  |  |  |
| `split` | pole objektů | ne |  | počet ≤ 30 |  |
| `split[].userId` | uuid | ano |  |  |  |
| `split[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `split[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `split[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `split[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `split[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `split[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |

### finance.retainer.end

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.payments_write` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `endMonth` | text | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `cancelPlanned` | ano/ne | ne |  | výchozí `true` |  |
| `closeJob` | ano/ne | ne |  | výchozí `true` |  |

### finance.retainer.endPreview

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `endMonth` | text | ano |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |

### finance.settings.get

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

_Bez vstupních polí._

### finance.settings.set

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.settings` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `balanceBasis` | enum | ne | `paid`, `issued` |  |  |
| `defaultSplit` | pole objektů (nebo null) | ne |  | počet ≤ 30 |  |
| `defaultSplit[].userId` | uuid | ano |  |  |  |
| `defaultSplit[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `defaultSplit[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `defaultSplit[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `defaultSplit[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `defaultSplit[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `defaultSplit[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |

### finance.settlement.cancel

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.settlements_write` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `reason` | text | ne |  | délka ≤ 500 |  |

### finance.settlement.create

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.settlements_write` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `fromUserId` | uuid | ano |  |  |  |
| `toUserId` | uuid | ano |  |  |  |
| `amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `settledOn` | datum | ano |  |  |  |
| `method` | enum | ano | `invoice`, `transfer`, `offset` |  |  |
| `reference` | text (nebo null) | ne |  | délka ≤ 120 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |

### finance.settlement.list

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `includeCanceled` | ano/ne | ne |  | výchozí `true` |  |
| `limit` | celé číslo | ne |  | hodnota 1–500; výchozí `100` |  |

### finance.split.default

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

_Bez vstupních polí._

### finance.split.get

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### finance.split.preview

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.read` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `amountMinor` | celé číslo | ne |  | hodnota ≥ 0; výchozí `1000000` |  |
| `kind` | enum | ne | `one_off`, `intro`, `retainer`, `extra` | výchozí `"one_off"` |  |
| `issuerId` | uuid | ne |  |  |  |
| `month` | text | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `rules` | pole objektů | ano |  | počet ≤ 30 |  |
| `rules[].userId` | uuid | ano |  |  |  |
| `rules[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `rules[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `rules[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `rules[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `rules[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `rules[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |

### finance.split.set

Příkazy modulu „finance“ (platby, pravidla rozdělení, retainer, vyrovnání, přehledy, nastavení).

- **Oprávnění:** `finance.splits_edit` (stačí kterékoli)
- **Definice:** `packages/modules/finance/src/data/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `rules` | pole objektů | ano |  | počet ≤ 30 |  |
| `rules[].userId` | uuid | ano |  |  |  |
| `rules[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `rules[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `rules[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `rules[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `rules[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `rules[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `confirmRecalc` | ano/ne | ne |  | výchozí `false` |  |
