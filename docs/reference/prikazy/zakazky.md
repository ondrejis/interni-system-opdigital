# Příkazy modulu Zakázky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Zakázky](../moduly/zakazky.md). Počet příkazů: 11.

### zakazky.phase.preview

Pro každou možnou další fázi: jde přechod, a když ne, které kontroly nejsou splněné.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/lifecycle/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.team.add

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `userId` | uuid | ano |  |  |  |
| `role` | text (nebo null) | ne |  | délka ≤ 60 |  |

### zakazky.team.list

- **Oprávnění:** stačí přihlášení; přístup k datům hlídá vrstva dat (viz [ADR 007](../../adr/007-opravneni-v-datove-vrstve.md))
- **Definice:** `packages/modules/zakazky/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### zakazky.team.remove

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `userId` | uuid | ano |  |  |  |

### zakazky.template.apply

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `templateId` | uuid | ano |  |  |  |

### zakazky.template.createFromJob

Vytvoří šablonu z existující zakázky (nebo přepíše šablonu `replaceId`).

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `name` | text | ano |  | délka 2–120 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 1000 |  |
| `includeTasks` | ano/ne | ne |  | výchozí `true` |  |
| `includeRoles` | ano/ne | ne |  | výchozí `true` |  |
| `replaceId` | uuid | ne |  |  |  |

### zakazky.template.delete

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.template.get

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### zakazky.template.list

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

_Bez vstupních polí._

### zakazky.template.save

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/templates/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `name` | text | ne |  | délka 2–120 |  |
| `description` | text (nebo null) | ne |  | délka ≤ 1000 |  |

### zakazky.transition

Přechod zakázky do fáze. Je to jen pohodlný vstup do téže cesty jako změna stavu v tabulce nebo na kanbanu: vybere stav fáze (první, nebo zadaný) a změní ho přes entitu, takže platí stejné kontroly a hooky.

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/zakazky/src/lifecycle/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `to` | enum | ano | `inquiry`, `offer`, `preparation`, `execution`, `handover`, `warranty`, `closed`, `lost`, `paused` |  |  |
| `stageId` | uuid | ne |  |  |  |
| `reason` | text | ne |  | délka ≤ 60 |  |
