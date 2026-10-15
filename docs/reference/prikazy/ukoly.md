# Příkazy modulu Úkoly a poznámky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Úkoly a poznámky](../moduly/ukoly.md). Počet příkazů: 26.

### ukoly.assign

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `assigneeId` | uuid (nebo null) | ano |  |  |  |

### ukoly.attendees.set

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `attendees` | pole (libovolné) | ano |  | počet ≤ 50 |  |

### ukoly.complete

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `outcome` | text (nebo null) | ne |  | délka ≤ 5000 |  |
| `next` | objekt (nebo null) | ne |  |  |  |
| `next.title` | text | ano |  | délka 1–300 |  |
| `next.description` | text (nebo null) | ne |  | délka ≤ 20000 |  |
| `next.typeKey` | text | ne |  | délka 1–40 |  |
| `next.status` | enum | ne | `todo`, `in_progress`, `done`, `canceled` |  |  |
| `next.priority` | enum | ne | `none`, `low`, `medium`, `high`, `urgent` |  |  |
| `next.assigneeId` | uuid (nebo null) | ne |  |  |  |
| `next.dueDate` | datum (nebo null) | ne |  |  |  |
| `next.dueTime` | text (nebo null) | ne |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |
| `next.durationMin` | celé číslo (nebo null) | ne |  | hodnota 1–1440 |  |
| `next.allDay` | ano/ne | ne |  |  |  |
| `next.place` | text (nebo null) | ne |  | délka ≤ 300 |  |
| `next.estimateMin` | celé číslo (nebo null) | ne |  | hodnota 0–100000 |  |
| `next.parentId` | uuid (nebo null) | ne |  |  |  |
| `next.dealId` | uuid (nebo null) | ne |  |  |  |
| `next.companyId` | uuid (nebo null) | ne |  |  |  |
| `next.personId` | uuid (nebo null) | ne |  |  |  |
| `next.jobId` | uuid (nebo null) | ne |  |  |  |
| `next.jobPhaseId` | uuid (nebo null) | ne |  |  |  |
| `next.tags` | pole (text) | ne |  | počet ≤ 30 |  |
| `next.attendees` | pole (libovolné) | ne |  | počet ≤ 50 |  |
| `next.sendInvites` | ano/ne | ne |  |  |  |
| `next.isPrivate` | ano/ne | ne |  |  |  |
| `next.outcome` | text (nebo null) | ne |  | délka ≤ 5000 |  |
| `next.done` | ano/ne | ne |  |  |  |

### ukoly.counts

- **Oprávnění:** `ukoly.read` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

_Bez vstupních polí._

### ukoly.create

- **Oprávnění:** `ukoly.create` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `title` | text | ano |  | délka 1–300 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 20000 |  |
| `typeKey` | text | ne |  | délka 1–40 |  |
| `status` | enum | ne | `todo`, `in_progress`, `done`, `canceled` |  |  |
| `priority` | enum | ne | `none`, `low`, `medium`, `high`, `urgent` |  |  |
| `assigneeId` | uuid (nebo null) | ne |  |  |  |
| `dueDate` | datum (nebo null) | ne |  |  |  |
| `dueTime` | text (nebo null) | ne |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |
| `durationMin` | celé číslo (nebo null) | ne |  | hodnota 1–1440 |  |
| `allDay` | ano/ne | ne |  |  |  |
| `place` | text (nebo null) | ne |  | délka ≤ 300 |  |
| `estimateMin` | celé číslo (nebo null) | ne |  | hodnota 0–100000 |  |
| `parentId` | uuid (nebo null) | ne |  |  |  |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `jobPhaseId` | uuid (nebo null) | ne |  |  |  |
| `tags` | pole (text) | ne |  | počet ≤ 30 |  |
| `attendees` | pole (libovolné) | ne |  | počet ≤ 50 |  |
| `sendInvites` | ano/ne | ne |  |  |  |
| `isPrivate` | ano/ne | ne |  |  |  |
| `outcome` | text (nebo null) | ne |  | délka ≤ 5000 |  |
| `done` | ano/ne | ne |  |  |  |

### ukoly.delete

- **Oprávnění:** `ukoly.delete` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### ukoly.forRecord

- **Oprávnění:** `ukoly.read` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid | ne |  |  |  |
| `companyId` | uuid | ne |  |  |  |
| `personId` | uuid | ne |  |  |  |
| `jobId` | uuid | ne |  |  |  |
| `include` | enum | ne | `open`, `done`, `all` |  |  |
| `limit` | celé číslo | ne |  | hodnota 1–500 |  |

### ukoly.get

- **Oprávnění:** `ukoly.read` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### ukoly.list

- **Oprávnění:** `ukoly.read` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `view` | enum | ne | `today`, `next7`, `nodate`, `delegated`, `done`, `all` |  |  |
| `scope` | enum | ne | `mine`, `all` |  |  |
| `assigneeId` | uuid | ne |  |  |  |
| `typeKey` | text | ne |  | délka 1–40 |  |
| `status` | pole (enum) | ne | `todo`, `in_progress`, `done`, `canceled` | počet ≤ 4 |  |
| `priority` | pole (enum) | ne | `none`, `low`, `medium`, `high`, `urgent` | počet ≤ 5 |  |
| `dealId` | uuid | ne |  |  |  |
| `companyId` | uuid | ne |  |  |  |
| `personId` | uuid | ne |  |  |  |
| `jobId` | uuid | ne |  |  |  |
| `jobPhaseId` | uuid | ne |  |  |  |
| `calendarOnly` | ano/ne | ne |  |  |  |
| `q` | text | ne |  | délka ≤ 200 |  |
| `tag` | text | ne |  | délka ≤ 60 |  |
| `includeSubtasks` | ano/ne | ne |  |  |  |
| `sort` | enum | ne | `due`, `priority`, `created`, `title`, `updated` |  |  |
| `dir` | enum | ne | `asc`, `desc` |  |  |
| `limit` | celé číslo | ne |  | hodnota 1–500 |  |
| `offset` | celé číslo | ne |  | hodnota 0–100000 |  |

### ukoly.note.create

`ukoly.note.create`: nová poznámka.

- **Oprávnění:** `ukoly.create` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/notes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `title` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `bodyJson` | slovník (klíč → hodnota) (nebo null) | ne |  |  |  |
| `bodyJson.*` | libovolné | ne |  |  |  |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `pinned` | ano/ne | ne |  |  |  |
| `tags` | pole (text) | ne |  | počet ≤ 30 |  |
| `isPrivate` | ano/ne | ne |  |  |  |

### ukoly.note.delete

`ukoly.note.delete`: smazání do koše.

- **Oprávnění:** `ukoly.delete` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/notes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### ukoly.note.get

`ukoly.note.get`: poznámka s obsahem.

- **Oprávnění:** `ukoly.read` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/notes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### ukoly.note.list

`ukoly.note.list`: poznámky k záznamu nebo samostatné (připnuté nahoře, pak nejnovější; hledání v textu).

- **Oprávnění:** `ukoly.read` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/notes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `standalone` | ano/ne | ne |  |  |  |
| `q` | text | ne |  | délka ≤ 200 |  |
| `visibility` | enum | ne | `all`, `private`, `shared` |  |  |
| `limit` | celé číslo | ne |  | hodnota 1–200 |  |
| `offset` | celé číslo | ne |  | hodnota 0–100000 |  |

### ukoly.note.pin

`ukoly.note.pin`: připnutí a odepnutí.

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/notes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `pinned` | ano/ne | ano |  |  |  |

### ukoly.note.save

`ukoly.note.save`: autosave obsahu s ochranou verzí (konflikt se vrací jako výsledek, ne výjimka).

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/notes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `baseVersion` | celé číslo | ano |  | hodnota ≥ 1 |  |
| `title` | text (nebo null) | ne |  | délka ≤ 200 |  |
| `bodyJson` | slovník (klíč → hodnota) | ne |  |  |  |
| `bodyJson.*` | libovolné | ne |  |  |  |
| `force` | ano/ne | ne |  |  |  |

### ukoly.note.update

`ukoly.note.update`: přesun k jinému záznamu a štítky.

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/notes/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `tags` | pole (text) | ne |  | počet ≤ 30 |  |

### ukoly.parse

- **Oprávnění:** `ukoly.read` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `text` | text | ano |  | délka ≤ 1000 |  |

### ukoly.publishAndAssign

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `assigneeId` | uuid | ano |  |  |  |

### ukoly.quickAdd

- **Oprávnění:** `ukoly.create` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `text` | text | ano |  | délka 1–1000 |  |
| `override` | objekt | ne |  |  |  |
| `override.title` | text | ne |  | délka 1–300 |  |
| `override.typeKey` | text | ne |  | délka 1–40 |  |
| `override.dueDate` | datum (nebo null) | ne |  |  |  |
| `override.dueTime` | text (nebo null) | ne |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |
| `override.durationMin` | celé číslo (nebo null) | ne |  | hodnota 1–1440 |  |
| `override.priority` | enum | ne | `none`, `low`, `medium`, `high`, `urgent` |  |  |
| `assigneeId` | uuid (nebo null) | ne |  |  |  |
| `isPrivate` | ano/ne | ne |  |  |  |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `jobPhaseId` | uuid (nebo null) | ne |  |  |  |
| `parentId` | uuid (nebo null) | ne |  |  |  |

### ukoly.reschedule

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `dueDate` | datum | ne |  |  |  |
| `dueTime` | text (nebo null) | ne |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |
| `durationMin` | celé číslo (nebo null) | ne |  | hodnota 1–1440 |  |
| `allDay` | ano/ne | ne |  |  |  |
| `days` | celé číslo | ne |  | hodnota 0–730 |  |

### ukoly.setStatus

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `status` | enum | ano | `todo`, `in_progress`, `done`, `canceled` |  |  |

### ukoly.type.delete

- **Oprávnění:** `ukoly.types` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### ukoly.type.list

- **Oprávnění:** `ukoly.read` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

_Bez vstupních polí._

### ukoly.type.reorder

- **Oprávnění:** `ukoly.types` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `ids` | pole (uuid) | ano |  | počet 1–100 |  |

### ukoly.type.save

- **Oprávnění:** `ukoly.types` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ne |  |  |  |
| `key` | text | ano |  | délka 2–40, vzor `^[a-z][a-z0-9_]*$` |  |
| `name` | text | ano |  | délka 1–60 |  |
| `icon` | text (nebo null) | ne |  | délka 1–40 |  |
| `color` | text (nebo null) | ne |  | délka 1–40 |  |
| `isCalendarEvent` | ano/ne | ne |  |  |  |
| `position` | celé číslo | ne |  | hodnota 0–10000 |  |

### ukoly.update

- **Oprávnění:** `ukoly.write` (stačí kterékoli)
- **Definice:** `packages/modules/ukoly/src/tasks/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `title` | text | ne |  | délka 1–300 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 20000 |  |
| `typeKey` | text | ne |  | délka 1–40 |  |
| `priority` | enum | ne | `none`, `low`, `medium`, `high`, `urgent` |  |  |
| `dueDate` | datum (nebo null) | ne |  |  |  |
| `dueTime` | text (nebo null) | ne |  | vzor `^([01]\d\|2[0-3]):[0-5]\d$` |  |
| `durationMin` | celé číslo (nebo null) | ne |  | hodnota 1–1440 |  |
| `allDay` | ano/ne | ne |  |  |  |
| `place` | text (nebo null) | ne |  | délka ≤ 300 |  |
| `estimateMin` | celé číslo (nebo null) | ne |  | hodnota 0–100000 |  |
| `parentId` | uuid (nebo null) | ne |  |  |  |
| `dealId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `jobPhaseId` | uuid (nebo null) | ne |  |  |  |
| `tags` | pole (text) | ne |  | počet ≤ 30 |  |
| `attendees` | pole (libovolné) | ne |  | počet ≤ 50 |  |
| `sendInvites` | ano/ne | ne |  |  |  |
| `outcome` | text (nebo null) | ne |  | délka ≤ 5000 |  |
| `id` | uuid | ano |  |  |  |
