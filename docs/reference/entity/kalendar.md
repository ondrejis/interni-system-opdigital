# Entity modulu Kalendář

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Kalendář](../moduly/kalendar.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## event

**Událost** (množné číslo: Události). Událost. Čas, opakování a účastníky mění jen kalendář (hlídá kolize zdrojů a posílá pozvánky), v seznamu jde upravit název, typ, místo a poznámku. Rozsah „jen moje“ = vlastník nebo účastník.

- **Modul:** [Kalendář](../moduly/kalendar.md)
- **Tabulka:** `event` ([databáze](../databaze/kalendar.md))
- **Seznam:** `/kalendar/udalosti`, detail `/kalendar/udalosti/<id>`
- **Oprávnění:** read: `kalendar.read`, write: `kalendar.write`
- **Název záznamu:** `title`
- **Rozsah „jen moje“:** vlastní predikát (`scope`)
- **Vytvoření:** jen příkazy modulu (Událost vytvoříte v kalendáři tlačítkem „Nová událost“.)
- **Háčky a rozšíření entity:** `search`, `scope`, `owners`
- **Definice:** `packages/modules/kalendar/src/entities.ts`

### Pole entity `event`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | Název | text | ano |  |  |  |  | `title` |
| `type` | Typ | select | ne | `meeting`, `survey`, `handover`, `other` |  |  |  | `type` |
| `startsAt` | Začátek | date | ne |  |  |  | jen pro čtení | `starts_at` |
| `owner` | Vlastník | user | ne |  |  |  | jen pro čtení | `owner_id` |
| `resource` | Zdroj | record | ne | vazba na [`calendar_resource`](kalendar.md#calendar_resource) |  |  | jen pro čtení | `resource_id` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  | jen pro čtení | `job_id` |
| `location` | Místo | text | ne |  |  |  |  | `location` |
| `allDay` | Celý den | checkbox | ne |  |  |  | jen pro čtení | `all_day` |
| `recurrence` | Opakování | select | ne | `daily`, `weekdays`, `weekly`, `monthly` |  |  | jen pro čtení | `recurrence` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## calendar_resource

**Zdroj** (množné číslo: Zdroje).

- **Modul:** [Kalendář](../moduly/kalendar.md)
- **Tabulka:** `calendar_resource` ([databáze](../databaze/kalendar.md))
- **Seznam:** `/kalendar/zdroje`, detail `/kalendar/zdroje/<id>`
- **Oprávnění:** read: `kalendar.read`, write: `kalendar.resources`
- **Název záznamu:** `name`
- **Háčky a rozšíření entity:** `beforeDelete`, `search`
- **Definice:** `packages/modules/kalendar/src/entities.ts`

### Pole entity `calendar_resource`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `kind` | Druh | select | ano | `room`, `equipment`, `other` |  | výchozí `room` |  | `kind` |
| `active` | Aktivní | checkbox | ne |  |  |  |  | `active` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |
