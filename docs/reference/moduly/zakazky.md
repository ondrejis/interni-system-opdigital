# Modul Zakázky (zakazky)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Zakázky: fáze, termíny, tým, šablony, komentáře a úkoly (kostra, model se přepracovává).

- **Identifikátor:** `zakazky`, ikona `briefcase`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/zakazky`
- **Vyprávěcí dokumentace:** [docs/moduly/zakazky.md](../../moduly/zakazky.md)
- **Příkazy:** [11 příkazů](../prikazy/zakazky.md)
- **Entity:** [`job`](../entity/zakazky.md#job)
- **Databáze:** [tabulky a migrace](../databaze/zakazky.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Zakázky | `/zakazky` | `briefcase` | `zakazky.read` | Obchod |  |
| Šablony | `/zakazky/sablony` | `clipboard-list` | `zakazky.read` |  | `/zakazky` |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/zakazky/sablony` | Šablony zakázek | `zakazky.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `zakazky.read` | Vidí zakázky |  |
| `zakazky.write` | Upravuje zakázky |  |
| `zakazky.finance` | Vidí hodnotu a finance zakázek | Hodnota zakázky a částky odvozené z ní (vážená hodnota obchodů) |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Pipeline

| Entita | Klíč | Název | Stavy (v pořadí) |
| --- | --- | --- | --- |
| `job` | `default` | Zakázky | Nová poptávka → Kontaktováno → Obhlídka → Nabídka v přípravě → Nabídka odeslána → Jednání → Příprava → Realizace → Předání → Záruka → Uzavřeno → Prohráno → Pozastaveno |

### Číselníky

| Klíč | Název | Hodnoty |
| --- | --- | --- |
| `job.lost_reason` | Důvod prohry zakázky | `price` (Cena), `timing` (Termín), `competitor` (Vybrali konkurenci), `no_response` (Bez odezvy), `cancelled` (Zákazník zrušil záměr), `other` (Jiný důvod) |
| `job.source` | Zdroj obchodu | `web` (Web), `phone` (Telefon), `email` (E-mail), `referral` (Doporučení), `personal` (Osobně), `other` (Jiný) |

### Číselné řady

| Klíč | Vzor | Nulování |
| --- | --- | --- |
| `zakazky.cislo` | `Z-{YYYY}-{NNN}` |  |

### Výchozí pohledy

| Entita | Název | Pořadí |
| --- | --- | --- |
| `job` | Moje zakázky | 10 |
| `job` | Nabídky čekající na odpověď | 20 |
| `job` | V realizaci | 30 |
| `job` | Po termínu | 40 |
| `job` | V záruce | 50 |
| `job` | Kanban podle stavu | 60 |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `zakazky` | Zakázky | `zakazky.read` |  |  |  |
| `person` | `zakazky` | Zakázky | `zakazky.read` |  |  |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `job` | `change-phase` | Změnit fázi | `zakazky.write` |  | ano |
| `job` | `save-as-template` | Uložit jako šablonu | `zakazky.write` |  | ano |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `job` | `source-inquiry` | main | 90 |  |  |
| `job` | `team` | side | 10 |  |  |

Vlastní hlavičku detailu (pás pod názvem) mají entity: `job`.

Základní záložky, které modul u entity skrývá: `job`: `activity`.

## Serverová část

### Háčky přechodu fáze

| Háček | Entita | Z fáze | Do fáze | Kontrola | Akce před | Akce po |
| --- | --- | --- | --- | --- | --- | --- |
| `lifecycle.offer-requirements` | `job` | `*` | `offer` | ano |  |  |
| `lifecycle.execution-requirements` | `job` | `*` | `execution` | ano |  |  |
| `lifecycle.warranty-requirements` | `job` | `*` | `warranty` | ano |  | ano |
| `lifecycle.skip-warranty` | `job` | `handover` | `closed` | ano |  |  |

### Blokace smazání

| Blokace | Mazaná entita | Navázané záznamy (1 / 2–4 / 5+) | Doporučení |
| --- | --- | --- | --- |
| `zakazky.company-jobs` | `company` | zakázku / zakázky / zakázek | výchozí |
| `zakazky.person-jobs` | `person` | zakázku / zakázky / zakázek | výchozí |

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `zakazky.warranty-end` | Konec záruky | `indigo` |

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 1 poskytovatelů.

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `job` | `job` |
