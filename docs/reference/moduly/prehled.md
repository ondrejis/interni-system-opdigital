# Modul Přehled (prehled)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Úvodní přehled: nástěnky s čísly a seznamy z pohledů, poslední změny a rychlé odkazy.

- **Identifikátor:** `prehled`, ikona `layout-dashboard`
- **Závisí na:** žádném modulu
- **Balíček:** `packages/modules/prehled`
- **Vyprávěcí dokumentace:** [docs/moduly/prehled.md](../../moduly/prehled.md)
- **Příkazy:** žádné
- **Entity:** žádné
- **Databáze:** [tabulky a migrace](../databaze/prehled.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Přehled | `/prehled` | `layout-dashboard` | `prehled.read` | Práce |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/prehled` | Přehled | `prehled.read` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `prehled.read` | Vidí úvodní přehled |  |

## Serverová část

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | params | compute |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `prehled.recent_changes` | `Poslední změny` | `Co se v systému naposledy dělo: poslední změny záznamů, které smíte vidět (soukromé záznamy Ondřeje partner nevidí).` | `number` | `list` | `activity.read` | pole (1) | funkce |

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `prehled.metric.recent_changes` | funkce |
| `prehled.metric.recent_changes_mine` | funkce |
| `prehled.widget.seznam.company` | funkce |
| `prehled.widget.cislo.company` | funkce |
| `prehled.widget.seznam.person` | funkce |
| `prehled.widget.cislo.person` | funkce |
| `prehled.widget.seznam.job` | funkce |
| `prehled.widget.cislo.job` | funkce |
| `prehled.widget.seznam.deal` | funkce |
| `prehled.widget.cislo.deal` | funkce |
| `prehled.widget.seznam.task` | funkce |
| `prehled.widget.cislo.task` | funkce |
| `prehled.widget.seznam.note` | funkce |
| `prehled.widget.cislo.note` | funkce |
| `prehled.widget.seznam.payment` | funkce |
| `prehled.widget.cislo.payment` | funkce |
| `prehled.widget.seznam.time_entry` | funkce |
| `prehled.widget.cislo.time_entry` | funkce |
