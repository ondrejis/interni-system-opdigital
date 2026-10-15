# Modul Hodiny (hodiny)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Zápis odpracovaného času k zakázkám a úkolům: týdenní mřížka, formáty 1,5 a 1:30, souhrny podle zakázky.

- **Identifikátor:** `hodiny`, ikona `clock`
- **Závisí na:** [`zakazky`](zakazky.md)
- **Balíček:** `packages/modules/hodiny`
- **Vyprávěcí dokumentace:** [docs/moduly/hodiny.md](../../moduly/hodiny.md)
- **Příkazy:** [9 příkazů](../prikazy/hodiny.md)
- **Entity:** [`time_entry`](../entity/hodiny.md#time_entry)
- **Databáze:** [tabulky a migrace](../databaze/hodiny.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Hodiny | `/hodiny` | `clock` | `hodiny.read` | Realizace |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/hodiny` | Hodiny | `hodiny.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `hodiny.read` | Vidí odpracované hodiny | Rozsah „jen moje“ = jen vlastní záznamy |
| `hodiny.write` | Zapisuje a upravuje hodiny |  |
| `hodiny.delete` | Maže záznamy hodin |  |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `job` | `hodiny` | Hodiny | `hodiny.read` |  | 140 |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `job` | `hodiny.log` | Zapsat čas | `hodiny.write` |  | ano |

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `hodiny.log` | `Zapsat hodiny` | `čas hodiny výkaz odpracováno` | `clock` | `hodiny.write` | `/hodiny?zapsat=1` |

### slots

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `TaskTimeExtra`

## Serverová část

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute | params |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hodiny.week` | `Hodiny tento týden` | `Odpracovaný čas v období (bez zvoleného období tento týden od pondělí). Při rozsahu „jen moje“ jen vaše hodiny; hodiny soukromých zakázek vidí jen vlastník.` | `minutes` | `scalar` | `hodiny.read` | funkce |  |
| `hodiny.by_job` | `Hodiny podle zakázky nebo osoby` | `Odpracovaný čas v období rozdělený podle zakázky, nebo podle osoby. Bez zvoleného období za celou dobu. Bez peněz.` | `minutes` | `series` | `hodiny.read` | funkce | pole (1) |

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `hodiny.weekView` | funkce |
| `hodiny.week` | funkce |
| `hodiny.by_job` | funkce |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `time_entry` | `time_entry` |
