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

### Modul Kontakty

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `kontakty.read` | Vidí kontakty |  | vše |
| `kontakty.write` | Upravuje kontakty |  | vše |
| `kontakty.merge` | Slučuje duplicitní kontakty | Sloučení firmy nebo osoby přepojí zakázky, poptávky, faktury a další záznamy na jiný kontakt; nejde vrátit | vše |

### Modul Zakázky

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `zakazky.read` | Vidí zakázky |  | vše |
| `zakazky.write` | Upravuje zakázky |  | vše |
| `zakazky.finance` | Vidí hodnotu a finance zakázek | Hodnota zakázky a částky odvozené z ní (vážená hodnota obchodů) | vše |

### Modul CRM

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `poptavky.read` | Vidí poptávky |  | vše |
| `poptavky.write` | Upravuje poptávky |  | vše |
| `poptavky.convert` | Převádí poptávky na zakázky |  | vše |
| `poptavky.intake` | Spravuje příjem poptávek | Klíče pro formulář a webhook na webu, záznam příchozích požadavků | vše |

### Modul Docházka

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `dochazka.own` | Zapisuje svou docházku |  | vše |
| `dochazka.read` | Vidí docházku | Rozsah „vše“ = docházka všech, „jen moje“ = vlastní záznamy v seznamech | vše |
| `dochazka.approve` | Schvaluje docházku | Také zapisuje za ostatní | vše |
| `dochazka.close_month` | Uzavírá měsíc |  | vše |

### Modul Kalendář

| Klíč | Název | Popis | Výchozí: owner |
| --- | --- | --- | --- |
| `kalendar.read` | Vidí kalendář | Rozsah „jen moje“ = události, které vlastním nebo na které jsem pozvaný | vše |
| `kalendar.write` | Upravuje události | Rozsah „jen moje“ = jen vlastní události | vše |
| `kalendar.resources` | Spravuje zdroje kalendáře |  | vše |

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
| `dochazka.own` |  |  | 3 | `/dochazka`, `/dochazka` |
| `dochazka.read` | `time_entry (read)` |  |  | `/dochazka`, `/dochazka` |
| `employees.read` |  |  |  |  |
| `employees.write` |  |  |  |  |
| `exports.manage` |  |  |  |  |
| `exports.schedule` |  |  |  |  |
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
| `roles.manage` |  |  |  |  |
| `settings.manage` | `crm_activity_type (write)` |  | 3 |  |
| `tasks.assign` |  |  |  |  |
| `tasks.read` |  |  |  |  |
| `users.manage` |  |  |  |  |
| `zakazky.finance` |  | `job.value`, `job.crmWeighted` |  |  |
| `zakazky.read` | `job (read)` |  | 14 | `/zakazky`, `/zakazky/sablony`, `/zakazky/sablony` |
| `zakazky.write` | `job (write)` |  | 18 |  |

## Kontrola konzistence
Všechna oprávnění vyžadovaná entitami, příkazy, navigací a stránkami jsou v katalogu.
