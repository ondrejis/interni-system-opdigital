# Příkazy modulu Docházka

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Docházka](../moduly/dochazka.md). Počet příkazů: 17.

### dochazka.approvals

- **Oprávnění:** `dochazka.approve` (stačí kterékoli)
- **Definice:** `packages/modules/dochazka/src/server.ts`

_Bez vstupních polí._

### dochazka.clock.break

- **Oprávnění:** `dochazka.own` (stačí kterékoli)
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `action` | enum | ano | `start`, `end` |  |  |
| `at` | datum a čas (nebo null) | ne |  |  |  |

### dochazka.clock.in

- **Oprávnění:** `dochazka.own` (stačí kterékoli)
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `kind` | enum | ne | `work`, `travel`, `workshop`, `admin` | výchozí `"work"` |  |
| `note` | text (nebo null) | ne |  | délka ≤ 500 |  |
| `at` | datum a čas (nebo null) | ne |  |  |  |

### dochazka.clock.out

- **Oprávnění:** `dochazka.own` (stačí kterékoli)
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `note` | text (nebo null) | ne |  | délka ≤ 500 |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `at` | datum a čas (nebo null) | ne |  |  |  |

### dochazka.clock.status

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/dochazka/src/server.ts`

_Bez vstupních polí._

### dochazka.delete

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### dochazka.lockMonth

- **Oprávnění:** `dochazka.close_month` (stačí kterékoli)
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `month` | text | ano |  | vzor `^\d{4}-\d{2}$` |  |
| `locked` | ano/ne | ano |  |  |  |

### dochazka.month

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `month` | text | ano |  | vzor `^\d{4}-\d{2}$` |  |
| `userId` | uuid | ne |  |  |  |

### dochazka.report

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `month` | text | ano |  | vzor `^\d{4}-\d{2}$` |  |

### dochazka.reviewWeek

- **Oprávnění:** `dochazka.approve` (stačí kterékoli)
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `userId` | uuid | ano |  |  |  |
| `weekStart` | datum | ano |  |  |  |
| `decision` | enum | ano | `approve`, `return` |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 500 |  |

### dochazka.save

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `userId` | uuid (nebo null) | ne |  |  |  |
| `date` | datum | ano |  |  |  |
| `kind` | enum | ano | `work`, `travel`, `workshop`, `admin`, `vacation`, `sick`, `doctor`, `holiday`, `comp` |  |  |
| `startTime` | text (nebo null) | ne |  | vzor `^\d{2}:\d{2}$` |  |
| `endTime` | text (nebo null) | ne |  | vzor `^\d{2}:\d{2}$` |  |
| `breakMinutes` | celé číslo | ne |  | hodnota 0–240; výchozí `0` |  |
| `hours` | číslo (nebo null) | ne |  | hodnota 0–24 |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `phaseId` | uuid (nebo null) | ne |  |  |  |
| `note` | text (nebo null) | ne |  | délka ≤ 500 |  |

### dochazka.settings.get

- **Oprávnění:** `settings.manage` (stačí kterékoli)
- **Definice:** `packages/modules/dochazka/src/server.ts`

_Bez vstupních polí._

### dochazka.settings.save

- **Oprávnění:** `settings.manage` (stačí kterékoli)
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `hoursPerDay` | číslo | ano |  | hodnota 1–24 |  |
| `workDays` | pole (celé číslo) | ano |  | počet 1–7 |  |
| `requireApproval` | ano/ne | ano |  |  |  |
| `defaultHourlyCostMinor` | celé číslo | ano |  | hodnota 0–10000000 |  |
| `reminder` | ano/ne | ano |  |  |  |

### dochazka.submitWeek

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `weekStart` | datum | ano |  |  |  |

### dochazka.terminal.summary

Přehled odpracovaného času pro dlaždici Docházka v terminálu: dnešek (záznamy se zakázkou a časy) a týden. Jen vlastní záznamy, jen minuty: sazby, náklady ani částky se nevracejí.

- **Oprávnění:** `dochazka.own` (stačí kterékoli)
- **Definice:** `packages/modules/dochazka/src/terminal.ts`

_Bez vstupních polí._

### dochazka.week

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `weekStart` | datum | ano |  |  |  |
| `userId` | uuid | ne |  |  |  |

### dochazka.withdrawWeek

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/dochazka/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `weekStart` | datum | ano |  |  |  |
