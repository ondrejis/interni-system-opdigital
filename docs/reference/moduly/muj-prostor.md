# Modul Můj prostor (muj-prostor)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (manifest modulu (`defineModule`), serverová část (`defineModuleServer`), UI modulu a zdrojové soubory). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Soukromá sekce vlastníka: hosting a údržba webů, domény s expirací, soukromá e-mailová knihovna, opakované faktury (Fakturoid) a přehled soukromých záznamů.

- **Identifikátor:** `muj-prostor`, ikona `vault`
- **Závisí na:** [`kontakty`](kontakty.md)
- **Balíček:** `packages/modules/muj-prostor`
- **Vyprávěcí dokumentace:** [docs/moduly/muj-prostor.md](../../moduly/muj-prostor.md)
- **Příkazy:** [25 příkazů](../prikazy/muj-prostor.md)
- **Entity:** [`recurring_service`](../entity/muj-prostor.md#recurring_service), [`web_domain`](../entity/muj-prostor.md#web_domain), [`email_library_item`](../entity/muj-prostor.md#email_library_item), [`recurring_invoice`](../entity/muj-prostor.md#recurring_invoice)
- **Databáze:** [tabulky a migrace](../databaze/muj-prostor.md)

## Navigace

| Položka | Adresa | Ikona | Oprávnění | Sekce panelu | Nadřazená položka |
| --- | --- | --- | --- | --- | --- |
| Hosting a údržba | `/muj-prostor/hosting` | `vault` | `muj-prostor.hosting` | Můj prostor |  |
| Domény | `/muj-prostor/domeny` | `globe` | `muj-prostor.domains` | Můj prostor |  |
| E-mailová knihovna | `/muj-prostor/knihovna` | `mail-template` | `muj-prostor.email_library` | Můj prostor |  |
| Opakované faktury | `/muj-prostor/faktury` | `receipt` | `muj-prostor.recurring_invoices` | Můj prostor |  |
| Soukromé | `/muj-prostor/soukrome` | `lock` | `muj-prostor.private_overview` | Můj prostor |  |

## Stránky modulu

| Adresa | Název | Oprávnění | Vykreslení v UI modulu |
| --- | --- | --- | --- |
| `/muj-prostor/hosting` | Hosting a údržba | `muj-prostor.hosting` | ano |
| `/muj-prostor/domeny` | Domény | `muj-prostor.domains` | ano |
| `/muj-prostor/knihovna` | E-mailová knihovna | `muj-prostor.email_library` | ano |
| `/muj-prostor/faktury` | Opakované faktury | `muj-prostor.recurring_invoices` | ano |
| `/muj-prostor/soukrome` | Soukromé | `muj-prostor.private_overview` | ano |

## Oprávnění

Výchozí přidělení rolím je v [opravneni.md](../opravneni.md).

| Klíč | Název | Popis |
| --- | --- | --- |
| `muj-prostor.hosting` | Spravuje hosting a údržbu webů |  |
| `muj-prostor.domains` | Spravuje domény |  |
| `muj-prostor.email_library` | Spravuje soukromou e-mailovou knihovnu |  |
| `muj-prostor.recurring_invoices` | Spravuje opakované faktury | Návrhy, schválení a odeslání do Fakturoidu |
| `muj-prostor.private_overview` | Vidí přehled soukromých záznamů |  |

## Výchozí data (seed)

Doplní se při seedu klienta, jen když modul běží; co správce změnil v administraci, se nepřepisuje.

### Výchozí pohledy

| Entita | Název | Pořadí |
| --- | --- | --- |
| `recurring_service` | Obnova do 30 dní | 10 |
| `recurring_service` | Podle klienta | 20 |
| `recurring_service` | Zrušené | 30 |
| `web_domain` | Expirace do 60 dní | 10 |
| `web_domain` | Bez klienta | 20 |
| `web_domain` | Podle klienta | 30 |

## Rozšíření uživatelského rozhraní

Modul doplňuje obecný detail záznamu (viz [ARCHITECTURE](../../ARCHITECTURE.md)). Podmíněné záložky a karty se ukazují jen u záznamů, pro které funkce `visible` vrátí `true`.

### Záložky na detailu záznamu

| Entita | Záložka | Název | Oprávnění | Skupina | Pořadí | Podmíněná |
| --- | --- | --- | --- | --- | --- | --- |
| `company` | `hosting` | Hosting a domény | `muj-prostor.hosting` nebo `muj-prostor.domains` |  | 90 |  |

### Akce v hlavičce detailu

| Entita | Akce | Název | Oprávnění | Hlavní | Okno |
| --- | --- | --- | --- | --- | --- |
| `email_template` | `muj-prostor.library.fromTemplate` | Přesunout do knihovny | `muj-prostor.email_library` |  |  |
| `recurring_service` | `mark-renewed` | Označit obnovu jako vyfakturovanou | `muj-prostor.hosting` |  |  |

### paletteActions

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| id | label | keywords | icon | permission | href |
| --- | --- | --- | --- | --- | --- |
| `muj-prostor.library.new` | `Nová položka e-mailové knihovny` | `knihovna e-mail text šablona` | `mail-template` | `muj-prostor.email_library` | `/muj-prostor/knihovna?nova=1` |
| `muj-prostor.library.open` | `Hledat v e-mailové knihovně` | `knihovna e-mail text kopírovat gmail` | `mail-template` | `muj-prostor.email_library` | `/muj-prostor/knihovna` |
| `muj-prostor.private.note` | `Nová soukromá poznámka` | `poznámka soukromé` | `lock` | `muj-prostor.private_overview` | `/muj-prostor/soukrome?poznamka=1` |

### slots

_Tato část UI modulu zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `FakturoidPanel`

## Serverová část

### Úlohy na pozadí

| Úloha | Plán (cron) | Opakování po chybě | Popis |
| --- | --- | --- | --- |
| `muj-prostor.invoices.prepare` | `30 5 * * *` | 2 |  |

Souhrn všech úloh: [udalosti-a-ulohy.md](../udalosti-a-ulohy.md).

### Blokace smazání

| Blokace | Mazaná entita | Navázané záznamy (1 / 2–4 / 5+) | Doporučení |
| --- | --- | --- | --- |
| `muj-prostor.company-hosting` | `company` | služba hostingu a údržby / služby hostingu a údržby / služeb hostingu a údržby | nejdřív je zrušte nebo přesuňte na jiného klienta |
| `muj-prostor.company-domains` | `company` | doména / domény / domén | nejdřív je přesuňte na jiného klienta nebo smažte |

### dashboardMetrics

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| key | label | description | format | shape | permissions | compute | params |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `muj-prostor.retainers` | `Opakovaný příjem z hostingu a údržby (měsíčně)` | `Měsíční ekvivalent opakovaných plateb z aktivních služeb hostingu a údržby (roční cena / 12). Pozastavené a zrušené se nepočítají.` | `money` | `scalar` | `muj-prostor.hosting` | funkce |  |
| `muj-prostor.retainers_arr` | `Opakovaný příjem z hostingu a údržby (ročně)` | `Roční opakovaný příjem z aktivních služeb hostingu a údržby (měsíční ceny × 12).` | `money` | `scalar` | `muj-prostor.hosting` | funkce |  |
| `muj-prostor.retainers_active` | `Aktivní služby hostingu a údržby` | `Počet aktivních služeb hostingu a údržby.` | `number` | `scalar` | `muj-prostor.hosting` | funkce |  |
| `muj-prostor.expirations` | `Expirace domén a obnovy hostingu` | `Domény a aktivní služby hostingu a údržby, kterým do zadaného počtu dní vyprší doména nebo má přijít obnova (včetně těch, které už vypršely nebo jsou po termínu). Hodnota je počet dní do data; záporná = po termínu.` | `number` | `series` | `muj-prostor.domains`, `muj-prostor.hosting` | funkce | pole (1) |
| `muj-prostor.domains_critical` | `Kritické domény` | `` Počet domén, kterým zbývá méně dní, než je jejich hranice `warn_days` (výchozí 30), nebo už vypršely. `` | `number` | `scalar` | `muj-prostor.domains` | funkce |  |

### contributions

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

Počet položek: 1. `pole (1)`

### navBadges

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| href | tone | count |
| --- | --- | --- |
| `/muj-prostor/domeny` | `danger` | funkce |
| `/muj-prostor/faktury` | `warning` | funkce |

### privatePaths

_Tento registr zatím nemá vlastní sekci v generátoru, zobrazeno obecně._

| name | run |
| --- | --- |
| `muj-prostor.hosting.overview` | funkce |
| `muj-prostor.retainers` | funkce |
| `muj-prostor.retainers_arr` | funkce |
| `muj-prostor.retainers_active` | funkce |
| `muj-prostor.hosting.clientCard` | funkce |
| `muj-prostor.domains.list` | funkce |
| `muj-prostor.domains.navBadge` | funkce |
| `muj-prostor.expirations` | funkce |
| `muj-prostor.domains_critical` | funkce |
| `muj-prostor.invoices.overview` | funkce |
| `muj-prostor.invoices.navBadge` | funkce |
| `muj-prostor.private.overview` | funkce |

## Tabulky entit

| Entita | Tabulka |
| --- | --- |
| `recurring_service` | `recurring_service` |
| `web_domain` | `web_domain` |
| `email_library_item` | `email_library_item` |
| `recurring_invoice` | `recurring_invoice` |
