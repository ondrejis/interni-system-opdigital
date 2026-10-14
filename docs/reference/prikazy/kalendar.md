# Příkazy modulu Kalendář

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Kalendář](../moduly/kalendar.md). Počet příkazů: 11.

### kalendar.event.delete

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### kalendar.event.get

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### kalendar.event.save

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `title` | text | ano |  | délka 1–200 |  |
| `type` | enum | ano | `meeting`, `survey`, `handover`, `other` |  |  |
| `allDay` | ano/ne | ano |  |  |  |
| `startDate` | datum | ano |  |  |  |
| `startTime` | text (nebo null) | ne |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |
| `endDate` | datum | ano |  |  |  |
| `endTime` | text (nebo null) | ne |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |
| `location` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `resourceId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `attendeeIds` | pole (uuid) | ne |  | počet ≤ 50; výchozí `[]` |  |
| `recurrence` | enum (nebo null) | ne | `daily`, `weekdays`, `weekly`, `monthly` |  |  |
| `recurrenceUntil` | datum (nebo null) | ne |  |  |  |
| `reminderMinutes` | libovolné (nebo null) | ne |  |  |  |

### kalendar.feed.regenerate

Nový odkaz: starý přestane fungovat. Token se vrací jen tady, v databázi zůstává otisk.

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

_Bez vstupních polí._

### kalendar.feed.status

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

_Bez vstupních polí._

### kalendar.import.add

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `name` | text | ne |  | délka ≤ 80; výchozí `""` |  |
| `url` | text | ano |  | délka 1–2000 |  |

### kalendar.import.delete

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### kalendar.import.list

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

_Bez vstupních polí._

### kalendar.import.sync

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### kalendar.options

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

_Bez vstupních polí._

### kalendar.range

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `from` | datum | ano |  |  |  |
| `to` | datum | ano |  |  |  |
| `who` | enum | ne | `me`, `all` | výchozí `"me"` |  |
| `layers` | pole (text) | ne |  | počet ≤ 30 |  |
