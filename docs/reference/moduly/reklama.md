# Modul Reklama (reklama)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Reklamní účty Meta, kampaně a denní výkon, příchozí leady z formulářů (přes n8n) a jejich převod na obchody.

- **Identifikátor:** `reklama`, ikona `megaphone`
- **Závisí na:** [`kontakty`](kontakty.md), [`obchody`](obchody.md)
- **Balíček:** `packages/modules/reklama`
- **Vyprávěcí dokumentace:** [docs/moduly/reklama.md](../../moduly/reklama.md)
- **Příkazy:** [18 příkazů](../prikazy/reklama.md)
- **Entity:** [`ad_account`](../entity/reklama.md#ad_account), [`ad_campaign`](../entity/reklama.md#ad_campaign)
- **Databáze:** [tabulky a migrace](../databaze/reklama.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Reklama | `/reklama` | `megaphone` | `reklama.read` | Marketing |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |

UI modulu vykresluje i adresy bez záznamu v manifestu: `/reklama`.

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `reklama.read` | Vidí reklamní účty, kampaně a výkon |  |
| `reklama.write` | Upravuje reklamu | Přiřazení účtů a kampaní ke klientům a zakázkám |
| `reklama.manage` | Spravuje napojení na Meta | Mapování lead formulářů, ruční synchronizace |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `reklama` | Reklama | `reklama.read` |  | 80 |  |
| `job` | `reklama` | Reklama | `reklama.read` |  | 60 | ano (podle záznamu) |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `ad_account` | `reklama.account.performance` | main | 5 | `reklama.read` |  |
| `ad_account` | `reklama.account.side` | side | 5 | `reklama.read` |  |
| `ad_campaign` | `reklama.campaign.performance` | main | 5 | `reklama.read` |  |
| `ad_campaign` | `reklama.campaign.side` | side | 5 | `reklama.read` |  |

Základní záložky, které modul u entity skrývá: `ad_account`: `tasks`, `files`; `ad_campaign`: `tasks`, `files`.

### slots

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `MetaIntegrationPanel`

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `reklama.sync.daily` | `0 6 * * *` | 3 | Úloha na pozadí: denní synchronizace s Meta Ads. |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: dlaždice přehledu: 1 poskytovatelů.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute |
| --- | --- | --- | --- | --- | --- | --- |
| `reklama.leads_cpl` | `Leady z reklam po dnech` | `Leady podle Mety a leady, které opravdu dorazily do OPSYS (obchody se zdrojem Meta), po dnech.` | `number` | `series` | `reklama.read` | funkce |
| `reklama.leads` | `Leady z reklam` | `Počet leadů podle Mety za období.` | `number` | `scalar` | `reklama.read` | funkce |
| `reklama.cpl` | `Cena za lead (CPL)` | `Útrata na reklamy dělená počtem leadů podle Mety.` | `money` | `scalar` | `reklama.read` | funkce |
| `reklama.spend` | `Útrata na reklamy` |  | `money` | `scalar` | `reklama.read` | funkce |
| `reklama.cost_per_won` | `Náklad na vyhraný obchod` | `Útrata na reklamy dělená počtem vyhraných obchodů z leadů za období.` | `money` | `scalar` | `reklama.read` | funkce |

### contributions

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `pole (1)`

### ingests

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| source | externalId | handle |
| --- | --- | --- |
| `leads` | funkce | funkce |

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `reklama.dashboardMetrics` | funkce |
| `reklama.widgets` | funkce |
| `reklama.clientCard` | funkce |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `ad_account` | `ad_account` |
| `ad_campaign` | `ad_campaign` |
