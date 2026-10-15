# Příkazy modulu Organizace a kontakty

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Organizace a kontakty](../moduly/kontakty.md). Počet příkazů: 13.

### kontakty.ares

Doplnění organizace z ARES podle IČO (ORG-03, ORG-04). Bez `apply` vrací náhled změn (do 2 s, cache 24 h); s `apply: true` a `companyId` zapíše vybraná pole a čas synchronizace. Nikdy nevyhodí chybu kvůli síti: `ok: false` nese větu pro uživatele a organizaci jde uložit ručně.

- **Oprávnění:** `kontakty.ares` nebo `kontakty.write` nebo `obchody.write` nebo `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `ico` | text | ne |  | délka ≤ 20 |  |
| `companyId` | uuid | ne |  |  |  |
| `apply` | ano/ne | ne |  |  |  |
| `fields` | pole (enum) | ne | `name`, `officialName`, `ico`, `dic`, `legalForm`, `street`, `city`, `zip` | počet ≤ 8 |  |

### kontakty.ares.test

Test ARES pro Nastavení → Integrace: zkusí stáhnout zkušební subjekt (bez cache) a změří dobu odpovědi proti limitu 2 s (NFR-04). Nic neukládá.

- **Oprávnění:** `kontakty.ares` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

_Bez vstupních polí._

### kontakty.company.checkDuplicates

Kontrola duplicit organizace: stejné IČO (nejde uložit), podobný název nebo doména webu („Možná duplicita“).

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `name` | text | ne |  | délka ≤ 200 |  |
| `ico` | text | ne |  | délka ≤ 20 |  |
| `web` | text | ne |  | délka ≤ 300 |  |
| `excludeId` | uuid | ne |  |  |  |

### kontakty.company.contacts

Kontakty organizace (hlavní i další) s hlavním telefonem a e-mailem pro kartu a záložku.

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `companyId` | uuid | ano |  |  |  |

### kontakty.merge.apply

Sloučení duplicity (jen vlastník): `sourceId` zanikne a všechno, co na něj odkazovalo, přejde na `targetId` (hlavní záznam). Nevratné z rozhraní, proto vyžaduje výslovné `confirm: true`.

- **Oprávnění:** `kontakty.merge` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entity` | enum | ano | `company`, `person` |  |  |
| `sourceId` | uuid | ano |  |  |  |
| `targetId` | uuid | ano |  |  |  |
| `confirm` | konstanta | ano | `true` |  |  |

### kontakty.merge.preview

Náhled sloučení: co se přepojí a doplní. Nic nemění.

- **Oprávnění:** `kontakty.merge` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entity` | enum | ano | `company`, `person` |  |  |
| `sourceId` | uuid | ano |  |  |  |
| `targetId` | uuid | ano |  |  |  |

### kontakty.person.checkDuplicates

Kontrola duplicit osoby podle e-mailu a telefonu (E.164, nezávisle na mezerách a předvolbě).

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `emails` | pole (text) | ne |  | počet ≤ 20 |  |
| `phones` | pole (text) | ne |  | počet ≤ 20 |  |
| `excludeId` | uuid | ne |  |  |  |

### kontakty.person.companies

Organizace osoby: hlavní a další s rolí.

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `personId` | uuid | ano |  |  |  |

### kontakty.person.points

Kontaktní údaje osoby (e-maily a telefony se štítkem a hlavním).

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `personId` | uuid | ano |  |  |  |

### kontakty.person.quickCreate

Rychlé založení kontaktu (z organizace, obchodu, zakázky, palety): jméno, volitelně organizace, pozice a více e-mailů a telefonů. Při shodě e-mailu nebo telefonu s existující osobou nic nezaloží a vrátí shody; `force: true` založí i přesto (člověk se rozhodl).

- **Oprávnění:** `kontakty.create` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `firstName` | text | ne |  | délka ≤ 100 |  |
| `lastName` | text | ano |  | délka 1–100 |  |
| `companyId` | uuid | ne |  |  |  |
| `position` | text | ne |  | délka ≤ 150 |  |
| `linkedin` | text | ne |  | délka ≤ 300 |  |
| `isDecisionMaker` | ano/ne | ne |  |  |  |
| `points` | pole objektů | ne |  | počet ≤ 20 |  |
| `points[].id` | uuid | ne |  |  |  |
| `points[].kind` | enum | ano | `email`, `phone` |  |  |
| `points[].value` | text | ano |  | délka ≤ 200 |  |
| `points[].label` | enum (nebo null) | ne | `work`, `mobile`, `private` |  |  |
| `points[].isPrimary` | ano/ne | ne |  |  |  |
| `force` | ano/ne | ne |  |  |  |

### kontakty.person.setCompanies

Nastaví hlavní organizaci osoby a nahradí její další organizace s rolí.

- **Oprávnění:** `kontakty.write` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `personId` | uuid | ano |  |  |  |
| `primaryCompanyId` | uuid (nebo null) | ne |  |  |  |
| `others` | pole objektů | ano |  | počet ≤ 30 |  |
| `others[].companyId` | uuid | ano |  |  |  |
| `others[].role` | text (nebo null) | ne |  | délka ≤ 100 |  |
| `others[].position` | text (nebo null) | ne |  | délka ≤ 150 |  |

### kontakty.person.setPoints

Nahradí kontaktní údaje osoby (hlavní jsou právě jeden e-mail a jeden telefon).

- **Oprávnění:** `kontakty.write` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `personId` | uuid | ano |  |  |  |
| `points` | pole objektů | ano |  | počet ≤ 40 |  |
| `points[].id` | uuid | ne |  |  |  |
| `points[].kind` | enum | ano | `email`, `phone` |  |  |
| `points[].value` | text | ano |  | délka ≤ 200 |  |
| `points[].label` | enum (nebo null) | ne | `work`, `mobile`, `private` |  |  |
| `points[].isPrimary` | ano/ne | ne |  |  |  |

### kontakty.search

Hledání organizací a osob pro výběr (rychlé zadání obchodu, účastníci zakázky, sloučení, šablony e-mailů): podle jména bez diakritiky, IČO, e-mailu a části telefonu bez předvolby.

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `q` | text | ne |  | délka ≤ 100 |  |
| `limit` | celé číslo | ne |  | hodnota 1–25 |  |
| `kinds` | pole (enum) | ne | `company`, `person` | počet ≤ 2 |  |
