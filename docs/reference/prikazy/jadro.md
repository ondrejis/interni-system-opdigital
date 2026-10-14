# Příkazy platformy (jádro)

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr příkazů (`ModuleServer.commands`) a jejich Zod schémata). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Příkaz je pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Vstup se validuje Zodem, oprávnění hlídá jednotný vstupní bod ([ADR 012](../../adr/012-moduly-prikazy-a-poskytovatele.md)). Modul: [Platforma (jádro)](../moduly/jadro.md). Počet příkazů: 41.

### crm.activity.complete

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `outcome` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `next` | objekt (nebo null) | ne |  |  |  |
| `next.typeKey` | text | ne |  | délka 1–40 |  |
| `next.typeId` | uuid | ne |  |  |  |
| `next.subject` | text | ano |  | délka 1–200 |  |
| `next.dueAt` | datum a čas (nebo null) | ne |  |  |  |
| `next.allDay` | ano/ne | ne |  |  |  |
| `next.durationMin` | celé číslo (nebo null) | ne |  | hodnota 1–1440 |  |
| `next.priority` | enum | ne | `low`, `normal`, `high` |  |  |
| `next.location` | text (nebo null) | ne |  | délka ≤ 300 |  |
| `next.note` | text (nebo null) | ne |  | délka ≤ 5000 |  |
| `next.assigneeId` | uuid (nebo null) | ne |  |  |  |
| `next.jobId` | uuid (nebo null) | ne |  |  |  |
| `next.companyId` | uuid (nebo null) | ne |  |  |  |
| `next.personId` | uuid (nebo null) | ne |  |  |  |
| `next.done` | ano/ne | ne |  |  |  |
| `next.outcome` | text (nebo null) | ne |  | délka ≤ 2000 |  |

### crm.activity.create

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `typeKey` | text | ne |  | délka 1–40 |  |
| `typeId` | uuid | ne |  |  |  |
| `subject` | text | ano |  | délka 1–200 |  |
| `dueAt` | datum a čas (nebo null) | ne |  |  |  |
| `allDay` | ano/ne | ne |  |  |  |
| `durationMin` | celé číslo (nebo null) | ne |  | hodnota 1–1440 |  |
| `priority` | enum | ne | `low`, `normal`, `high` |  |  |
| `location` | text (nebo null) | ne |  | délka ≤ 300 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 5000 |  |
| `assigneeId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `done` | ano/ne | ne |  |  |  |
| `outcome` | text (nebo null) | ne |  | délka ≤ 2000 |  |

### crm.activity.delete

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### crm.activity.get

- **Oprávnění:** `poptavky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### crm.activity.listForDeal

- **Oprávnění:** `poptavky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `include` | enum | ne | `open`, `done`, `all` |  |  |
| `limit` | celé číslo | ne |  | hodnota 1–500 |  |

### crm.activity.listMine

- **Oprávnění:** `poptavky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `scope` | enum | ne | `mine`, `all` |  |  |
| `range` | enum | ne | `open`, `overdue`, `today`, `tomorrow`, `week`, `nextWeek`, `done` |  |  |
| `typeKey` | text | ne |  | délka 1–40 |  |
| `limit` | celé číslo | ne |  | hodnota 1–500 |  |
| `offset` | celé číslo | ne |  | hodnota 0–100000 |  |

### crm.activity.listUpcoming

- **Oprávnění:** `poptavky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ne |  |  |  |
| `companyId` | uuid | ne |  |  |  |
| `personId` | uuid | ne |  |  |  |
| `aggregate` | ano/ne | ne |  |  |  |
| `limit` | celé číslo | ne |  | hodnota 1–200 |  |

### crm.activity.reopen

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### crm.activity.snooze

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `dueAt` | datum a čas | ne |  |  |  |
| `days` | celé číslo | ne |  | hodnota 1–365 |  |

### crm.activity.types

- **Oprávnění:** `poptavky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

_Bez vstupních polí._

### crm.activity.update

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `typeKey` | text | ne |  | délka 1–40 |  |
| `typeId` | uuid | ne |  |  |  |
| `subject` | text | ne |  | délka 1–200 |  |
| `dueAt` | datum a čas (nebo null) | ne |  |  |  |
| `allDay` | ano/ne | ne |  |  |  |
| `durationMin` | celé číslo (nebo null) | ne |  | hodnota 1–1440 |  |
| `priority` | enum | ne | `low`, `normal`, `high` |  |  |
| `location` | text (nebo null) | ne |  | délka ≤ 300 |  |
| `note` | text (nebo null) | ne |  | délka ≤ 5000 |  |
| `assigneeId` | uuid (nebo null) | ne |  |  |  |
| `jobId` | uuid (nebo null) | ne |  |  |  |
| `companyId` | uuid (nebo null) | ne |  |  |  |
| `personId` | uuid (nebo null) | ne |  |  |  |
| `outcome` | text (nebo null) | ne |  | délka ≤ 2000 |  |
| `id` | uuid | ano |  |  |  |

### crm.archive.list

Archiv obchodů (`crm.archive.list`): archivované a uzavřené (prohrané s důvodem ztráty, vyhrané) zakázky v rozsahu aktéra, od nejnovějších. Vstup: `owner` (`all`, `me`, id), `scope` (`closed` = archivované a prohrané, `archived`, `lost`, `won`, `all`), `q` (hledání v názvu a čísle), `limit` a `offset`. Znovuotevření a vrácení z archivu dělají příkazy `crm.deal.reopen` a `crm.deal.unarchive`.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/views/archive.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `owner` | text | ne |  | délka ≤ 40; výchozí `"all"` |  |
| `scope` | enum | ne | `closed`, `archived`, `lost`, `won`, `all` | výchozí `"closed"` |  |
| `q` | text | ne |  | délka ≤ 100 |  |
| `limit` | celé číslo | ne |  | hodnota 1–200; výchozí `50` |  |
| `offset` | celé číslo | ne |  | hodnota 0–100000; výchozí `0` |  |

### crm.contact.overview

Přehled obchodu u firmy nebo osoby: zakázky s fází a stavem (pro mini pás stavů), souhrn otevřených a vyhraných obchodů, kontaktní osoby, související firmy a (u osoby) účasti na zakázkách. Částky vidí jen, kdo má `zakazky.finance`; zakázky se řídí oprávněním `zakazky.read` (rozsah „jen moje“ platí).

- **Oprávnění:** `kontakty.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/inbox/contacts.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entity` | enum | ano | `company`, `person` |  |  |
| `id` | uuid | ano |  |  |  |

### crm.deal.archive

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### crm.deal.history

Historie stavů zakázky (pás fází: dny ve stavu) a číselník důvodů prohry pro dialog prohry.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### crm.deal.lose

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `reasonKey` | text | ano |  | délka 1–60 |  |
| `note` | text | ne |  | délka ≤ 2000 |  |

### crm.deal.lostReasons

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/deals/commands.ts`

_Bez vstupních polí._

### crm.deal.moveCheck

Co brání přesunu zakázky do stavu (nebo výhře či prohře): věty a pole, které stačí vyplnit. Nic nezapisuje.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/board/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `stageId` | uuid | ne |  |  |  |
| `toPhase` | enum | ne | `inquiry`, `offer`, `preparation`, `lost` |  |  |

### crm.deal.quickAdd

Rychlé zadání poptávky: jedním příkazem a v jedné transakci založí (nebo vybere) firmu a osobu s kontrolou duplicit (IČO, e-mail, telefon), zakázku ve zvoleném stavu fáze Poptávka a první aktivitu. Selže-li cokoli (duplicita, chybějící oprávnění ke kontaktům, stav mimo obchodní fáze, aktivita), nevznikne nic. První aktivita je povinná, ledaže volající výslovně potvrdí `skipFirstActivity` (UI „Uložit bez aktivity“).

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/inbox/quick-add.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `contact` | objekt | ne |  |  |  |
| `contact.personId` | uuid | ne |  |  |  |
| `contact.name` | text | ne |  | délka ≤ 200 |  |
| `contact.phone` | text | ne |  | délka ≤ 40 |  |
| `contact.email` | text | ne |  | délka ≤ 200 |  |
| `company` | objekt | ne |  | výchozí `{}` |  |
| `company.companyId` | uuid | ne |  |  |  |
| `company.name` | text | ne |  | délka ≤ 200 |  |
| `company.ico` | text | ne |  | délka ≤ 20 |  |
| `company.data` | objekt | ne |  |  |  |
| `company.data.name` | text | ne |  | délka 1–200 |  |
| `company.data.dic` | text | ne |  | délka ≤ 20 |  |
| `company.data.street` | text | ne |  | délka ≤ 200 |  |
| `company.data.city` | text | ne |  | délka ≤ 120 |  |
| `company.data.zip` | text | ne |  | délka ≤ 12 |  |
| `company.data.web` | text | ne |  | délka ≤ 200 |  |
| `company.data.type` | text | ne |  | délka ≤ 40 |  |
| `duplicates` | enum | ne | `ask`, `use`, `create` | výchozí `"ask"` |  |
| `title` | text | ne |  | délka ≤ 200 |  |
| `address` | text | ne |  | délka ≤ 300 |  |
| `siteCity` | text | ne |  | délka ≤ 120 |  |
| `jobType` | text | ne |  | délka ≤ 60 |  |
| `valueMinor` | celé číslo | ne |  | hodnota 0–1000000000000 |  |
| `source` | text | ne |  | délka ≤ 40 |  |
| `sourceChannel` | text | ne |  | délka ≤ 160 |  |
| `campaign` | text | ne |  | délka ≤ 120 |  |
| `ownerId` | uuid | ne |  |  |  |
| `expectedCloseDate` | datum | ne |  |  |  |
| `stageId` | uuid | ne |  |  |  |
| `description` | text | ne |  | délka ≤ 5000 |  |
| `firstActivity` | objekt | ne |  |  |  |
| `firstActivity.typeKey` | text | ne |  | délka 1–40; výchozí `"call"` |  |
| `firstActivity.subject` | text | ano |  | délka 1–200 |  |
| `firstActivity.dueAt` | datum a čas | ano |  |  |  |
| `firstActivity.allDay` | ano/ne | ne |  | výchozí `false` |  |
| `firstActivity.durationMin` | celé číslo | ne |  | hodnota 1–1440 |  |
| `firstActivity.note` | text | ne |  | délka ≤ 5000 |  |
| `firstActivity.assigneeId` | uuid | ne |  |  |  |
| `skipFirstActivity` | ano/ne | ne |  | výchozí `false` |  |

### crm.deal.reopen

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### crm.deal.unarchive

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### crm.deal.win

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### crm.fieldRules.get

Pravidla s popisky a katalog polí, na která jde pravidlo navázat (pro správu v nastavení).

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/deals/commands.ts`

_Bez vstupních polí._

### crm.fieldRules.set

- **Oprávnění:** `settings.manage` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/deals/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `rules` | pole objektů | ano |  | počet ≤ 100 |  |
| `rules[].attr` | text | ano |  | délka 1–80 |  |
| `rules[].fromStageId` | uuid | ano |  |  |  |
| `rules[].level` | enum | ne | `required`, `important` | výchozí `"required"` |  |

### crm.follower.follow

Začne sledovat zakázku (sebe, nebo jiného uživatele, když smím zakázku upravovat).

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/board/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `userId` | uuid | ne |  |  |  |

### crm.follower.list

Sledující zakázky a zda ji sleduji já.

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/board/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### crm.follower.unfollow

Přestane sledovat zakázku (sebe, nebo jiného uživatele, když smím zakázku upravovat).

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/board/index.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `userId` | uuid | ne |  |  |  |

### crm.forecast

Prognóza obchodů po měsících (`crm.forecast`). Agregace běží na serveru nad zakázkami v rozsahu aktéra (oprávnění ke čtení, rozsah „jen moje“); částky a váženou hodnotu dostane jen ten, kdo má `zakazky.finance`, jinak jsou `null` a sečtou se jen počty. Nearchivované otevřené obchody (poptávka, nabídka) padají do měsíců podle předpokládaného uzavření, vyhrané podle data výhry. Vstup: `owner` (`all`, `me`, id uživatele), `from` (první měsíc `YYYY-MM`, výchozí aktuální) a `months` (1 až 12, výchozí 4).

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/views/forecast.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `owner` | text | ne |  | délka ≤ 40; výchozí `"all"` |  |
| `from` | text | ne |  |  |  |
| `months` | celé číslo | ne |  | hodnota 1–12; výchozí `4` |  |

### crm.inbox.import

Import poptávek z CSV (soubor čte a mapuje prohlížeč, server přijme řádky po sloupcích). Každý řádek se zkontroluje zvlášť: nesprávný tvar e-mailu, telefonu nebo částky, duplicita v souboru i v systému (existující poptávka se stejným e-mailem nebo telefonem). Platné řádky se zapíšou, vadné se vrátí s větou a číslem řádku; jeden špatný řádek ostatní nezastaví. Poznámka k existujícím kontaktům (firma či osoba se stejným e-mailem) doprovází výsledek jako upozornění. `dryRun` vrátí totéž bez zápisu (náhled před importem).

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/inbox/import.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `rows` | pole objektů | ano |  | počet 1–500 |  |
| `rows[].line` | celé číslo | ano |  | hodnota ≥ 1 |  |
| `rows[].name` | text | ne |  | délka ≤ 400 |  |
| `rows[].email` | text | ne |  | délka ≤ 400 |  |
| `rows[].phone` | text | ne |  | délka ≤ 100 |  |
| `rows[].company` | text | ne |  | délka ≤ 400 |  |
| `rows[].title` | text | ne |  | délka ≤ 400 |  |
| `rows[].message` | text | ne |  | délka ≤ 10000 |  |
| `rows[].source` | text | ne |  | délka ≤ 100 |  |
| `rows[].sourceChannel` | text | ne |  | délka ≤ 200 |  |
| `rows[].campaign` | text | ne |  | délka ≤ 200 |  |
| `rows[].value` | text | ne |  | délka ≤ 60 |  |
| `duplicates` | enum | ne | `skip`, `create` | výchozí `"skip"` |  |
| `dryRun` | ano/ne | ne |  | výchozí `false` |  |

### crm.inbox.options

Číselníky a nabídky pro dialogy schránky a rychlého zadání v jednom dotazu: typy aktivit, zdroje, důvody zamítnutí, typy firem, typy zakázek (vlastní pole) a obchodní stavy nástěnky.

- **Oprávnění:** `poptavky.read` nebo `zakazky.read` nebo `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/inbox/contacts.ts`

_Bez vstupních polí._

### crm.inbox.qualifyPreview

Údaje poptávky a nalezené duplicity pro dialog „Kvalifikovat“ (firma/osoba z poptávky, IČO k doplnění).

- **Oprávnění:** `poptavky.convert` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/inbox/contacts.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `ico` | text | ne |  | délka ≤ 20 |  |

### crm.note.create

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `entityType` | enum | ano | `job`, `company`, `person` |  |  |
| `entityId` | uuid | ano |  |  |  |
| `body` | text | ano |  | délka 1–10000 |  |
| `pinned` | ano/ne | ne |  |  |  |

### crm.note.delete

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### crm.note.pin

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `pinned` | ano/ne | ano |  |  |  |

### crm.note.update

- **Oprávnění:** `poptavky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `body` | text | ano |  | délka 1–10000 |  |

### crm.participant.add

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/inbox/contacts.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |
| `personId` | uuid | ano |  |  |  |
| `role` | text | ne |  | délka ≤ 60 |  |

### crm.participant.list

Účastníci zakázky (osoba + role) s kontaktními údaji (ty jen s oprávněním ke kontaktům).

- **Oprávnění:** `zakazky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/inbox/contacts.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ano |  |  |  |

### crm.participant.remove

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/inbox/contacts.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |

### crm.participant.update

- **Oprávnění:** `zakazky.write` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/inbox/contacts.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | ano |  |  |  |
| `role` | text | ne |  | délka ≤ 60 |  |

### crm.timeline.get

- **Oprávnění:** `poptavky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/activities/commands.ts`

| Pole | Typ | Povinné | Hodnoty | Omezení | Popis |
| --- | --- | --- | --- | --- | --- |
| `jobId` | uuid | ne |  |  |  |
| `companyId` | uuid | ne |  |  |  |
| `personId` | uuid | ne |  |  |  |
| `aggregate` | ano/ne | ne |  |  |  |
| `limit` | celé číslo | ne |  | hodnota 1–500 |  |

### crm.today

Data stránky „Moje dnešní práce“ (`crm.today`): (b) moje otevřené obchody bez další aktivity (zhnilé a nejdéle ve stavu první), (c) nové poptávky ve schránce (nejdéle čekající první). Dnešní a zpožděné aktivity bere stránka z komponenty `ActivityList`. Obchody a poptávky se čtou v rozsahu aktéra; cena nabídky jen s `zakazky.finance`.

- **Oprávnění:** `poptavky.read` (stačí kterékoli)
- **Definice:** `packages/modules/poptavky/src/crm/today/today.ts`

_Bez vstupních polí._
