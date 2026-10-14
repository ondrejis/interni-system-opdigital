# Příkazy modulu Kontakty

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Kontakty](../moduly/kontakty.md). Počet příkazů: 7.

### kontakty.ares

Doplnění firmy z ARES podle IČO. Nikdy nevyhodí chybu kvůli síti: výsledek `ok: false` nese větu pro uživatele. Počet dotazů na uživatele je omezený (ochrana veřejného API i aplikace).

- **Oprávnění:** `kontakty.write` nebo `poptavky.write` nebo `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `ico` | text | ano |  | délka 1–20 |  |

### kontakty.duplicates

Kontrola duplicit podle IČO, e-mailu a telefonu (zakládání obchodů a rychlé zadání ukážou nalezené záznamy k výběru).

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `ico` | text | ne |  | délka ≤ 20 |  |
| `email` | text | ne |  | délka ≤ 200 |  |
| `phone` | text | ne |  | délka ≤ 40 |  |

### kontakty.merge.preview

Náhled sloučení: co se přepojí a doplní. Nic nemění.

- **Oprávnění:** `kontakty.merge` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entity` | enum | ano | `company`, `person` |  |  |
| `sourceId` | uuid | ano |  |  |  |
| `targetId` | uuid | ano |  |  |  |

### kontakty.merge.run

Sloučení duplicity: `sourceId` zanikne a všechno, co na něj odkazovalo, přejde na `targetId`. Nevratné z uživatelského rozhraní, proto vyžaduje výslovné `confirm: true`.

- **Oprávnění:** `kontakty.merge` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entity` | enum | ano | `company`, `person` |  |  |
| `sourceId` | uuid | ano |  |  |  |
| `targetId` | uuid | ano |  |  |  |
| `confirm` | konstanta | ano | `true` |  |  |

### kontakty.person.points

Další e-maily a telefony osoby s typem.

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `personId` | uuid | ano |  |  |  |

### kontakty.person.setPoints

Nahradí další e-maily a telefony osoby (hlavní údaje se mění v poli osoby).

- **Oprávnění:** `kontakty.write` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `personId` | uuid | ano |  |  |  |
| `points` | pole objektů | ano |  | počet ≤ 20 |  |
| `points[].kind` | enum | ano | `email`, `phone` |  |  |
| `points[].value` | text | ano |  | délka 1–200 |  |
| `points[].label` | text (nebo null) | ne |  | délka ≤ 40 |  |

### kontakty.search

Hledání firem a osob pro výběr (rychlé zadání poptávky, účastníci zakázky, sloučení).

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/kontakty/src/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `q` | text | ne |  | délka ≤ 100 |  |
| `limit` | celé číslo | ne |  | hodnota 1–25 |  |
| `kinds` | pole (enum) | ne | `company`, `person` | počet ≤ 2 |  |
