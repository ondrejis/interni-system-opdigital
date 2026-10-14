# Entity modulu CRM

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [CRM](../moduly/poptavky.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## inquiry

**Poptávka** (množné číslo: Poptávky). Poptávka. Vlastník (obchodník) ji vidí i při oprávnění „jen moje“.

- **Modul:** [CRM](../moduly/poptavky.md)
- **Tabulka:** `inquiry` ([databáze](../databaze/poptavky.md))
- **Seznam:** `/poptavky`, detail `/poptavky/<id>`
- **Oprávnění:** read: `poptavky.read`, write: `poptavky.write`
- **Název záznamu:** `title`, stav (kanban): `stage`
- **Rozsah „jen moje“:** sloupce `owner_id`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterCreate`, `afterUpdate`, `search`, `ownerDefaults`
- **Definice:** `packages/modules/poptavky/src/server.ts`

### Pole entity `inquiry`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | Název | text | ano |  |  |  |  | `title` |
| `stage` | Stav | status | ano | pipeline `inquiry/default` |  |  |  | `stage_id` |
| `company` | Firma | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `companyName` | Firma (text) | text | ne |  |  |  |  | `company_name` |
| `person` | Kontaktní osoba | record | ne | vazba na [`person`](kontakty.md#person) |  |  |  | `person_id` |
| `contactName` | Jméno kontaktu | text | ne |  |  |  |  | `contact_name` |
| `contactEmail` | E-mail | email | ne |  |  |  |  | `contact_email` |
| `contactPhone` | Telefon | phone | ne |  |  |  |  | `contact_phone` |
| `source` | Zdroj | select | ne | číselník `inquiry.source` |  |  |  | `source` |
| `sourceChannel` | Kanál | text | ne |  |  |  |  | `source_channel` |
| `campaign` | Kampaň | text | ne |  |  |  |  | `campaign` |
| `value` | Odhad hodnoty | currency | ne |  |  | min 0 | součet | `expected_value_minor` |
| `owner` | Obchodník | user | ne |  |  |  |  | `owner_id` |
| `nextStep` | Další krok | text | ne |  |  |  |  | `next_step` |
| `nextStepAt` | Termín kroku | date | ne |  |  |  |  | `next_step_at` |
| `lostReason` | Důvod prohry | select | ne | číselník `inquiry.lost_reason` |  |  |  | `lost_reason` |
| `message` | Původní zpráva | longtext | ne |  |  |  |  | `message` |
| `receivedAt` | Přijato | date | ne |  |  |  | jen pro čtení | `created_at` |
| `convertedJob` | Vznikla zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  | jen pro čtení | `converted_job_id` |

#### Výchozí pipeline „Poptávky“ (`default`)

| Pořadí | Stav | Barva | Druh | Fáze |
| --- | --- | --- | --- | --- |
| 1 | Nová | gray |  |  |
| 2 | Kvalifikovaná | green | won |  |
| 3 | Zamítnutá | red | lost |  |

## crm_activity

**Aktivita** (množné číslo: Aktivity). Aktivita jako entita registru (tabulka, filtry, uložené pohledy, audit, oprávnění). Zakládá a mění se příkazy `crm.activity.*` (termín, dokončení a odložení přepočítávají zakázku); přímo se v tabulce upravují jen údaje, které přepočet nemění. Rozsah „jen moje“: přiřazeno mně nebo vlastník zakázky.

- **Modul:** [CRM](../moduly/poptavky.md)
- **Tabulka:** `crm_activity` ([databáze](../databaze/poptavky.md))
- **Seznam:** `/crm/aktivity`, detail `/crm/aktivity/<id>`
- **Oprávnění:** read: `poptavky.read`, write: `poptavky.write`
- **Název záznamu:** `subject`
- **Rozsah „jen moje“:** vlastní predikát (`scope`)
- **Vytvoření:** jen příkazy modulu (Aktivitu naplánujte tlačítkem „Naplánovat aktivitu“ u zakázky, firmy nebo osoby.)
- **Smazání:** nelze (Aktivitu smažete akcí „Smazat“ v jejím řádku nebo detailu zakázky.)
- **Háčky a rozšíření entity:** `afterUpdate`, `scope`, `owners`, `ownerDefaults`
- **Definice:** `packages/modules/poptavky/src/crm/activities/entities.ts`

### Pole entity `crm_activity`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `subject` | Předmět | text | ano |  |  |  |  | `subject` |
| `type` | Typ | record | ano | vazba na [`crm_activity_type`](poptavky.md#crm_activity_type) |  |  |  | `type_id` |
| `dueAt` | Termín | date | ne |  |  |  | jen pro čtení | `due_at` |
| `allDay` | Celý den | checkbox | ne |  |  |  | jen pro čtení | `all_day` |
| `durationMin` | Délka (min) | number | ne |  |  | min 1, max 1440 |  | `duration_min` |
| `priority` | Priorita | select | ne | `low`, `normal`, `high` |  |  |  | `priority` |
| `location` | Místo | text | ne |  |  |  |  | `location` |
| `assignee` | Přiřazeno | user | ne |  |  |  |  | `assignee_id` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `company` | Firma | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `person` | Osoba | record | ne | vazba na [`person`](kontakty.md#person) |  |  |  | `person_id` |
| `doneAt` | Dokončeno | date | ne |  |  |  | jen pro čtení | `done_at` |
| `doneBy` | Dokončil | user | ne |  |  |  | jen pro čtení | `done_by` |
| `outcome` | Výsledek | text | ne |  |  |  |  | `outcome` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## crm_note

**Poznámka** (množné číslo: Poznámky). Poznámka u zakázky, firmy nebo osoby jako entita registru: komentáře, audit a oprávnění se k ní vážou jako k jiným záznamům. Píše se příkazy `crm.note.*`; rozsah „jen moje“ = moje poznámky a poznámky u mých zakázek.

- **Modul:** [CRM](../moduly/poptavky.md)
- **Tabulka:** `crm_note` ([databáze](../databaze/poptavky.md))
- **Seznam:** `/crm/poznamky`, detail `/crm/poznamky/<id>`
- **Oprávnění:** read: `poptavky.read`, write: `poptavky.write`
- **Název záznamu:** `body`
- **Rozsah „jen moje“:** vlastní predikát (`scope`)
- **Vytvoření:** jen příkazy modulu (Poznámku přidáte v detailu zakázky, firmy nebo osoby.)
- **Smazání:** nelze (Poznámku smažete v detailu zakázky, firmy nebo osoby.)
- **Háčky a rozšíření entity:** `scope`, `owners`, `ownerDefaults`
- **Definice:** `packages/modules/poptavky/src/crm/activities/entities.ts`

### Pole entity `crm_note`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `body` | Poznámka | longtext | ano |  |  |  |  | `body` |
| `pinned` | Připnuto | checkbox | ne |  |  |  |  | `pinned` |
| `entityType` | K čemu patří | select | ne | `job`, `company`, `person` |  |  | jen pro čtení | `entity_type` |
| `author` | Autor | user | ne |  |  |  | jen pro čtení | `author_id` |

## crm_activity_type

**Typ aktivity** (množné číslo: Typy aktivit). Typ aktivity (hovor, schůzka, úkol…): konfigurace v Nastavení → Typy aktivit. Typ se nemaže (aktivity by o něj přišly), vypíná se. Klíč se při založení odvodí z názvu a dál se nemění.

- **Modul:** [CRM](../moduly/poptavky.md)
- **Tabulka:** `crm_activity_type` ([databáze](../databaze/poptavky.md))
- **Seznam:** `/crm/typy-aktivit`, detail `/crm/typy-aktivit/<id>`
- **Oprávnění:** read: `poptavky.read`, write: `settings.manage`
- **Název záznamu:** `name`
- **Smazání:** nelze (Typ, který nepotřebujete, vypněte (Aktivní = ne); smazáním by aktivity ztratily typ.)
- **Háčky a rozšíření entity:** `beforeCreate`
- **Definice:** `packages/modules/poptavky/src/crm/activities/entities.ts`

### Pole entity `crm_activity_type`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `icon` | Ikona | select | ano | `phone`, `users`, `check-square`, `flag`, `mail`, `map-pin`, `calendar-clock`, `send`, `video`, `wrench`, `camera`, `file-text`, `star`, `eye`, `target`, `house`, `truck`, `message-circle`, `clipboard-check` |  | výchozí `check-square` |  | `icon` |
| `defaultDurationMin` | Výchozí délka (min) | number | ne |  |  | min 1, max 1440 |  | `default_duration_min` |
| `position` | Pořadí | number | ne |  |  | min 0, max 10000 |  | `position` |
| `active` | Aktivní | checkbox | ne |  |  | výchozí `true` |  | `active` |
| `key` | Klíč | text | ne |  |  |  | jen pro čtení | `key` |
