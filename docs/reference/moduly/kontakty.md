# Modul Organizace a kontakty (kontakty)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Organizace (klient je organizace se stavem klienta) a kontaktní osoby: více telefonů a e-mailů, doplnění z ARES, kontrola duplicit a jejich sloučení.

- **Identifikátor:** `kontakty`, ikona `contact`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/kontakty`
- **Vyprávěcí dokumentace:** [docs/moduly/kontakty.md](../../moduly/kontakty.md)
- **Příkazy:** [13 příkazů](../prikazy/kontakty.md)
- **Entity:** [`company`](../entity/kontakty.md#company), [`person`](../entity/kontakty.md#person)
- **Databáze:** [tabulky a migrace](../databaze/kontakty.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Organizace | `/kontakty/firmy` | `building-2` | `kontakty.read` | CRM |  |
| Kontakty | `/kontakty/osoby` | `users` | `kontakty.read` | CRM |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/kontakty/firmy/nova` | Nová organizace | `kontakty.create` | ano |
| `/kontakty/osoby/novy` | Nový kontakt | `kontakty.create` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `kontakty.read` | Vidí organizace a kontakty |  |
| `kontakty.create` | Zakládá organizace a kontakty |  |
| `kontakty.write` | Upravuje organizace a kontakty |  |
| `kontakty.delete` | Maže organizace a kontakty | Do koše; obnovit smí každý své |
| `kontakty.export` | Exportuje organizace a kontakty |  |
| `kontakty.merge` | Slučuje duplicitní kontakty | Sloučení firmy nebo osoby přepojí zakázky, obchody a další záznamy na jiný kontakt; nejde vrátit |
| `kontakty.ares` | Doplňuje údaje z ARES |  |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `kontakty` | Kontakty | `kontakty.read` |  | 20 |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `company` | `ares` | Aktualizovat z ARES | `kontakty.ares` nebo `kontakty.write` |  | ano |
| `company` | `merge` | Sloučit duplicitu | `kontakty.merge` |  | ano |
| `person` | `call` | Zavolat | `kontakty.read` |  |  |
| `person` | `write` | Napsat e-mail | `kontakty.read` |  |  |
| `person` | `merge` | Sloučit duplicitu | `kontakty.merge` |  | ano |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `company` | `kontakty-souhrn` | main | 10 | `kontakty.read` |  |
| `company` | `mozna-duplicita` | side | 10 | `kontakty.read` |  |
| `person` | `kontaktni-udaje` | side | 5 | `kontakty.read` |  |
| `person` | `organizace-osoby` | main | 10 | `kontakty.read` |  |
| `person` | `mobil-akce` | main | 0 | `kontakty.read` |  |

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `kontakty.new-person` | `Nový kontakt` | `osoba člověk kontakt telefon` | `users` | `kontakty.create` | `/kontakty/osoby/novy` |
| `kontakty.new-company` | `Nová organizace` | `firma organizace ares ičo` | `building-2` | `kontakty.create` | `/kontakty/firmy/nova` |

### slots

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `AresIntegrationPanel`

## Serverová část

### Blokace smazání

| Blokace | Mazaná entita | Navázané záznamy (1 / 2–4 / 5+) | Doporučení |
| --- | --- | --- | --- |
| `kontakty.company-people` | `company` | osobu / osoby / osob | výchozí |

### contributions

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 2. `pole (1)`, `pole (2)`

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `kontakty.clientCard.tabCounts` | funkce |
| `kontakty.clientCard.summary` | funkce |
| `kontakty.emailVars.company` | funkce |
| `kontakty.emailVars.person` | funkce |
| `kontakty.api.getPrimaryContact` | funkce |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `company` | `company` |
| `person` | `person` |
