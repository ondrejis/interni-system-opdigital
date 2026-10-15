# Modul Obchody (obchody)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Obchodní příležitosti: pipeline s pravděpodobnostmi, board se součty, výhra (založení zakázek) a prohra s důvodem.

- **Identifikátor:** `obchody`, ikona `target`
- **Závisí na:** [`kontakty`](kontakty.md), [`zakazky`](zakazky.md)
- **Balíček:** `packages/modules/obchody`
- **Vyprávěcí dokumentace:** [docs/moduly/obchody.md](../../moduly/obchody.md)
- **Příkazy:** [24 příkazů](../prikazy/obchody.md)
- **Entity:** [`deal`](../entity/obchody.md#deal)
- **Databáze:** [tabulky a migrace](../databaze/obchody.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Obchody | `/obchody` | `target` | `obchody.read` | CRM |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |

UI modulu vykresluje i adresy bez záznamu v manifestu: `/obchody`.

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `obchody.read` | Vidí obchody |  |
| `obchody.create` | Zakládá obchody |  |
| `obchody.write` | Upravuje obchody | Přesun mezi fázemi, výhra, prohra, znovuotevření |
| `obchody.delete` | Maže obchody | Do koše; obnovit smí každý své |
| `obchody.export` | Exportuje obchody |  |
| `obchody.pipelines` | Spravuje pipeline obchodů | Fáze, pravděpodobnosti a lhůty |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Pipeline

| Entita | Klíč | Název | Stavy (v pořadí) |
| --- | --- | --- | --- |
| `deal` | `default` | Obchody | Nová poptávka → Kontaktováno → Schůzka / konzultace → Nabídka odeslaná → Vyjednávání |

### Číselníky

| Klíč | Název | Hodnoty |
| --- | --- | --- |
| `deal.lost_reason` | Důvod prohry obchodu | `price` (Cena), `competitor` (Vybrali konkurenci), `no_response` (Nereaguje), `postponed` (Odloženo), `unsuitable_client` (Nevhodný klient), `other` (Jiné) |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `deal` | `next-activity` | main | 10 |  |  |
| `deal` | `quick-entries` | main | 20 |  |  |
| `deal` | `timeline` | main | 90 |  |  |
| `deal` | `contacts` | side | 10 |  |  |
| `deal` | `stage-time` | side | 20 |  |  |
| `deal` | `source` | side | 30 |  |  |

Vlastní hlavičku detailu (pás pod názvem) mají entity: `deal`.

### kanbanCard

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| Klíč | body | footer |
| --- | --- | --- |
| `deal` | funkce | funkce |

### kanbanColumnHeader

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `DealColumnHeader`

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `obchody.new` | `Nový obchod` | `obchod příležitost lead nový` | `target` | `obchody.create` | `/obchody?novy=1` |

## Serverová část

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: dlaždice přehledu: 1 poskytovatelů.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute |
| --- | --- | --- | --- | --- | --- | --- |
| `obchody.pipeline_value` | `Pipeline v Kč podle fází` | `Součet hodnot a vážený součet (hodnota × pravděpodobnost fáze) otevřených obchodů po fázích.` | `money` | `series` | `obchody.read` | funkce |
| `obchody.pipeline_total` | `Hodnota otevřených obchodů` |  | `money` | `scalar` | `obchody.read` | funkce |
| `obchody.pipeline_weighted` | `Vážená hodnota otevřených obchodů` |  | `money` | `scalar` | `obchody.read` | funkce |
| `obchody.my_open` | `Moje otevřené obchody` | `Počet otevřených obchodů, jejichž vlastníkem je přihlášený uživatel.` | `number` | `scalar` | `obchody.read` | funkce |
| `obchody.no_activity` | `Obchody bez další aktivity` | `Počet otevřených obchodů bez naplánované další aktivity (každý má mít další krok).` | `number` | `scalar` | `obchody.read` | funkce |

### contributions

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 2. `pole (1)`, `pole (1)`

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `obchody.dashboardMetrics` | funkce |
| `obchody.widgets` | funkce |
| `obchody.clientCard` | funkce |
| `obchody.emailVars` | funkce |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `deal` | `deal` |
