# Příkazy modulu Zakázky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Zakázky](../moduly/zakazky.md). Počet příkazů: 25.

### zakazky.board

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `by` | enum | ano | `status`, `phase` |  |  |
| `type` | enum | ne | `web`, `marketing`, `systemy` |  |  |
| `includeClosed` | ano/ne | ne |  | výchozí `false` |  |

### zakazky.client.setFormer

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `reason` | text | ne |  | délka ≤ 500 |  |
| `endedOn` | datum | ne |  |  |  |

### zakazky.complete

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `reason` | enum | ano | `finished`, `retainer_ended`, `cancelled` |  |  |

### zakazky.complete.preview

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.create

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.create` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `title` | text | ano |  | délka 1–160 |  |
| `type` | enum | ano | `web`, `marketing`, `systemy` |  |  |
| `companyId` | uuid | ano |  |  |  |
| `ownerId` | uuid | ano |  |  |  |
| `memberIds` | pole (uuid) | ne |  | počet ≤ 20; výchozí `[]` |  |
| `leadId` | uuid (nebo null) | ne |  |  |  |
| `startDate` | datum | ne |  |  |  |
| `dueDate` | datum (nebo null) | ne |  |  |  |
| `billingModel` | enum | ne | `one_off`, `intro_then_retainer`, `retainer`, `hourly` |  |  |
| `split` | pole objektů | ne |  |  |  |
| `split[].userId` | uuid | ano |  |  |  |
| `split[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `split[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `split[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `split[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `split[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `split[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `retainer` | objekt | ne |  |  |  |
| `retainer.amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `retainer.fromMonth` | text | ano |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `retainer.issueDay` | celé číslo | ano |  | hodnota 1–28 |  |
| `retainer.issuerMode` | enum | ano | `fixed`, `alternate` |  |  |
| `retainer.issuerId` | uuid | ano |  |  |  |
| `retainer.firstIssuerId` | uuid | ne |  |  |  |
| `retainer.split` | pole objektů | ano |  |  |  |
| `retainer.split[].userId` | uuid | ano |  |  |  |
| `retainer.split[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `retainer.split[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `retainer.split[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `retainer.split[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `retainer.split[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `retainer.split[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `priceMinor` | celé číslo (nebo null) | ne |  | hodnota ≥ 0 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 10000 |  |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `withoutTemplate` | ano/ne | ne |  |  |  |
| `isPrivate` | ano/ne | ne |  |  |  |
| `templateId` | uuid (nebo null) | ne |  |  |  |

### zakazky.createFromTemplate

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.create` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `title` | text | ano |  | délka 1–160 |  |
| `type` | enum | ano | `web`, `marketing`, `systemy` |  |  |
| `companyId` | uuid | ano |  |  |  |
| `ownerId` | uuid | ano |  |  |  |
| `memberIds` | pole (uuid) | ne |  | počet ≤ 20; výchozí `[]` |  |
| `leadId` | uuid (nebo null) | ne |  |  |  |
| `startDate` | datum | ne |  |  |  |
| `dueDate` | datum (nebo null) | ne |  |  |  |
| `billingModel` | enum | ne | `one_off`, `intro_then_retainer`, `retainer`, `hourly` |  |  |
| `split` | pole objektů | ne |  |  |  |
| `split[].userId` | uuid | ano |  |  |  |
| `split[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `split[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `split[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `split[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `split[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `split[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `retainer` | objekt | ne |  |  |  |
| `retainer.amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `retainer.fromMonth` | text | ano |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `retainer.issueDay` | celé číslo | ano |  | hodnota 1–28 |  |
| `retainer.issuerMode` | enum | ano | `fixed`, `alternate` |  |  |
| `retainer.issuerId` | uuid | ano |  |  |  |
| `retainer.firstIssuerId` | uuid | ne |  |  |  |
| `retainer.split` | pole objektů | ano |  |  |  |
| `retainer.split[].userId` | uuid | ano |  |  |  |
| `retainer.split[].mode` | enum | ano | `percent`, `fixed_per_payment`, `fixed_total` |  |  |
| `retainer.split[].percent` | číslo | ne |  | hodnota 0–100 |  |
| `retainer.split[].fixedMinor` | celé číslo | ne |  | hodnota ≥ 0 |  |
| `retainer.split[].appliesTo` | konstanta \| enum | ano | `all`, `one_off`, `intro`, `retainer`, `extra`, `recurring` |  |  |
| `retainer.split[].validFrom` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `retainer.split[].validTo` | text (nebo null) | ne |  | vzor `^\d{4}-(0[1-9]\|1[0-2])$` |  |
| `priceMinor` | celé číslo (nebo null) | ne |  | hodnota ≥ 0 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 10000 |  |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `withoutTemplate` | ano/ne | ne |  |  |  |
| `isPrivate` | ano/ne | ne |  |  |  |
| `templateId` | uuid | ano |  |  |  |

### zakazky.detail

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.participants.add

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `personId` | uuid | ano |  |  |  |
| `role` | text (nebo null) | ne |  | délka ≤ 80 |  |

### zakazky.participants.remove

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `personId` | uuid | ano |  |  |  |

### zakazky.phase.complete

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `phaseId` | uuid | ano |  |  |  |
| `completeOpenTasks` | ano/ne | ne |  | výchozí `false` |  |

### zakazky.phase.preview

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `phaseId` | uuid | ano |  |  |  |

### zakazky.phases.edit

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `phases` | pole objektů | ano |  | počet 1–40 |  |
| `phases[].id` | uuid | ne |  |  |  |
| `phases[].name` | text | ano |  | délka 1–160 |  |
| `phases[].role` | enum (nebo null) | ne | `intro_evaluation`, `retainer` |  |  |
| `phases[].plannedStart` | datum (nebo null) | ne |  |  |  |
| `phases[].plannedEnd` | datum (nebo null) | ne |  |  |  |

### zakazky.prefillFromDeal

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |
| `services` | pole (enum) | ano | `web`, `marketing`, `systemy` | počet 1–3 |  |
| `ownerId` | uuid | ne |  |  |  |
| `startDate` | datum | ne |  |  |  |
| `dealValueMinor` | celé číslo (nebo null) | ne |  | hodnota ≥ 0 |  |

### zakazky.setPhase

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `phaseId` | uuid | ne |  |  |  |
| `phaseName` | text | ne |  | délka ≤ 160 |  |
| `completeOpenTasks` | ano/ne | ne |  | výchozí `false` |  |

### zakazky.setStatus

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `status` | enum | ano | `planned`, `active`, `paused`, `done`, `cancelled` |  |  |

### zakazky.team.add

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `userId` | uuid | ano |  |  |  |
| `role` | enum | ne | `lead`, `member` | výchozí `"member"` |  |

### zakazky.team.remove

Příkazy modulu „zakazky“ (zakázky, fáze, stav, tým). Čtení vyžaduje `zakazky.read`, změny `zakazky.write` (u rozsahu „jen moje“ jen vlastní zakázky), založení `zakazky.create`; šablony jsou v oblasti `templates`.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/core/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `userId` | uuid | ano |  |  |  |

### zakazky.template.archive

Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`.

- **Oprávnění:** `zakazky.templates` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `archived` | ano/ne | ne |  | výchozí `true` |  |

### zakazky.template.create

Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`.

- **Oprávnění:** `zakazky.templates` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `name` | text | ano |  | délka 1–160 |  |
| `type` | enum | ano | `web`, `marketing`, `systemy` |  |  |
| `description` | text (nebo null) | ne |  | délka ≤ 1000 |  |
| `defaultBillingModel` | enum | ne | `one_off`, `intro_then_retainer`, `retainer`, `hourly` | výchozí `"one_off"` |  |
| `payload` | objekt | ne |  | výchozí `{"v":1,"phases":[],"tasks":[],"payments":[]}` |  |
| `payload.v` | konstanta | ne | `1` | výchozí `1` |  |
| `payload.phases` | pole objektů | ne |  | počet ≤ 40; výchozí `[]` |  |
| `payload.phases[].name` | text | ano |  | délka 1–160 |  |
| `payload.phases[].role` | enum (nebo null) | ne | `intro_evaluation`, `retainer` |  |  |
| `payload.phases[].offsetDays` | celé číslo | ne |  | hodnota 0–3650; výchozí `0` |  |
| `payload.phases[].durationDays` | celé číslo | ne |  | hodnota 0–3650; výchozí `0` |  |
| `payload.tasks` | pole objektů | ne |  | počet ≤ 500; výchozí `[]` |  |
| `payload.tasks[].phaseIndex` | celé číslo | ne |  | hodnota 0–39; výchozí `0` |  |
| `payload.tasks[].title` | text | ano |  | délka 1–200 |  |
| `payload.tasks[].typeKey` | text | ne |  | délka 1–40; výchozí `"task"` |  |
| `payload.tasks[].priority` | enum | ne | `none`, `low`, `medium`, `high`, `urgent` | výchozí `"medium"` |  |
| `payload.tasks[].assignee` | objekt | ne |  | výchozí `{"rule":"owner"}` |  |
| `payload.tasks[].assignee.rule` | enum | ano | `owner`, `lead`, `user`, `none` |  |  |
| `payload.tasks[].assignee.userId` | uuid | ne |  |  |  |
| `payload.tasks[].dueOffsetDays` | celé číslo (nebo null) | ne |  | hodnota 0–3650 |  |
| `payload.tasks[].estimateMin` | celé číslo (nebo null) | ne |  | hodnota 0–100000 |  |
| `payload.tasks[].description` | text (nebo null) | ne |  | délka ≤ 4000 |  |
| `payload.payments` | pole objektů | ne |  | počet ≤ 40; výchozí `[]` |  |
| `payload.payments[].description` | text | ano |  | délka 1–200 |  |
| `payload.payments[].kind` | enum | ne | `one_off`, `intro`, `retainer`, `extra` | výchozí `"one_off"` |  |
| `payload.payments[].amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `payload.payments[].issuer` | objekt | ne |  | výchozí `{"rule":"owner"}` |  |
| `payload.payments[].issuer.rule` | enum | ano | `owner`, `other`, `user` |  |  |
| `payload.payments[].issuer.userId` | uuid | ne |  |  |  |
| `payload.payments[].dueOffsetDays` | celé číslo (nebo null) | ne |  | hodnota 0–3650 |  |

### zakazky.template.duplicate

Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`.

- **Oprávnění:** `zakazky.templates` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `name` | text | ne |  | délka 1–160 |  |

### zakazky.template.get

Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.template.list

Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `type` | enum | ne | `web`, `marketing`, `systemy` |  |  |
| `includeArchived` | ano/ne | ne |  | výchozí `false` |  |

### zakazky.template.saveFromJob

Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`.

- **Oprávnění:** `zakazky.templates` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `name` | text | ano |  | délka 1–160 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 1000 |  |
| `includeTasks` | ano/ne | ne |  | výchozí `true` |  |
| `replaceId` | uuid | ne |  |  |  |

### zakazky.template.setDefault

Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`.

- **Oprávnění:** `zakazky.templates` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.template.update

Příkazy šablon zakázek: čtení `zakazky.read`, správa `zakazky.templates`.

- **Oprávnění:** `zakazky.templates` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `name` | text | ne |  | délka 1–160 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 1000 |  |
| `defaultBillingModel` | enum | ne | `one_off`, `intro_then_retainer`, `retainer`, `hourly` |  |  |
| `payload` | objekt | ne |  |  |  |
| `payload.v` | konstanta | ne | `1` | výchozí `1` |  |
| `payload.phases` | pole objektů | ne |  | počet ≤ 40; výchozí `[]` |  |
| `payload.phases[].name` | text | ano |  | délka 1–160 |  |
| `payload.phases[].role` | enum (nebo null) | ne | `intro_evaluation`, `retainer` |  |  |
| `payload.phases[].offsetDays` | celé číslo | ne |  | hodnota 0–3650; výchozí `0` |  |
| `payload.phases[].durationDays` | celé číslo | ne |  | hodnota 0–3650; výchozí `0` |  |
| `payload.tasks` | pole objektů | ne |  | počet ≤ 500; výchozí `[]` |  |
| `payload.tasks[].phaseIndex` | celé číslo | ne |  | hodnota 0–39; výchozí `0` |  |
| `payload.tasks[].title` | text | ano |  | délka 1–200 |  |
| `payload.tasks[].typeKey` | text | ne |  | délka 1–40; výchozí `"task"` |  |
| `payload.tasks[].priority` | enum | ne | `none`, `low`, `medium`, `high`, `urgent` | výchozí `"medium"` |  |
| `payload.tasks[].assignee` | objekt | ne |  | výchozí `{"rule":"owner"}` |  |
| `payload.tasks[].assignee.rule` | enum | ano | `owner`, `lead`, `user`, `none` |  |  |
| `payload.tasks[].assignee.userId` | uuid | ne |  |  |  |
| `payload.tasks[].dueOffsetDays` | celé číslo (nebo null) | ne |  | hodnota 0–3650 |  |
| `payload.tasks[].estimateMin` | celé číslo (nebo null) | ne |  | hodnota 0–100000 |  |
| `payload.tasks[].description` | text (nebo null) | ne |  | délka ≤ 4000 |  |
| `payload.payments` | pole objektů | ne |  | počet ≤ 40; výchozí `[]` |  |
| `payload.payments[].description` | text | ano |  | délka 1–200 |  |
| `payload.payments[].kind` | enum | ne | `one_off`, `intro`, `retainer`, `extra` | výchozí `"one_off"` |  |
| `payload.payments[].amountMinor` | celé číslo | ano |  | hodnota ≥ 0 |  |
| `payload.payments[].issuer` | objekt | ne |  | výchozí `{"rule":"owner"}` |  |
| `payload.payments[].issuer.rule` | enum | ano | `owner`, `other`, `user` |  |  |
| `payload.payments[].issuer.userId` | uuid | ne |  |  |  |
| `payload.payments[].dueOffsetDays` | celé číslo (nebo null) | ne |  | hodnota 0–3650 |  |
