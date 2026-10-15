# Příkazy modulu Reklama

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Reklama](../moduly/reklama.md). Počet příkazů: 18.

### reklama.account.detail

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.read` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `accountId` | uuid | ano |  |  |  |
| `period` | objekt | ano |  |  |  |
| `period.from` | datum | ano |  |  |  |
| `period.to` | datum | ano |  |  |  |

### reklama.account.setActive

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `accountId` | uuid | ano |  |  |  |
| `active` | ano/ne | ano |  |  |  |

### reklama.account.setOwner

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.write` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `accountId` | uuid | ano |  |  |  |
| `ownerKind` | enum | ano | `agency`, `client` |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |

### reklama.accounts.list

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.read` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `includeInactive` | ano/ne | ne |  |  |  |

### reklama.campaign.assignJob

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.write` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `campaignId` | uuid | ano |  |  |  |
| `jobId` | uuid (nebo null) | ano |  |  |  |

### reklama.campaign.detail

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.read` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `campaignId` | uuid | ano |  |  |  |
| `period` | objekt | ano |  |  |  |
| `period.from` | datum | ano |  |  |  |
| `period.to` | datum | ano |  |  |  |

### reklama.connection.get

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

_Bez vstupních polí._

### reklama.connection.remove

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

_Bez vstupních polí._

### reklama.connection.save

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `accessToken` | text | ano |  | délka 10–2000 |  |

### reklama.connection.test

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

_Bez vstupních polí._

### reklama.forClient

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.read` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |
| `period` | objekt | ano |  |  |  |
| `period.from` | datum | ano |  |  |  |
| `period.to` | datum | ano |  |  |  |

### reklama.forJob

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.read` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `period` | objekt | ano |  |  |  |
| `period.from` | datum | ano |  |  |  |
| `period.to` | datum | ano |  |  |  |

### reklama.leads.recent

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `limit` | celé číslo | ne |  | hodnota 1–100; výchozí `30` |  |

### reklama.mapping.delete

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### reklama.mapping.save

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `metaFormId` | text | ano |  | délka 1–100 |  |
| `name` | text | ano |  | délka 1–160 |  |
| `pipelineId` | uuid | ano |  |  |  |
| `stageId` | uuid | ano |  |  |  |
| `ownerId` | uuid | ano |  |  |  |
| `defaultServices` | pole (enum) | ne | `web`, `marketing`, `systemy` | počet ≤ 3; výchozí `[]` |  |

### reklama.mappings.list

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

_Bez vstupních polí._

### reklama.metrics

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.read` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `scope` | objekt | ne |  |  |  |
| `scope.accountId` | uuid | ne |  |  |  |
| `scope.companyId` | uuid | ne |  |  |  |
| `scope.jobId` | uuid | ne |  |  |  |
| `period` | objekt | ano |  |  |  |
| `period.from` | datum | ano |  |  |  |
| `period.to` | datum | ano |  |  |  |

### reklama.sync

Příkazy modulu „reklama“ (`reklama.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `reklama.manage` (stačí kterékoli)
- **Definice:** `packages/modules/reklama/src/meta/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `accountId` | uuid | ne |  |  |  |
