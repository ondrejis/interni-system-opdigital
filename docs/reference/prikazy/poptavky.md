# Příkazy modulu CRM

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [CRM](../moduly/poptavky.md). Počet příkazů: 5.

### poptavky.convert

Kvalifikace poptávky (příkaz zůstal pod původním jménem `poptavky.convert` kvůli kompatibilitě): jedním krokem určí firmu a kontaktní osobu (vybranou, existující podle IČO, e-mailu a telefonu, nebo novou), založí zakázku (číslo ze série) v prvním stavu fáze poptávka a poptávku označí jako kvalifikovanou (stav typu „vyhráno“). Volitelně přijme data první aktivity. Vše v jedné transakci. Vyžaduje zapnutý modul zakázek.

Duplicity: `duplicates` = `ask` (výchozí; shoda v e-mailu nebo telefonu skončí větou, která duplicitu pojmenuje), `use` (použije nalezený záznam), `create` (založí nový). Shoda v IČO použije existující firmu vždy.

- **Oprávnění:** `poptavky.convert` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `companyId` | uuid | ne |  |  |  |
| `personId` | uuid | ne |  |  |  |
| `title` | text | ne |  | délka 2–200 |  |
| `ico` | text | ne |  | délka ≤ 20 |  |
| `duplicates` | enum | ne | `ask`, `use`, `create` | výchozí `"ask"` |  |
| `companyData` | objekt | ne |  |  |  |
| `companyData.name` | text | ne |  | délka 1–200 |  |
| `companyData.dic` | text | ne |  | délka ≤ 20 |  |
| `companyData.street` | text | ne |  | délka ≤ 200 |  |
| `companyData.city` | text | ne |  | délka ≤ 120 |  |
| `companyData.zip` | text | ne |  | délka ≤ 12 |  |
| `companyData.web` | text | ne |  | délka ≤ 200 |  |
| `companyData.type` | text | ne |  | délka ≤ 40 |  |
| `firstActivity` | objekt | ne |  |  |  |
| `firstActivity.typeKey` | text | ne |  | délka 1–40; výchozí `"call"` |  |
| `firstActivity.subject` | text | ano |  | délka 1–200 |  |
| `firstActivity.dueAt` | datum a čas | ano |  |  |  |
| `firstActivity.allDay` | ano/ne | ne |  | výchozí `false` |  |
| `firstActivity.durationMin` | celé číslo | ne |  | hodnota 1–1440 |  |
| `firstActivity.note` | text | ne |  | délka ≤ 5000 |  |
| `firstActivity.assigneeId` | uuid | ne |  |  |  |

### poptavky.createIntakeKey

- **Oprávnění:** `poptavky.intake` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `name` | text | ano |  | délka 2–80 |  |

### poptavky.intakeKeys

- **Oprávnění:** `poptavky.intake` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/server.ts`

_Bez vstupních polí._

### poptavky.markLost

Prohra: stav „prohráno“ a důvod z číselníku. Důvod je povinný (hlídá to i entita).

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `reason` | text | ano |  | délka 1–60 |  |

### poptavky.revokeIntakeKey

- **Oprávnění:** `poptavky.intake` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/server.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
