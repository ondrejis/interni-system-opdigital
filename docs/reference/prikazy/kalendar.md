# Příkazy modulu Kalendář

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Kalendář](../moduly/kalendar.md). Počet příkazů: 17.

### kalendar.account

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

_Bez vstupních polí._

### kalendar.calendars.refresh

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

_Bez vstupních polí._

### kalendar.connect.start

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `returnTo` | text | ne |  | délka ≤ 200, vzor `^\/(?!\/)[A-Za-z0-9/_\-?=&%.]*$` |  |

### kalendar.createMeeting

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `title` | text | ano |  | délka 1–300 |  |
| `startsAt` | datum a čas | ano |  |  |  |
| `endsAt` | datum a čas | ano |  |  |  |
| `allDay` | ano/ne | ne |  |  |  |
| `place` | text (nebo null) | ne |  | délka ≤ 300 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 20000 |  |
| `attendeeEmails` | pole (e-mail) | ne |  | počet ≤ 50 |  |
| `sendInvites` | ano/ne | ne |  |  |  |
| `addMeet` | ano/ne | ne |  |  |  |
| `assigneeId` | uuid (nebo null) | ne |  |  |  |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `isPrivate` | ano/ne | ne |  |  |  |

### kalendar.delete

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `eventId` | uuid | ano |  |  |  |

### kalendar.disconnect

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

_Bez vstupních polí._

### kalendar.forRecord

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ne |  |  |  |
| `companyId` | uuid | ne |  |  |  |
| `personId` | uuid | ne |  |  |  |
| `limit` | celé číslo | ne |  | hodnota 1–200 |  |

### kalendar.link

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `eventId` | uuid | ano |  |  |  |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |

### kalendar.move

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `eventId` | uuid | ano |  |  |  |
| `startsAt` | datum a čas | ano |  |  |  |
| `endsAt` | datum a čas | ano |  |  |  |
| `allDay` | ano/ne | ne |  |  |  |

### kalendar.range

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `from` | datum | ano |  |  |  |
| `to` | datum | ano |  |  |  |
| `who` | enum | ne | `me`, `all` | výchozí `"me"` |  |
| `layers` | pole (text) | ne |  | počet ≤ 30 |  |

### kalendar.setWriteTarget

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `calendarId` | uuid | ano |  |  |  |

### kalendar.settings.get

- **Oprávnění:** `settings.manage` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

_Bez vstupních polí._

### kalendar.settings.save

- **Oprávnění:** `settings.manage` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `clientId` | text | ne |  | délka ≤ 300 |  |
| `clientSecret` | text | ne |  | délka ≤ 300 |  |
| `privateMeetingsToGoogle` | ano/ne | ne |  |  |  |

### kalendar.suggestLinks

- **Oprávnění:** `kalendar.read` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `eventId` | uuid | ano |  |  |  |

### kalendar.sync

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

_Bez vstupních polí._

### kalendar.test

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

_Bez vstupních polí._

### kalendar.toggleCalendar

- **Oprávnění:** `kalendar.write` (stačí kterékoli)
- **Definice:** `packages/modules/kalendar/src/google/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `calendarId` | uuid | ano |  |  |  |
| `visible` | ano/ne | ano |  |  |  |
