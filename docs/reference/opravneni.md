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
| `zakazky.finance` | Vidí hodnotu a finance zakázek | Přechodné oprávnění z původního jádra; ceny zakázek řídí `finance.read` | vše |

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
| `kalendar.read` | Vidí kalendář | Rozsah „jen moje“ = jen kalendáře mého Google účtu; „vše“ i kalendáře ostatních (jejich soukromé události jako „Obsazeno“) | vše |
| `kalendar.write` | Upravuje události | Připojení vlastního Google účtu, zakládání a přesouvání schůzek, vazby na klienty a obchody; rozsah „jen moje“ = jen vlastní události | vše |

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
| `disk.manage` |  |  | 5 |  |
| `disk.read` |  |  | 1 |  |
| `disk.write` |  |  | 2 |  |
| `employees.read` |  |  |  |  |
| `employees.write` |  |  |  |  |
| `exports.manage` |  |  |  |  |
| `exports.schedule` |  |  |  |  |
| `files.manage` |  |  |  |  |
| `finance.export` | `payment (export)`, `settlement (export)` |  |  |  |
| `finance.payments_write` | `payment (write)`, `payment (create)`, `payment (delete)` |  | 7 |  |
| `finance.read` | `payment (read)`, `settlement (read)` | `job.price` | 13 | `/finance`, `/finance/vyrovnani`, `/finance/prehledy`, `/finance`, `/finance/vyrovnani`, `/finance/prehledy` |
| `finance.settings` |  |  | 1 |  |
| `finance.settlements_write` | `settlement (write)`, `settlement (create)` |  | 2 |  |
| `finance.splits_edit` |  |  | 2 |  |
| `hodiny.delete` | `time_entry (delete)` |  | 1 |  |
| `hodiny.read` | `time_entry (read)` |  | 6 | `/hodiny`, `/hodiny` |
| `hodiny.write` | `time_entry (write)`, `time_entry (create)` |  | 2 |  |
| `kalendar.read` |  |  | 4 | `/kalendar`, `/kalendar` |
| `kalendar.write` |  |  | 11 |  |
| `klienti.read` |  |  | 3 | `/klienti`, `/klienti` |
| `klienti.write` |  |  | 3 |  |
| `kontakty.ares` |  |  | 2 |  |
| `kontakty.create` | `company (create)`, `person (create)` |  | 1 | `/kontakty/firmy/nova`, `/kontakty/osoby/novy` |
| `kontakty.delete` | `company (delete)`, `person (delete)` |  |  |  |
| `kontakty.export` | `company (export)`, `person (export)` |  |  |  |
| `kontakty.merge` |  |  | 2 |  |
| `kontakty.read` | `company (read)`, `person (read)` |  | 6 | `/kontakty/firmy`, `/kontakty/osoby` |
| `kontakty.write` | `company (write)`, `person (write)` |  | 3 |  |
| `muj-prostor.domains` | `web_domain (read)`, `web_domain (write)`, `web_domain (create)`, `web_domain (delete)`, `web_domain (export)` |  | 4 | `/muj-prostor/domeny`, `/muj-prostor/domeny` |
| `muj-prostor.email_library` | `email_library_item (read)`, `email_library_item (write)`, `email_library_item (create)`, `email_library_item (delete)`, `email_library_item (export)` |  | 5 | `/muj-prostor/knihovna`, `/muj-prostor/knihovna` |
| `muj-prostor.hosting` | `recurring_service (read)`, `recurring_service (write)`, `recurring_service (create)`, `recurring_service (delete)`, `recurring_service (export)` |  | 4 | `/muj-prostor/hosting`, `/muj-prostor/hosting` |
| `muj-prostor.private_overview` |  |  | 2 | `/muj-prostor/soukrome`, `/muj-prostor/soukrome` |
| `muj-prostor.recurring_invoices` | `recurring_invoice (read)`, `recurring_invoice (write)`, `recurring_invoice (create)` |  | 11 | `/muj-prostor/faktury`, `/muj-prostor/faktury` |
| `obchody.create` | `deal (create)` |  | 2 |  |
| `obchody.delete` | `deal (delete)` |  | 1 |  |
| `obchody.export` | `deal (export)` |  |  |  |
| `obchody.pipelines` |  |  | 8 |  |
| `obchody.read` | `deal (read)` |  | 6 | `/obchody` |
| `obchody.write` | `deal (write)` |  | 8 |  |
| `prehled.read` |  |  |  | `/prehled`, `/prehled` |
| `private.read` |  |  |  |  |
| `reklama.manage` | `ad_account (create)` |  | 10 |  |
| `reklama.read` | `ad_account (read)`, `ad_campaign (read)` |  | 6 | `/reklama` |
| `reklama.write` | `ad_account (write)`, `ad_campaign (write)` |  | 2 |  |
| `roles.manage` |  |  |  |  |
| `sablony-emailu.create` | `email_template (create)` |  |  |  |
| `sablony-emailu.delete` | `email_template (delete)` |  |  |  |
| `sablony-emailu.read` | `email_template (read)` |  | 7 | `/sablony-emailu` |
| `sablony-emailu.write` | `email_template (write)` |  | 1 |  |
| `settings.custom_fields` |  |  |  |  |
| `settings.integrations` |  |  |  |  |
| `settings.manage` |  |  | 2 |  |
| `settings.pipelines` |  |  |  |  |
| `settings.tags` |  |  |  |  |
| `trash.purge` |  |  |  |  |
| `trash.read` |  |  |  |  |
| `ukoly.create` | `task (create)`, `note (create)` |  | 3 |  |
| `ukoly.delete` | `task (delete)`, `note (delete)` |  | 2 |  |
| `ukoly.read` | `task (read)`, `note (read)`, `task_type (read)` |  | 8 | `/ukoly`, `/ukoly`, `/poznamky/samostatne` |
| `ukoly.types` | `task_type (write)`, `task_type (create)`, `task_type (delete)` |  | 3 | `/ukoly/typy` |
| `ukoly.write` | `task (write)`, `note (write)` |  | 10 |  |
| `users.manage` |  |  |  |  |
| `zakazky.create` | `job (create)` |  | 2 |  |
| `zakazky.delete` | `job (delete)` |  |  |  |
| `zakazky.export` | `job (export)` |  |  |  |
| `zakazky.finance` |  |  |  |  |
| `zakazky.read` | `job (read)`, `job_template (read)` |  | 7 | `/zakazky` |
| `zakazky.templates` | `job_template (write)`, `job_template (create)`, `job_template (delete)` |  | 6 |  |
| `zakazky.write` | `job (write)` |  | 11 |  |

## Kontrola konzistence
Všechna oprávnění vyžadovaná entitami, příkazy, navigací a stránkami jsou v katalogu.
