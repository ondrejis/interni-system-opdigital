# Modul Kontakty (kontakty)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Firmy a osoby: typ, hierarchie, štítky, více telefonů a e-mailů, doplnění z ARES, kontrola duplicit a jejich sloučení.

- **Identifikátor:** `kontakty`, ikona `contact`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/kontakty`
- **Vyprávěcí dokumentace:** [docs/moduly/kontakty.md](../../moduly/kontakty.md)
- **Příkazy:** [7 příkazů](../prikazy/kontakty.md)
- **Entity:** [`company`](../entity/kontakty.md#company), [`person`](../entity/kontakty.md#person)
- **Databáze:** [tabulky a migrace](../databaze/kontakty.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Firmy | `/kontakty/firmy` | `building-2` | `kontakty.read` | Obchod |  |
| Osoby | `/kontakty/osoby` | `users` | `kontakty.read` | Obchod |  |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `kontakty.read` | Vidí kontakty |  |
| `kontakty.write` | Upravuje kontakty |  |
| `kontakty.merge` | Slučuje duplicitní kontakty | Sloučení firmy nebo osoby přepojí zakázky, poptávky, faktury a další záznamy na jiný kontakt; nejde vrátit |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Číselníky

| Klíč | Název | Hodnoty |
| --- | --- | --- |
| `company.type` | Typ kontaktu (firma) | `investor` (Investor), `architect` (Architekt), `designer` (Projektant), `general_contractor` (Generální dodavatel), `subcontractor` (Subdodavatel), `supplier` (Dodavatel materiálu), `developer` (Developer), `property_manager` (Správce nemovitostí), `public_body` (Úřad / veřejný zadavatel), `other` (Jiný) |
| `person.role` | Role osoby | `investor` (Investor), `architect` (Architekt), `designer` (Projektant), `tdi` (Technický dozor investora), `site_manager` (Stavbyvedoucí), `purchaser` (Nákupčí), `accountant` (Účetní), `other` (Jiná) |
| `contact.point_type` | Typ telefonu a e-mailu | `work` (Práce), `mobile` (Mobil), `home` (Domů), `billing` (Fakturace), `other` (Jiný) |
| `contact.tag` | Štítky kontaktů | `vip` (VIP), `partner` (Partner), `repeat` (Opakovaný zákazník), `slow_payer` (Pomalý plátce) |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `osoby` | Osoby | `kontakty.read` |  |  |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `company` | `merge` | Sloučit duplicitu | `kontakty.merge` |  | ano |
| `person` | `merge` | Sloučit duplicitu | `kontakty.merge` |  | ano |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `person` | `contact-points` | side | 5 | `kontakty.read` |  |

## Serverová část

### Blokace smazání

| Blokace | Mazaná entita | Navázané záznamy (1 / 2–4 / 5+) | Doporučení |
| --- | --- | --- | --- |
| `kontakty.company-people` | `company` | osobu / osoby / osob | výchozí |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `company` | `company` |
| `person` | `person` |
