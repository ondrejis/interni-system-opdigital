# Oprávnění a výchozí role

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (katalog oprávnění z manifestů a `CORE_PERMISSIONS`, výchozí role z `DEFAULT_ROLES`, použití z entit, příkazů a navigace). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Oprávnění je klíč `<modul>.<akce>` (platformní mají vlastní prefix). Role je pojmenovaná sada oprávnění; každé oprávnění v roli má **rozsah**: `vše` = všechny záznamy, `moje` = jen vlastní a přidělené záznamy (viz [ADR 007](../adr/007-opravneni-v-datove-vrstve.md)). Majitel (systémová role `owner`) má všechna oprávnění zapnutých modulů. Role se po prvním založení spravují v administraci, tabulka níže je jen **výchozí stav ze seedu** (`DEFAULT_ROLES`); klient může seed upravit.

## Výchozí role

- `owner`: Majitel / vedení (Vidí a smí všechno), systémová role se všemi oprávněními
- `office`: Kancelář (Obchod, příprava, administrativa)
- `foreman`: Mistr / stavbyvedoucí (Své zakázky, tým, docházka a materiál na stavbě)
- `worker`: Montér / pracovník v terénu (Své zakázky, docházka, fotky a deník z terénu)

## Katalog oprávnění a matice výchozích rolí

Prázdná buňka = role oprávnění nemá.

### Platforma (jádro)

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `users.manage` | Spravuje uživatele | Pozvánky, role, deaktivace | vše |  |  |  |
| `roles.manage` | Spravuje role a oprávnění |  | vše |  |  |  |
| `settings.manage` | Mění nastavení systému | Moduly, pipeline, číselníky, číselné řady, branding | vše |  |  |  |
| `audit.read` | Vidí historii změn |  | vše |  |  |  |
| `dashboards.write` | Skládá vlastní nástěnky | Osobní nástěnky z widgetů, jejich klonování a sdílení | vše | vše | vše |  |
| `dashboards.manage` | Spravuje nástěnky | Výchozí nástěnky pro role, cizí a sdílené nástěnky (Nastavení → Nástěnky) | vše |  |  |  |
| `exports.schedule` | Plánuje exporty a sdílí šablony exportů | Plány (denně, týdně, měsíčně) a sdílené šablony; export samotný vyžaduje čtení dat | vše | vše |  |  |
| `exports.manage` | Spravuje exporty všech | Vidí historii exportů všech, zastavuje cizí plány a mění nastavení exportů | vše |  |  |  |
| `tasks.read` | Vidí úkoly | Rozsah „vše“ = úkoly všech, jinak jen vlastní a zadané | vše | vše |  |  |
| `tasks.assign` | Přiděluje úkoly ostatním |  | vše | vše | vše |  |
| `comments.moderate` | Maže cizí komentáře |  | vše |  |  |  |
| `files.manage` | Spravuje cizí soubory |  | vše |  |  |  |
| `employees.read` | Vidí údaje zaměstnanců | Včetně hodinového nákladu | vše |  |  |  |
| `employees.write` | Upravuje údaje zaměstnanců |  | vše |  |  |  |
| `agency.access` | Servisní přístup agentury | Jen když ho klient povolí | vše |  |  |  |

### Modul Kontakty

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `kontakty.read` | Vidí kontakty |  | vše | vše | vše |  |
| `kontakty.write` | Upravuje kontakty |  | vše | vše |  |  |
| `kontakty.merge` | Slučuje duplicitní kontakty | Sloučení firmy nebo osoby přepojí zakázky, poptávky, faktury a další záznamy na jiný kontakt; nejde vrátit | vše |  |  |  |

### Modul Zakázky

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `zakazky.read` | Vidí zakázky |  | vše | vše | moje | moje |
| `zakazky.write` | Upravuje zakázky |  | vše | vše | moje |  |
| `zakazky.economics` | Vidí ekonomiku zakázek | Rozpočet, náklady, marže | vše | vše |  |  |
| `zakazky.budget` | Upravuje rozpočet a náklady zakázek | Položky rozpočtu, ceny, ruční náklady, objednávky, párování nákladů | vše | vše |  |  |
| `zakazky.approve` | Schvaluje doklady zakázek do svého limitu | Změny (ZBV), soupisy prací, objednávky a přijaté faktury podle pravidel schvalování | vše | vše | moje |  |
| `zakazky.approve_all` | Schvaluje doklady bez limitu a nastavuje pravidla schvalování |  | vše |  |  |  |
| `zakazky.share` | Sdílí zakázku s investorem (odkaz jen ke čtení) |  | vše | vše |  |  |

### Modul CRM

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `poptavky.read` | Vidí poptávky |  | vše | vše |  |  |
| `poptavky.write` | Upravuje poptávky |  | vše | vše |  |  |
| `poptavky.convert` | Převádí poptávky na zakázky |  | vše | vše |  |  |
| `poptavky.intake` | Spravuje příjem poptávek | Klíče pro formulář a webhook na webu, záznam příchozích požadavků | vše |  |  |  |

### Modul Realizace

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `realizace.read` | Vidí realizaci |  | vše | vše | moje | moje |
| `realizace.write` | Zapisuje realizaci | Deník, předávací protokol, vady | vše | vše | moje | moje |

### Modul Fakturace

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `fakturace.read` | Vidí faktury |  | vše | vše |  |  |
| `fakturace.write` | Vystavuje faktury | Koncepty, vystavení, úhrady, dobropisy | vše | vše |  |  |
| `fakturace.export` | Exportuje faktury do účetnictví |  | vše | vše |  |  |

### Modul Docházka

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `dochazka.own` | Zapisuje svou docházku |  | vše | vše | vše | vše |
| `dochazka.read` | Vidí docházku | Rozsah „vše“ = docházka všech, „jen moje“ = vlastní záznamy v seznamech | vše | vše | moje |  |
| `dochazka.approve` | Schvaluje docházku | Také zapisuje za ostatní | vše | vše | moje |  |
| `dochazka.close_month` | Uzavírá měsíc |  | vše |  |  |  |

### Modul Sklad

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `sklad.read` | Vidí sklad |  | vše | vše | vše | vše |
| `sklad.issue` | Vydává materiál na zakázky | Výdejky a vratky | vše | vše | vše | moje |
| `sklad.write` | Spravuje sklad | Karty, umístění, příjem, převody, objednávky | vše | vše |  |  |
| `sklad.inventory` | Provádí inventuru |  | vše | vše |  |  |

### Modul Stroje a vozidla

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `stroje.read` | Vidí stroje a vozidla | Rozsah „jen moje“ = stroje, za které odpovídá | vše | vše | vše | vše |
| `stroje.log` | Zapisuje jízdy a tankování | Také nahlašuje závady | vše | vše | vše | vše |
| `stroje.write` | Spravuje vozový park | Karty, servis, rezervace, zápisy za ostatní, závady | vše | vše |  |  |

### Modul Kalendář

| Klíč | Název | Popis | Výchozí: owner | Výchozí: office | Výchozí: foreman | Výchozí: worker |
| --- | --- | --- | --- | --- | --- | --- |
| `kalendar.read` | Vidí kalendář | Rozsah „jen moje“ = události, které vlastním nebo na které jsem pozvaný | vše | vše | vše | moje |
| `kalendar.write` | Upravuje události | Rozsah „jen moje“ = jen vlastní události | vše | vše | moje |  |
| `kalendar.resources` | Spravuje zdroje kalendáře |  | vše | vše |  |  |

## Kde se oprávnění vyžaduje

Přehled z registru entit, příkazů, navigace a stránek. Sloupec Příkazy je počet příkazů, které oprávnění vyžadují (stačí kterékoli z uvedených, viz [příkazy](prikazy/README.md)).

| Oprávnění | Entity (operace) | Atributy entit | Příkazy | Navigace, stránky, dlaždice |
| --- | --- | --- | --- | --- |
| `agency.access` |  |  |  |  |
| `audit.read` |  |  |  |  |
| `comments.moderate` |  |  |  |  |
| `dashboards.manage` |  |  |  |  |
| `dashboards.write` |  |  |  |  |
| `dochazka.approve` | `time_entry (write)` |  | 2 |  |
| `dochazka.close_month` |  |  | 1 |  |
| `dochazka.own` |  |  | 4 | `/dochazka`, `/dochazka`, `dlaždice terminálu dochazka.clock` |
| `dochazka.read` | `time_entry (read)` |  |  | `/dochazka`, `/dochazka` |
| `employees.read` |  |  |  |  |
| `employees.write` |  |  |  |  |
| `exports.manage` |  |  |  |  |
| `exports.schedule` |  |  |  |  |
| `fakturace.export` | `invoice (export)`, `received_invoice (export)` |  | 2 | `/fakturace/export`, `/fakturace/export` |
| `fakturace.read` | `invoice (read)`, `received_invoice (read)` |  | 6 | `/fakturace`, `/fakturace/prijate` |
| `fakturace.write` | `invoice (write)`, `received_invoice (write)` |  | 19 |  |
| `files.manage` |  |  |  |  |
| `kalendar.read` | `event (read)`, `calendar_resource (read)` |  | 9 | `/kalendar`, `/kalendar/udalosti`, `/kalendar/zdroje`, `/kalendar` |
| `kalendar.resources` | `calendar_resource (write)` |  |  |  |
| `kalendar.write` | `event (write)` |  | 2 |  |
| `kontakty.merge` |  |  | 2 |  |
| `kontakty.read` | `company (read)`, `person (read)` |  | 4 | `/kontakty/firmy`, `/kontakty/osoby` |
| `kontakty.write` | `company (write)`, `person (write)` |  | 2 |  |
| `poptavky.convert` |  |  | 2 |  |
| `poptavky.intake` |  |  | 3 | `/poptavky/prijem` |
| `poptavky.read` | `inquiry (read)`, `crm_activity (read)`, `crm_note (read)`, `crm_activity_type (read)` |  | 8 | `/crm`, `/crm/dnes`, `/poptavky`, `/crm`, `/crm/dnes` |
| `poptavky.write` | `inquiry (write)`, `crm_activity (write)`, `crm_note (write)` |  | 13 | `/poptavky/import`, `/poptavky/import` |
| `realizace.read` | `defect (read)` |  | 16 | `/realizace`, `/realizace/vady`, `/realizace` |
| `realizace.write` | `defect (write)` |  | 7 | `dlaždice terminálu realizace.diary`, `dlaždice terminálu realizace.report` |
| `roles.manage` |  |  |  |  |
| `settings.manage` | `crm_activity_type (write)` |  | 5 | `/fakturace/nastaveni` |
| `sklad.inventory` | `stock_count (write)` |  | 5 |  |
| `sklad.issue` |  |  | 2 | `dlaždice terminálu sklad.issue` |
| `sklad.read` | `stock_item (read)`, `warehouse (read)`, `stock_doc (read)`, `purchase_order (read)`, `stock_count (read)` |  | 9 | `/sklad`, `/sklad/karty`, `/sklad/doklady`, `/sklad/objednavky`, `/sklad/inventury`, `/sklad/umisteni` a dalších 1 |
| `sklad.write` | `stock_item (write)`, `warehouse (write)`, `stock_doc (write)`, `purchase_order (write)` | `stock_item.avgCost`, `stock_item.lastPrice`, `stock_item.value`, `stock_doc.total` | 4 |  |
| `stroje.log` |  |  | 7 | `dlaždice terminálu stroje.fleet` |
| `stroje.read` | `asset (read)`, `asset_defect (read)` |  | 8 | `/stroje`, `/stroje/evidence`, `/stroje/zavady`, `/stroje`, `dlaždice terminálu stroje.fleet` |
| `stroje.write` | `asset (write)`, `asset_defect (write)` | `asset.internalRate`, `asset.purchasePrice` | 13 |  |
| `tasks.assign` |  |  |  |  |
| `tasks.read` |  |  |  |  |
| `users.manage` |  |  |  |  |
| `zakazky.approve` |  |  | 5 | `/zakazky/schvalovani`, `/zakazky/schvalovani` |
| `zakazky.approve_all` |  |  | 8 | `/zakazky/schvalovani`, `/zakazky/schvalovani` |
| `zakazky.budget` | `job_order (write)` |  | 31 |  |
| `zakazky.economics` | `job_order (read)` | `job.sumContract`, `job.sumMarginPct`, `job.sumDrawdownPct`, `job.value`, `job.sumCost`, `job.sumInvoiced` a dalších 4 | 28 | `/zakazky/objednavky` |
| `zakazky.read` | `job (read)` |  | 15 | `/zakazky`, `/zakazky/sablony`, `/zakazky/sablony`, `dlaždice terminálu zakazky.today` |
| `zakazky.share` |  |  | 4 |  |
| `zakazky.write` | `job (write)` |  | 22 |  |

## Kontrola konzistence
Všechna oprávnění vyžadovaná entitami, příkazy, navigací a stránkami jsou v katalogu.
