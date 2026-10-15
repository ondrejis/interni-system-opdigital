# Příkazy modulu Klienti

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Klienti](../moduly/klienti.md). Počet příkazů: 6.

### klienti.list

Seznam klientů (KLI-03): výchozí lead, aktivní a pozastavení; sloupce z příspěvků modulů.

- **Oprávnění:** `klienti.read` (stačí kterékoli)
- **Definice:** `packages/modules/klienti/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `includeFormer` | ano/ne | ne |  | výchozí `false` |  |
| `search` | text | ne |  | délka ≤ 100 |  |

### klienti.saveContext

Uloží pole kontextu klienta (KLI-06; autosave po jednom poli).

- **Oprávnění:** `klienti.write` (stačí kterékoli)
- **Definice:** `packages/modules/klienti/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |
| `decisionMaker` | text | ne |  | délka ≤ 5000 |  |
| `howToCommunicate` | text | ne |  | délka ≤ 5000 |  |
| `history` | text | ne |  | délka ≤ 10000 |  |
| `notes` | text | ne |  | délka ≤ 5000 |  |
| `endReason` | text | ne |  | délka ≤ 1000 |  |

### klienti.setServices

Úplný seznam služeb klienta.

- **Oprávnění:** `klienti.write` (stačí kterékoli)
- **Definice:** `packages/modules/klienti/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |
| `services` | pole (enum) | ano | `web`, `marketing`, `systemy` | počet ≤ 3 |  |

### klienti.setStatus

Změna stavu klienta (KLI-02): Bývalý vyžaduje důvod, „klient od“ se uloží při prvním přechodu na Aktivní.

- **Oprávnění:** `klienti.write` (stačí kterékoli)
- **Definice:** `packages/modules/klienti/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |
| `status` | enum | ano | `lead`, `active`, `paused`, `former` |  |  |
| `reason` | text | ne |  | délka ≤ 1000 |  |
| `endedOn` | text | ne |  | vzor `^\d{4}-\d{2}-\d{2}$` |  |

### klienti.summary

Souhrn karty klienta (KLI-05, KLI-10).

- **Oprávnění:** `klienti.read` (stačí kterékoli)
- **Definice:** `packages/modules/klienti/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |

### klienti.tabCounts

Počty záložek karty a záložky bez dat (KLI-07, ORG-08).

- **Oprávnění:** `klienti.read` (stačí kterékoli)
- **Definice:** `packages/modules/klienti/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |
