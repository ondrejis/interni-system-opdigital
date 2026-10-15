# Příkazy modulu Hodiny

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Hodiny](../moduly/hodiny.md). Počet příkazů: 9.

### hodiny.cell.save

Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`).

- **Oprávnění:** `hodiny.write` (stačí kterékoli)
- **Definice:** `packages/modules/hodiny/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `date` | datum | ano |  |  |  |
| `time` | text | ne |  | délka ≤ 40 |  |
| `minutes` | celé číslo | ne |  | hodnota 0–1440 |  |

### hodiny.delete

Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`).

- **Oprávnění:** `hodiny.delete` (stačí kterékoli)
- **Definice:** `packages/modules/hodiny/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### hodiny.forTask

Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`).

- **Oprávnění:** `hodiny.read` (stačí kterékoli)
- **Definice:** `packages/modules/hodiny/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `taskId` | uuid | ano |  |  |  |

### hodiny.job.summary

Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`).

- **Oprávnění:** `hodiny.read` (stačí kterékoli)
- **Definice:** `packages/modules/hodiny/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### hodiny.jobs

Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`).

- **Oprávnění:** `hodiny.read` (stačí kterékoli)
- **Definice:** `packages/modules/hodiny/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `q` | text | ne |  | délka ≤ 100 |  |
| `includeClosed` | ano/ne | ne |  |  |  |

### hodiny.parse

Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`).

- **Oprávnění:** `hodiny.read` (stačí kterékoli)
- **Definice:** `packages/modules/hodiny/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `text` | text | ano |  | délka ≤ 40 |  |

### hodiny.report

Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`).

- **Oprávnění:** `hodiny.read` (stačí kterékoli)
- **Definice:** `packages/modules/hodiny/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `period` | enum | ne | `week`, `month` | výchozí `"week"` |  |
| `anchor` | datum | ne |  |  |  |
| `scope` | enum | ne | `mine`, `all` | výchozí `"mine"` |  |
| `by` | enum | ne | `job`, `person` | výchozí `"job"` |  |

### hodiny.save

Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`).

- **Oprávnění:** `hodiny.write` (stačí kterékoli)
- **Definice:** `packages/modules/hodiny/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `jobId` | uuid | ne |  |  |  |
| `taskId` | uuid (nebo null) | ne |  |  |  |
| `date` | datum | ano |  |  |  |
| `time` | text | ne |  | délka ≤ 40 |  |
| `minutes` | celé číslo | ne |  | hodnota 0–1440 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 500 |  |

### hodiny.week

Příkazy modulu „hodiny“ (název `hodiny.<akce>`; každý potřebuje probe v `tests/support/probes/hodiny.ts`).

- **Oprávnění:** `hodiny.read` (stačí kterékoli)
- **Definice:** `packages/modules/hodiny/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `weekStart` | datum | ne |  |  |  |
