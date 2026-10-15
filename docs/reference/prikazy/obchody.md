# Příkazy modulu Obchody

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Obchody](../moduly/obchody.md). Počet příkazů: 24.

### obchody.archive

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.delete` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |

### obchody.board

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.read` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `owner` | konstanta \| uuid | ne | `me` |  |  |
| `search` | text | ne |  | délka ≤ 100 |  |

### obchody.create

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.create` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `title` | text | ano |  | délka 1–200 |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `ownerId` | uuid (nebo null) | ne |  |  |  |
| `valueMinor` | celé číslo (nebo null) | ne |  | hodnota 0–10000000000000 |  |
| `services` | pole (enum) | ne | `web`, `marketing`, `systemy` | počet ≤ 3; výchozí `[]` |  |
| `expectedCloseDate` | datum (nebo null) | ne |  |  |  |
| `source` | enum | ne | `manual`, `meta`, `web_form`, `referral`, `other` | výchozí `"manual"` |  |
| `sourceDetail` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `tags` | pole (text) | ne |  | počet ≤ 30; výchozí `[]` |  |
| `stageId` | uuid | ne |  |  |  |
| `participantIds` | pole (uuid) | ne |  | počet ≤ 20; výchozí `[]` |  |
| `isPrivate` | ano/ne | ne |  |  |  |

### obchody.detail

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.read` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |

### obchody.history

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.read` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |

### obchody.lose

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.write` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |
| `reason` | text | ano |  | délka 1–60 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `expectedUpdatedAt` | text | ne |  |  |  |

### obchody.lostReasons

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.read` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `includeInactive` | ano/ne | ne |  | výchozí `false` |  |

### obchody.markOpened

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.read` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |

### obchody.moveStage

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.write` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |
| `stageId` | uuid | ano |  |  |  |
| `expectedUpdatedAt` | text | ne |  |  |  |

### obchody.participants.add

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.write` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |
| `personId` | uuid | ano |  |  |  |

### obchody.participants.remove

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.write` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |
| `personId` | uuid | ano |  |  |  |

### obchody.pipeline.get

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.pipelines` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

_Bez vstupních polí._

### obchody.pipeline.lostReason.add

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.pipelines` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `value` | text | ne |  | délka ≤ 60, vzor `^[a-z0-9_]+$` |  |
| `label` | text | ano |  | délka 1–80 |  |
| `color` | text (nebo null) | ne |  | délka ≤ 30 |  |

### obchody.pipeline.lostReason.reorder

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.pipelines` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `itemIds` | pole (uuid) | ano |  | počet 1–100 |  |

### obchody.pipeline.lostReason.update

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.pipelines` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `itemId` | uuid | ano |  |  |  |
| `label` | text | ne |  | délka 1–80 |  |
| `color` | text (nebo null) | ne |  | délka ≤ 30 |  |
| `active` | ano/ne | ne |  |  |  |

### obchody.pipeline.stage.add

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.pipelines` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `name` | text | ano |  | délka 1–80 |  |
| `color` | text | ne |  | délka 1–30 |  |
| `probabilityPct` | celé číslo (nebo null) | ne |  | hodnota 0–100 |  |
| `rottingDays` | celé číslo (nebo null) | ne |  | hodnota 1–365 |  |

### obchody.pipeline.stage.delete

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.pipelines` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `stageId` | uuid | ano |  |  |  |

### obchody.pipeline.stage.reorder

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.pipelines` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `stageIds` | pole (uuid) | ano |  | počet 1–50 |  |

### obchody.pipeline.stage.update

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.pipelines` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `stageId` | uuid | ano |  |  |  |
| `name` | text | ne |  | délka 1–80 |  |
| `color` | text | ne |  | délka 1–30 |  |
| `probabilityPct` | celé číslo (nebo null) | ne |  | hodnota 0–100 |  |
| `rottingDays` | celé číslo (nebo null) | ne |  | hodnota 1–365 |  |

### obchody.quickAdd

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.create` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `title` | text | ne |  | délka 1–200 |  |
| `company` | jedna z variant | ne |  |  |  |
| `company.id` | uuid | ne |  |  |  |
| `company.name` | text | ne |  | délka 1–200 |  |
| `company.ico` | text | ne |  | délka ≤ 20 |  |
| `person` | jedna z variant | ne |  |  |  |
| `person.id` | uuid | ne |  |  |  |
| `person.name` | text | ne |  | délka 1–200 |  |
| `person.email` | text | ne |  | délka ≤ 200 |  |
| `person.phone` | text | ne |  | délka ≤ 40 |  |
| `valueMinor` | celé číslo (nebo null) | ne |  | hodnota 0–10000000000000 |  |
| `services` | pole (enum) | ne | `web`, `marketing`, `systemy` | počet ≤ 3; výchozí `[]` |  |
| `expectedCloseDate` | datum (nebo null) | ne |  |  |  |
| `ownerId` | uuid (nebo null) | ne |  |  |  |
| `source` | enum | ne | `manual`, `meta`, `web_form`, `referral`, `other` | výchozí `"manual"` |  |
| `sourceDetail` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `stageId` | uuid | ne |  |  |  |

### obchody.reopen

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.write` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |

### obchody.update

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.write` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |
| `patch` | objekt | ano |  |  |  |
| `patch.title` | text | ne |  | délka 1–200 |  |
| `patch.companyId` | uuid (nebo null) | ne |  |  |  |
| `patch.personId` | uuid (nebo null) | ne |  |  |  |
| `patch.ownerId` | uuid (nebo null) | ne |  |  |  |
| `patch.valueMinor` | celé číslo (nebo null) | ne |  | hodnota 0–10000000000000 |  |
| `patch.services` | pole (enum) | ne | `web`, `marketing`, `systemy` | počet ≤ 3 |  |
| `patch.expectedCloseDate` | datum (nebo null) | ne |  |  |  |
| `patch.source` | enum | ne | `manual`, `meta`, `web_form`, `referral`, `other` |  |  |
| `patch.sourceDetail` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `patch.tags` | pole (text) | ne |  | počet ≤ 30 |  |
| `expectedUpdatedAt` | text | ne |  |  |  |

### obchody.win

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.write` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |
| `wonOn` | datum | ne |  |  |  |
| `jobs` | pole objektů | ne |  | počet ≤ 10; výchozí `[]` |  |
| `jobs[].type` | enum | ano | `web`, `marketing`, `systemy` |  |  |
| `jobs[].templateId` | uuid (nebo null) | ano |  |  |  |
| `jobs[].title` | text | ano |  | délka 1–160 |  |
| `jobs[].startDate` | datum | ano |  |  |  |
| `jobs[].ownerId` | uuid | ano |  |  |  |
| `jobs[].memberIds` | pole (uuid) | ano |  | počet ≤ 20 |  |
| `jobs[].leadId` | uuid (nebo null) | ne |  |  |  |
| `jobs[].billingModel` | enum | ne | `one_off`, `intro_then_retainer`, `retainer`, `hourly` |  |  |
| `jobs[].split` | pole objektů | ne |  |  |  |
| `jobs[].split[].userId` | uuid | ano |  |  |  |
| `jobs[].split[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `jobs[].split[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `jobs[].split[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `jobs[].split[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `jobs[].split[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `jobs[].split[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `jobs[].retainer` | objekt | ne |  |  |  |
| `jobs[].retainer.amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `jobs[].retainer.fromMonth` | text | ano |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `jobs[].retainer.issueDay` | celé číslo | ano |  | hodnota 1–28 |  |
| `jobs[].retainer.issuerMode` | enum | ano | `fixed`, `alternate` |  |  |
| `jobs[].retainer.issuerId` | uuid | ano |  |  |  |
| `jobs[].retainer.firstIssuerId` | uuid | ne |  |  |  |
| `jobs[].retainer.split` | pole objektů | ano |  |  |  |
| `jobs[].retainer.split[].userId` | uuid | ano |  |  |  |
| `jobs[].retainer.split[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `jobs[].retainer.split[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `jobs[].retainer.split[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `jobs[].retainer.split[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `jobs[].retainer.split[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `jobs[].retainer.split[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `expectedUpdatedAt` | text | ne |  |  |  |

### obchody.winPreview

Příkazy modulu „obchody“ (`obchody.<akce>`); vstupy a výstupy jsou v `contract.ts`.

- **Oprávnění:** `obchody.read` (stačí kterékoli)
- **Definice:** `packages/modules/obchody/src/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ano |  |  |  |
