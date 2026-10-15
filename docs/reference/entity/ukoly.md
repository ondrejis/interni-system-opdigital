# Entity modulu Úkoly a poznámky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Úkoly a poznámky](../moduly/ukoly.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## task

**Úkol** (množné číslo: Úkoly). Úkol a aktivita (hovor, schůzka, e-mail, termín jsou typy). Rozsah „jen moje“: přidělený nebo vlastní. Výsledek a dokončení řeší příkaz `complete`; vazby jsou měkké (obchod, organizace, kontakt, zakázka, fáze).

- **Modul:** [Úkoly a poznámky](../moduly/ukoly.md)
- **Tabulka:** `task` ([databáze](../databaze/ukoly.md))
- **Seznam:** `/ukoly/vse`, detail `/ukoly/vse/<id>`
- **Oprávnění:** read: `ukoly.read`, write: `ukoly.write`, create: `ukoly.create`, delete: `ukoly.delete`
- **Název záznamu:** `title`
- **Rozsah „jen moje“:** sloupce `assignee_id`, `created_by`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `search`, `scope`, `ownerDefaults`
- **Definice:** `packages/modules/ukoly/src/entities.ts`

### Pole entity `task`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | Název | text | ano |  |  |  |  | `title` |
| `type` | Typ | text | ne |  |  | výchozí `task` |  | `type_key` |
| `status` | Stav | select | ne | `todo`, `in_progress`, `done`, `canceled` |  | výchozí `todo` |  | `status` |
| `priority` | Priorita | select | ne | `none`, `low`, `medium`, `high`, `urgent` |  | výchozí `none` |  | `priority` |
| `assignee` | Řešitel | user | ne |  |  |  |  | `assignee_id` |
| `dueDate` | Termín | date | ne |  |  |  |  | `due_date` |
| `dueTime` | Čas | text | ne |  |  |  |  | `due_time` |
| `durationMin` | Délka (min) | number | ne |  |  | min 1 |  | `duration_min` |
| `allDay` | Celý den | checkbox | ne |  |  |  |  | `all_day` |
| `place` | Místo | text | ne |  |  |  |  | `place` |
| `deal` | Obchod | record | ne | vazba na [`deal`](obchody.md#deal) |  |  |  | `deal_id` |
| `company` | Organizace | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `person` | Kontakt | record | ne | vazba na [`person`](kontakty.md#person) |  |  |  | `person_id` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `estimateMin` | Odhad (min) | number | ne |  |  | min 0 |  | `estimate_min` |
| `description` | Popis | longtext | ne |  |  |  |  | `description` |
| `outcome` | Výsledek | longtext | ne |  |  |  |  | `outcome` |
| `completedAt` | Dokončeno | date | ne |  |  |  | jen pro čtení | `completed_at` |
| `parent` | Nadřazený úkol | record | ne | vazba na [`task`](ukoly.md#task) |  |  |  | `parent_id` |
| `jobPhase` | Fáze zakázky | text | ne |  |  |  |  | `job_phase_id` |
| `sendInvites` | Poslat pozvánky | checkbox | ne |  |  |  |  | `send_invites` |
| `sourceTemplateTask` | Z šablony | text | ne |  |  |  |  | `source_template_task` |
| `tags` | Štítky | multiselect | ne | číselník `tag` |  |  |  | `tags` |

## note

**Poznámka** (množné číslo: Poznámky). Poznámka s formátovaným textem. Bez položky v navigaci (R-23): otevírá se z karty, paletou a z Můj prostor → Soukromé. Rozsah „jen moje“: vlastní poznámky. Obsah (`bodyJson`, `bodyText`, `version`) se nezapisuje přes atributy, ale příkazy `ukoly.note.*` (sanitizace a verze pro autosave); atributy jsou název, připnutí, vazby a štítky.

- **Modul:** [Úkoly a poznámky](../moduly/ukoly.md)
- **Tabulka:** `note` ([databáze](../databaze/ukoly.md))
- **Seznam:** `/poznamky`, detail `/poznamky/<id>`
- **Oprávnění:** read: `ukoly.read`, write: `ukoly.write`, create: `ukoly.create`, delete: `ukoly.delete`
- **Název záznamu:** `title`
- **Rozsah „jen moje“:** sloupce `created_by`
- **Háčky a rozšíření entity:** `search`
- **Definice:** `packages/modules/ukoly/src/notes/entity.ts`

### Pole entity `note`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | Název | text | ne |  |  |  |  | `title` |
| `pinned` | Připnuto | checkbox | ne |  |  |  |  | `pinned` |
| `deal` | Obchod | record | ne | vazba na [`deal`](obchody.md#deal) |  |  |  | `deal_id` |
| `company` | Organizace | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `person` | Kontakt | record | ne | vazba na [`person`](kontakty.md#person) |  |  |  | `person_id` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `tags` | Štítky | multiselect | ne | číselník `tag` |  |  |  | `tags` |

## task_type

**Typ úkolu** (množné číslo: Typy úkolů). Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…); správa v Nastavení přes `ukoly.types`, systémové typy se nemažou.

- **Modul:** [Úkoly a poznámky](../moduly/ukoly.md)
- **Tabulka:** `task_type` ([databáze](../databaze/ukoly.md))
- **Seznam:** `/ukoly/typy/zaznamy`, detail `/ukoly/typy/zaznamy/<id>`
- **Oprávnění:** read: `ukoly.read`, write: `ukoly.types`, create: `ukoly.types`, delete: `ukoly.types`
- **Název záznamu:** `name`
- **Háčky a rozšíření entity:** `beforeUpdate`, `beforeDelete`, `search`
- **Definice:** `packages/modules/ukoly/src/entities.ts`

### Pole entity `task_type`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `key` | Klíč | text | ano |  |  |  |  | `key` |
| `icon` | Ikona | text | ne |  |  |  |  | `icon` |
| `color` | Barva | text | ne |  |  |  |  | `color` |
| `isCalendarEvent` | Událost v kalendáři | checkbox | ne |  |  |  |  | `is_calendar_event` |
| `isSystem` | Systémový | checkbox | ne |  |  |  | jen pro čtení | `is_system` |
| `position` | Pořadí | number | ne |  |  |  |  | `position` |
