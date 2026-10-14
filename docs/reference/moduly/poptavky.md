# Modul CRM (poptavky)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Obchod nad zakázkou: schránka poptávek (ručně, formulář, webhook), kvalifikace, nástěnka fází, aktivity, prognóza.

- **Identifikátor:** `poptavky`, ikona `inbox`
- **Závisí na:** [`kontakty`](kontakty.md), [`zakazky`](zakazky.md)
- **Balíček:** `packages/modules/poptavky`
- **Vyprávěcí dokumentace:** [docs/moduly/poptavky.md](../../moduly/poptavky.md)
- **Příkazy:** [5 příkazů](../prikazy/poptavky.md)
- **Entity:** [`inquiry`](../entity/poptavky.md#inquiry), [`crm_activity`](../entity/poptavky.md#crm_activity), [`crm_note`](../entity/poptavky.md#crm_note), [`crm_activity_type`](../entity/poptavky.md#crm_activity_type)
- **Databáze:** [tabulky a migrace](../databaze/poptavky.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| CRM | `/crm` | `handshake` | `poptavky.read` | Obchod |  |
| Moje dnešní práce | `/crm/dnes` | `calendar-check` | `poptavky.read` | Obchod |  |
| Schránka poptávek | `/poptavky` | `inbox` | `poptavky.read` | Obchod |  |
| Import poptávek | `/poptavky/import` | `file-stack` | `poptavky.write` |  | `/poptavky` |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/crm` | CRM | `poptavky.read` | ano |
| `/crm/dnes` | Moje dnešní práce | `poptavky.read` | ano |
| `/poptavky/prijem` | Příjem poptávek | `poptavky.intake` | ano |
| `/poptavky/import` | Import poptávek | `poptavky.write` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `poptavky.read` | Vidí poptávky |  |
| `poptavky.write` | Upravuje poptávky |  |
| `poptavky.convert` | Převádí poptávky na zakázky |  |
| `poptavky.intake` | Spravuje příjem poptávek | Klíče pro formulář a webhook na webu, záznam příchozích požadavků |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Pipeline

| Entita | Klíč | Název | Stavy (v pořadí) |
| --- | --- | --- | --- |
| `inquiry` | `default` | Poptávky | Nová → Kvalifikovaná → Zamítnutá |

### Číselníky

| Klíč | Název | Hodnoty |
| --- | --- | --- |
| `inquiry.source` | Zdroj poptávky | `web` (Web), `phone` (Telefon), `email` (E-mail), `referral` (Doporučení), `personal` (Osobně), `other` (Jiný) |
| `inquiry.lost_reason` | Důvod prohry poptávky | `price` (Cena), `timing` (Termín), `competitor` (Vybrali konkurenci), `no_response` (Bez odezvy), `cancelled` (Klient zrušil záměr), `other` (Jiný důvod) |

### Výchozí pohledy

| Entita | Název | Pořadí |
| --- | --- | --- |
| `job` | Moje otevřené | 100 |
| `job` | Bez další aktivity | 110 |
| `job` | Zhnilé | 120 |
| `job` | Uzavření tento měsíc | 130 |
| `job` | Prohrané za čtvrtletí | 140 |
| `job` | Čištění: bez úpravy 90 dní | 150 |
| `job` | Čištění: otevřené bez aktivit | 160 |
| `job` | Čištění: v první fázi déle než 30 dní | 170 |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `poptavky` | Poptávky | `poptavky.read` |  |  |  |
| `person` | `poptavky` | Poptávky | `poptavky.read` |  |  |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `inquiry` | `convert` | Kvalifikovat | `poptavky.convert` | ano | ano |
| `inquiry` | `open-job` | Otevřít zakázku |  | ano |  |
| `inquiry` | `mark-lost` | Zamítnout | `poptavky.write` |  | ano |

### Karty na přehledu záznamu

| Entita | Karta | Sloupec | Pořadí | Oprávnění | Podmíněná |
| --- | --- | --- | --- | --- | --- |
| `company` | `crm-deals` | main | 10 | `zakazky.read` |  |
| `company` | `crm-timeline` | main | 20 | `poptavky.read` |  |
| `company` | `crm-people` | side | 10 |  |  |
| `company` | `crm-related` | side | 20 |  |  |
| `person` | `crm-deals` | main | 10 | `zakazky.read` |  |
| `person` | `crm-timeline` | main | 20 | `poptavky.read` |  |

### kanbanCard

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| Klíč | body | rotting | footer |
| --- | --- | --- | --- |
| `job` | funkce | funkce | funkce |

### kanbanColumnHeader

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `DealColumnHeader`

### recordDialog

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| Klíč | header | overview | tabs |
| --- | --- | --- | --- |
| `job` | funkce | funkce | `prehled`, `rozpocet`, `soubory` |

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `crm.activities.digest` | `10 7 * * 1-5` | 2 | Pracovní dny v 7:10: přehled aktivit na dnešek a po termínu. |
| `crm.deals.attention` | `15 7 * * 1-5` | 2 | Pracovní dny v 7:15: obchody bez další aktivity. |
| `crm.rotting.refresh` | `30 5 * * *` | 2 | Denně v 5:30: přepočet hnití všech zakázek (`crmApi.recomputeAllJobsCrm`) a upozornění na nově zhnilé. |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Háčky přechodu fáze

| Háček | Entita | Z fáze | Do fáze | Kontrola | Akce před | Akce po |
| --- | --- | --- | --- | --- | --- | --- |
| `crm.deal` | `job` | `*` | `*` |  |  |  |
| `crm.followers` | `job` | `*` | `*` |  |  |  |

### Blokace smazání

| Blokace | Mazaná entita | Navázané záznamy (1 / 2–4 / 5+) | Doporučení |
| --- | --- | --- | --- |
| `poptavky.company-inquiries` | `company` | poptávku / poptávky / poptávek | výchozí |
| `poptavky.person-inquiries` | `person` | poptávku / poptávky / poptávek | výchozí |

### Vrstvy kalendáře

| Klíč | Název | Barva |
| --- | --- | --- |
| `crm.activities` | Aktivity (CRM) | `blue` |

### Poskytovatelé dat

Poskytovatelé jsou funkce, jejichž výstup (položky, dlaždice, hodnoty) závisí na datech a oprávnění uživatele, proto se z kódu nedají vyjmenovat. Počty: položky „Vyžaduje pozornost“: 2 poskytovatelů; dlaždice přehledu: 2 poskytovatelů.

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute | params |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `poptavky.conversion` | `Úspěšnost poptávek` | `Podíl vyhraných poptávek z uzavřených (vyhraných a prohraných), v procentech. Období se vztahuje k datu přijetí poptávky (datum uzavření systém neeviduje). Otevřené poptávky se nepočítají.` | `percent` | `scalar` | `poptavky.read` | funkce |  |
| `poptavky.pipeline_value` | `Hodnota obchodů` | `Součet cen nabídek otevřených obchodů (poptávka a nabídka, bez archivovaných) v Kč. U poptávky bez rozpočtu je to odhad hodnoty.` | `money` | `scalar` | `zakazky.read`, `zakazky.economics` | funkce | pole (1) |
| `poptavky.pipeline_weighted` | `Vážená hodnota obchodů` | `Součet cen nabídek otevřených obchodů vynásobených pravděpodobností jejich stavu (nebo ručně zadanou pravděpodobností) v Kč.` | `money` | `scalar` | `zakazky.read`, `zakazky.economics` | funkce | pole (1) |
| `poptavky.rotting` | `Zhnilé obchody` | `Počet otevřených obchodů, které se ve stavu nehnuly déle, než dovoluje stav (dny do zhnití), a nemají novou dokončenou aktivitu.` | `number` | `scalar` | `zakazky.read` | funkce | pole (1) |
| `poptavky.no_next_activity` | `Obchody bez další aktivity` | `Počet otevřených obchodů, které nemají žádnou naplánovanou (nedokončenou) aktivitu. Každý otevřený obchod má mít další krok.` | `number` | `scalar` | `zakazky.read` | funkce | pole (1) |

### ensure

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 2. `ensureCrmDefaults`, `ensureJobTypeField`

## Další vlastnosti manifestu

### notifications

| key | label | description | group | severity | recipients | entity | dedupe | access | scheduled | snooze | mergeWindowSeconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `inquiry.new` | `Nová poptávka` | `Přišla nová poptávka (z webu, formulářem nebo ručně založená). Dostanou ji ti, kdo poptávky spravují.` | `Poptávky` | `normal` | `perm:poptavky.write` | `inquiry` | `record` |  |  |  |  |
| `inquiry.assigned` | `Přidělena poptávka` | `Někdo vám přidělil poptávku (nebo ji převzal od jiného obchodníka).` | `Poptávky` | `normal` | `owner` | `inquiry` |  |  |  |  |  |
| `crm.activity_assigned` | `Přidělena aktivita` | `Někdo vám naplánoval nebo přidělil aktivitu (hovor, schůzku, úkol, obhlídku…).` | `CRM` | `normal` | `assignee` | `crm_activity` | `none` |  |  |  |  |
| `crm.activities_today` | `Aktivity na dnešek` | `Ráno vám přijde přehled aktivit s dnešním termínem a těch, které jsou po termínu (hovory, schůzky, úkoly…).` | `CRM` | `normal` | `assignee` |  | `day` | `poptavky.read` | `true` | `true` |  |
| `crm.deals_without_activity` | `Zakázky bez další aktivity` | `Ráno vám přijde přehled vašich otevřených obchodů, které nemají naplánovanou žádnou další aktivitu.` | `CRM` | `normal` | `owner` |  | `day` | `poptavky.read` | `true` | `true` |  |
| `crm.deals_rotting` | `Zakázky, které hnijí` | `Obchod ve vašem vedení dlouho nepostoupil ani se u něj neudála žádná aktivita (limit dnů nastavuje stav).` | `CRM` | `normal` | `owner` |  | `day` | `poptavky.read` | `true` |  |  |
| `crm.deal_stage` | `Sledovaná zakázka: změna stavu` | `Zakázka, kterou sledujete, se posunula do jiného stavu na nástěnce.` | `CRM` | `normal` | `followers` | `job` |  |  |  |  | `300` |
| `crm.deal_won` | `Sledovaná zakázka: vyhráno` | `Zakázku, kterou sledujete, někdo označil jako vyhranou.` | `CRM` | `normal` | `followers` | `job` |  |  |  |  |  |
| `crm.deal_lost` | `Sledovaná zakázka: prohráno` | `Zakázku, kterou sledujete, někdo označil jako prohranou.` | `CRM` | `normal` | `followers` | `job` |  |  |  |  |  |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `inquiry` | `inquiry` |
| `crm_activity` | `crm_activity` |
| `crm_note` | `crm_note` |
| `crm_activity_type` | `crm_activity_type` |
