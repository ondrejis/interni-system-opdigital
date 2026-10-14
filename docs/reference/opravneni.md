# Oprávnění a výchozí role

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (katalog oprávnění z manifestů a `CORE_PERMISSIONS`, výchozí role z `DEFAULT_ROLES`, použití z entit, příkazů a navigace). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Oprávnění je klíč `<modul>.<akce>` (platformní mají vlastní prefix). Role je pojmenovaná sada oprávnění; každé oprávnění v roli má **rozsah**: `vše` = všechny záznamy, `moje` = jen vlastní a přidělené záznamy (viz [ADR 007](../adr/007-opravneni-v-datove-vrstve.md)). Majitel (systémová role `owner`) má všechna oprávnění zapnutých modulů. Role se po prvním založení spravují v administraci, tabulka níže je jen **výchozí stav ze seedu** (`DEFAULT_ROLES`); klient může seed upravit.

## Výchozí role

- `owner`: Majitel / vedení (Vidí a smí všechno), systémová role se všemi oprávněními

## Katalog oprávnění a matice výchozích rolí

Prázdná buňka = role oprávnění nemá.

### Platforma (jádro)

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `private.read` | Vidí soukromé záznamy | Soukromé záznamy (zámek) vidí a nastavuje jen vlastník; ostatním neexistují v seznamech, hledání, přehledech ani součtech | vše |
| `activity.read` | Vidí historii změn |  | vše |
| `activity.export` | Exportuje historii změn | Stažení historie změn do CSV | vše |
| `trash.read` | Vidí koš | Smazané záznamy 30 dní; obnovit smí každý své | vše |
| `trash.purge` | Maže z koše natrvalo |  | vše |
| `settings.pipelines` | Spravuje pipeline a stavy |  | vše |
| `settings.custom_fields` | Spravuje vlastní pole |  | vše |
| `settings.tags` | Spravuje štítky |  | vše |
| `settings.integrations` | Spravuje integrace | Webhooky, Google, Meta, Fakturoid | vše |
| `users.manage` | Spravuje uživatele | Pozvánky, role, deaktivace | vše |
| `roles.manage` | Spravuje role a oprávnění |  | vše |
| `settings.manage` | Mění nastavení systému | Moduly, pipeline, číselníky, číselné řady, branding | vše |
| `audit.read` | Vidí historii změn |  | vše |
| `dashboards.write` | Skládá vlastní nástěnky | Osobní nástěnky z widgetů, jejich klonování a sdílení | vše |
| `dashboards.manage` | Spravuje nástěnky | Výchozí nástěnky pro role, cizí a sdílené nástěnky (Nastavení → Nástěnky) | vše |
| `exports.schedule` | Plánuje exporty a sdílí šablony exportů | Plány (denně, týdně, měsíčně) a sdílené šablony; export samotný vyžaduje čtení dat | vše |
| `exports.manage` | Spravuje exporty všech | Vidí historii exportů všech, zastavuje cizí plány a mění nastavení exportů | vše |
| `tasks.read` | Vidí úkoly | Rozsah „vše“ = úkoly všech, jinak jen vlastní a zadané | vše |
| `tasks.assign` | Přiděluje úkoly ostatním |  | vše |
| `comments.moderate` | Maže cizí komentáře |  | vše |
| `files.manage` | Spravuje cizí soubory |  | vše |
| `employees.read` | Vidí údaje zaměstnanců | Včetně hodinového nákladu | vše |
| `employees.write` | Upravuje údaje zaměstnanců |  | vše |
| `agency.access` | Servisní přístup agentury | Jen když ho klient povolí | vše |

### Modul Organizace a kontakty

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `kontakty.read` | Vidí organizace a kontakty |  | vše |
| `kontakty.create` | Zakládá organizace a kontakty |  | vše |
| `kontakty.write` | Upravuje organizace a kontakty |  | vše |
| `kontakty.delete` | Maže organizace a kontakty | Do koše; obnovit smí každý své | vše |
| `kontakty.export` | Exportuje organizace a kontakty |  | vše |
| `kontakty.merge` | Slučuje duplicitní kontakty | Sloučení firmy nebo osoby přepojí zakázky, obchody a další záznamy na jiný kontakt; nejde vrátit | vše |
| `kontakty.ares` | Doplňuje údaje z ARES |  | vše |

### Modul Klienti

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `klienti.read` | Vidí klienty a jejich karty |  | vše |
| `klienti.write` | Upravuje klienty | Stav klienta, služby a kontext | vše |

### Modul Google Disk

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `disk.read` | Vidí stav složek na Google Disku |  | vše |
| `disk.write` | Zakládá složky na Disku | Vytvořit složku a zkusit znovu po chybě | vše |
| `disk.manage` | Spravuje strukturu složek | Strom složek klienta a test napojení | vše |

### Modul Zakázky

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `zakazky.read` | Vidí zakázky |  | vše |
| `zakazky.create` | Zakládá zakázky |  | vše |
| `zakazky.write` | Upravuje zakázky |  | vše |
| `zakazky.delete` | Maže zakázky | Do koše; obnovit smí každý své | vše |
| `zakazky.export` | Exportuje zakázky |  | vše |
| `zakazky.templates` | Spravuje šablony zakázek |  | vše |
| `zakazky.finance` | Vidí hodnotu a finance zakázek | Hodnota zakázky a částky odvozené z ní (přechodné; převezme modul Finance) | vše |

### Modul Obchody

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `obchody.read` | Vidí obchody |  | vše |
| `obchody.create` | Zakládá obchody |  | vše |
| `obchody.write` | Upravuje obchody | Přesun mezi fázemi, výhra, prohra, znovuotevření | vše |
| `obchody.delete` | Maže obchody | Do koše; obnovit smí každý své | vše |
| `obchody.export` | Exportuje obchody |  | vše |
| `obchody.pipelines` | Spravuje pipeline obchodů | Fáze, pravděpodobnosti a lhůty | vše |

### Modul Úkoly a poznámky

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `ukoly.read` | Vidí úkoly a poznámky | Rozsah „jen moje“ = jen přidělené a vlastní | vše |
| `ukoly.create` | Zakládá úkoly a poznámky |  | vše |
| `ukoly.write` | Upravuje úkoly a poznámky |  | vše |
| `ukoly.delete` | Maže úkoly a poznámky | Do koše; obnovit smí každý své | vše |
| `ukoly.types` | Spravuje typy úkolů |  | vše |

### Modul Kalendář

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `kalendar.read` | Vidí kalendář | Rozsah „jen moje“ = události, které vlastním nebo na které jsem pozvaný | vše |
| `kalendar.write` | Upravuje události | Rozsah „jen moje“ = jen vlastní události | vše |
| `kalendar.resources` | Spravuje zdroje kalendáře |  | vše |

### Modul Hodiny

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `hodiny.read` | Vidí odpracované hodiny | Rozsah „jen moje“ = jen vlastní záznamy | vše |
| `hodiny.write` | Zapisuje a upravuje hodiny |  | vše |
| `hodiny.delete` | Maže záznamy hodin |  | vše |

### Modul Finance

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `finance.read` | Vidí platby a přehledy financí | Partner vidí jen sdílené zakázky | vše |
| `finance.payments_write` | Zapisuje a upravuje platby | Vystavení, úhrada, storno, retainery | vše |
| `finance.splits_edit` | Upravuje rozdělení plateb | Pravidla rozdělení mezi Ondřeje a Patrika | vše |
| `finance.settlements_write` | Zapisuje vyrovnání | Vzájemné vyrovnání (fakturou, převodem, zápočtem) | vše |
| `finance.export` | Exportuje platby a přehledy |  | vše |
| `finance.settings` | Spravuje nastavení financí | Základ salda a výchozí rozdělení | vše |

### Modul Reklama

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `reklama.read` | Vidí reklamní účty, kampaně a výkon |  | vše |
| `reklama.write` | Upravuje reklamu | Přiřazení účtů a kampaní ke klientům a zakázkám | vše |
| `reklama.manage` | Spravuje napojení na Meta | Mapování lead formulářů, ruční synchronizace | vše |

### Modul Šablony e-mailů

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `sablony-emailu.read` | Vidí šablony e-mailů |  | vše |
| `sablony-emailu.create` | Zakládá šablony e-mailů |  | vše |
| `sablony-emailu.write` | Upravuje šablony e-mailů |  | vše |
| `sablony-emailu.delete` | Maže šablony e-mailů |  | vše |

### Modul Můj prostor

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `muj-prostor.hosting` | Spravuje hosting a údržbu webů |  | vše |
| `muj-prostor.domains` | Spravuje domény |  | vše |
| `muj-prostor.email_library` | Spravuje soukromou e-mailovou knihovnu |  | vše |
| `muj-prostor.recurring_invoices` | Spravuje opakované faktury | Návrhy, schválení a odeslání do Fakturoidu | vše |
| `muj-prostor.private_overview` | Vidí přehled soukromých záznamů |  | vše |

### Modul Přehled

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `prehled.read` | Vidí úvodní přehled |  | vše |

## Kde se oprávnění vyžaduje

Přehled z registru entit, příkazů, navigace a stránek. Sloupec Příkazy je počet příkazů, které oprávnění vyžadují (stačí kterékoli z uvedených, viz [příkazy](prikazy/README.md)).

| Oprávnění | Entity (operace) | Atributy entit | Příkazy | Navigace, stránky, dlaždice |
| --- | --- | --- | --- | --- |
| `activity.export` |  |  |  |  |
| `activity.read` |  |  |  |  |
| `agency.access` |  |  |  |  |
| `audit.read` |  |  |  |  |
| `comments.moderate` |  |  |  |  |
| `dashboards.manage` |  |  |  |  |
| `dashboards.write` |  |  |  |  |
| `disk.manage` |  |  |  |  |
| `disk.read` |  |  |  |  |
| `disk.write` |  |  |  |  |
| `employees.read` |  |  |  |  |
| `employees.write` |  |  |  |  |
| `exports.manage` |  |  |  |  |
| `exports.schedule` |  |  |  |  |
| `files.manage` |  |  |  |  |
| `finance.export` |  |  |  |  |
| `finance.payments_write` |  |  |  |  |
| `finance.read` |  |  |  | `/finance`, `/finance/vyrovnani`, `/finance/vyrovnani`, `/finance` |
| `finance.settings` |  |  |  |  |
| `finance.settlements_write` |  |  |  |  |
| `finance.splits_edit` |  |  |  |  |
| `hodiny.delete` |  |  |  |  |
| `hodiny.read` |  |  |  | `/hodiny`, `/hodiny` |
| `hodiny.write` |  |  |  |  |
| `kalendar.read` | `event (read)`, `calendar_resource (read)` |  | 9 | `/kalendar`, `/kalendar` |
| `kalendar.resources` | `calendar_resource (write)` |  |  |  |
| `kalendar.write` | `event (write)` |  | 2 |  |
| `klienti.read` |  |  |  | `/klienti`, `/klienti` |
| `klienti.write` |  |  |  |  |
| `kontakty.ares` |  |  | 1 |  |
| `kontakty.create` |  |  |  |  |
| `kontakty.delete` |  |  |  |  |
| `kontakty.export` |  |  |  |  |
| `kontakty.merge` |  |  | 2 |  |
| `kontakty.read` | `company (read)`, `person (read)` |  | 3 | `/kontakty/firmy`, `/kontakty/osoby` |
| `kontakty.write` | `company (write)`, `person (write)` |  | 2 |  |
| `muj-prostor.domains` |  |  |  | `/muj-prostor/domeny`, `/muj-prostor/domeny` |
| `muj-prostor.email_library` |  |  |  | `/muj-prostor/knihovna`, `/muj-prostor/knihovna` |
| `muj-prostor.hosting` |  |  |  | `/muj-prostor/hosting`, `/muj-prostor/hosting` |
| `muj-prostor.private_overview` |  |  |  | `/muj-prostor/soukrome`, `/muj-prostor/soukrome` |
| `muj-prostor.recurring_invoices` |  |  |  | `/muj-prostor/faktury`, `/muj-prostor/faktury` |
| `obchody.create` |  |  |  |  |
| `obchody.delete` |  |  |  |  |
| `obchody.export` |  |  |  |  |
| `obchody.pipelines` |  |  |  |  |
| `obchody.read` |  |  |  | `/obchody`, `/obchody` |
| `obchody.write` |  |  | 1 |  |
| `prehled.read` |  |  |  | `/prehled`, `/prehled` |
| `private.read` |  |  |  |  |
| `reklama.manage` |  |  |  |  |
| `reklama.read` |  |  |  | `/reklama`, `/reklama` |
| `reklama.write` |  |  |  |  |
| `roles.manage` |  |  |  |  |
| `sablony-emailu.create` |  |  |  |  |
| `sablony-emailu.delete` |  |  |  |  |
| `sablony-emailu.read` |  |  |  | `/sablony-emailu`, `/sablony-emailu` |
| `sablony-emailu.write` |  |  |  |  |
| `settings.custom_fields` |  |  |  |  |
| `settings.integrations` |  |  |  |  |
| `settings.manage` |  |  |  |  |
| `settings.pipelines` |  |  |  |  |
| `settings.tags` |  |  |  |  |
| `tasks.assign` |  |  |  |  |
| `tasks.read` |  |  |  |  |
| `trash.purge` |  |  |  |  |
| `trash.read` |  |  |  |  |
| `ukoly.create` |  |  |  |  |
| `ukoly.delete` |  |  |  |  |
| `ukoly.read` |  |  |  | `/ukoly`, `/ukoly` |
| `ukoly.types` |  |  |  | `/ukoly/typy` |
| `ukoly.write` |  |  |  |  |
| `users.manage` |  |  |  |  |
| `zakazky.create` |  |  |  |  |
| `zakazky.delete` |  |  |  |  |
| `zakazky.export` |  |  |  |  |
| `zakazky.finance` |  | `job.value`, `job.crmWeighted` |  |  |
| `zakazky.read` | `job (read)` |  | 3 | `/zakazky`, `/zakazky/sablony` |
| `zakazky.templates` |  |  |  |  |
| `zakazky.write` | `job (write)` |  | 8 |  |

## Kontrola konzistence
Všechna oprávnění vyžadovaná entitami, příkazy, navigací a stránkami jsou v katalogu.
