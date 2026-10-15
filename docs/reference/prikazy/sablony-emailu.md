# Příkazy modulu Šablony e-mailů

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Šablony e-mailů](../moduly/sablony-emailu.md). Počet příkazů: 8.

### sablony-emailu.logActivity

Zapíše e-mail jako hotovou aktivitu (typ e-mail) přes službu úkolů (SAB-04); oprávnění ověří služba.

- **Oprávnění:** `sablony-emailu.read` (stačí kterékoli)
- **Definice:** `packages/modules/sablony-emailu/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entityType` | enum | ano | `company`, `person`, `deal`, `job` |  |  |
| `id` | uuid | ano |  |  |  |
| `subject` | text | ano |  | délka 1–500 |  |

### sablony-emailu.markUsed

Započítá použití šablony (otevření v Gmailu nebo kopie); vrací, zda jde nabídnout zápis aktivity (SAB-04).

- **Oprávnění:** `sablony-emailu.read` (stačí kterékoli)
- **Definice:** `packages/modules/sablony-emailu/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `templateId` | uuid | ano |  |  |  |

### sablony-emailu.pick

Hledání kontaktů, organizací, obchodů a zakázek, kterými se náhled vyplní.

- **Oprávnění:** `sablony-emailu.read` (stačí kterékoli)
- **Definice:** `packages/modules/sablony-emailu/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `kind` | enum | ano | `company`, `person`, `deal`, `job` |  |  |
| `q` | text | ne |  | délka ≤ 100 |  |

### sablony-emailu.preview

Náhled rozepsané šablony s daty vybraných záznamů (editor, SAB-02).

- **Oprávnění:** `sablony-emailu.read` (stačí kterékoli)
- **Definice:** `packages/modules/sablony-emailu/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `subject` | text | ano |  | délka ≤ 500 |  |
| `body` | text | ano |  | délka ≤ 50000 |  |
| `context` | objekt | ne |  | výchozí `{}` |  |
| `context.personId` | uuid (nebo null) | ne |  |  |  |
| `context.companyId` | uuid (nebo null) | ne |  |  |  |
| `context.dealId` | uuid (nebo null) | ne |  |  |  |
| `context.jobId` | uuid (nebo null) | ne |  |  |  |

### sablony-emailu.render

E-mail ze šablony pro kontakt, organizaci, obchod nebo zakázku (SAB-03): vyplněný předmět a text, adresát a adresa pro Gmail (`gmailUrl`; `null` + `tooLong` při překročení limitu délky, R-46). Nic se neodesílá (SAB-05).

- **Oprávnění:** `sablony-emailu.read` (stačí kterékoli)
- **Definice:** `packages/modules/sablony-emailu/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entityType` | enum | ano | `company`, `person`, `deal`, `job` |  |  |
| `id` | uuid | ano |  |  |  |
| `templateId` | uuid | ano |  |  |  |

### sablony-emailu.saveContent

Uloží předmět a text šablony z editoru.

- **Oprávnění:** `sablony-emailu.write` (stačí kterékoli)
- **Definice:** `packages/modules/sablony-emailu/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `subject` | text | ano |  | délka ≤ 500 |  |
| `bodyText` | text | ano |  | délka ≤ 50000 |  |
| `expectedUpdatedAt` | text | ne |  |  |  |

### sablony-emailu.templates

Šablony pro výběr v dialogu „E-mail ze šablony“ (nejpoužívanější první; SAB-01).

- **Oprávnění:** `sablony-emailu.read` (stačí kterékoli)
- **Definice:** `packages/modules/sablony-emailu/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `q` | text | ne |  | délka ≤ 100 |  |
| `language` | enum | ne | `cs`, `sk`, `en` |  |  |
| `category` | text | ne |  | délka ≤ 100 |  |

### sablony-emailu.variables

Katalog proměnných šablon (příspěvky zapnutých modulů + výchozí) pro editor a nápovědu.

- **Oprávnění:** `sablony-emailu.read` (stačí kterékoli)
- **Definice:** `packages/modules/sablony-emailu/src/commands.ts`

_Bez vstupních polí._
