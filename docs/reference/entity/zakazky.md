# Entity modulu Zakázky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Zakázky](../moduly/zakazky.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## job

**Zakázka** (množné číslo: Zakázky). Zakázka. Rozsah „jen moje“: vlastník nebo člen týmu. Číslo se přiděluje při založení z řady `zakazky.cislo`. `drive_*` píše modul Disk, `marketing_stage` modul Finance (přes `setMarketingStage`), aktuální fázi mění jen příkazy.

- **Modul:** [Zakázky](../moduly/zakazky.md)
- **Tabulka:** `job` ([databáze](../databaze/zakazky.md))
- **Seznam:** `/zakazky`, detail `/zakazky/<id>`
- **Oprávnění:** read: `zakazky.read`, write: `zakazky.write`, create: `zakazky.create`, delete: `zakazky.delete`, export: `zakazky.export`
- **Název záznamu:** `title`
- **Rozsah „jen moje“:** sloupce `owner_id`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterCreate`, `search`, `scope`, `owners`, `ownerDefaults`
- **Definice:** `packages/modules/zakazky/src/entities.ts`

### Pole entity `job`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `number` | Číslo | text | ne |  |  |  | jen pro čtení | `number` |
| `title` | Název | text | ano |  |  |  |  | `title` |
| `company` | Klient | record | ano | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `type` | Typ | select | ano | `web`, `marketing`, `systemy` |  | výchozí `web` |  | `type` |
| `status` | Stav | select | ne | `planned`, `active`, `paused`, `done`, `cancelled` |  | výchozí `planned` | jen pro čtení | `status` |
| `owner` | Vlastník | user | ne |  |  |  |  | `owner_id` |
| `startDate` | Začátek | date | ne |  |  |  |  | `start_date` |
| `dueDate` | Termín | date | ne |  |  |  |  | `due_date` |
| `price` | Cena | currency | ne |  | `finance.read` | min 0 | součet | `price_minor` |
| `billingModel` | Fakturace | select | ne | `one_off`, `intro_then_retainer`, `retainer`, `hourly` |  | výchozí `one_off` |  | `billing_model` |
| `marketingStage` | Fáze marketingu | select | ne | `intro`, `decision`, `retainer`, `ended` |  |  | jen pro čtení | `marketing_stage` |
| `completedAt` | Dokončeno | date | ne |  |  |  | jen pro čtení | `completed_at` |
| `description` | Popis | longtext | ne |  |  |  |  | `description` |
| `tags` | Štítky | multiselect | ne | číselník `tag` |  |  |  | `tags` |

## job_template

**Šablona zakázky** (množné číslo: Šablony zakázek). Šablona zakázky (fáze, úkoly, platby). Archivuje se, nemaže; správa přes `zakazky.templates`.

- **Modul:** [Zakázky](../moduly/zakazky.md)
- **Tabulka:** `job_template` ([databáze](../databaze/zakazky.md))
- **Seznam:** `/zakazky/sablony`, detail `/zakazky/sablony/<id>`
- **Oprávnění:** read: `zakazky.read`, write: `zakazky.templates`, create: `zakazky.templates`, delete: `zakazky.templates`
- **Název záznamu:** `name`
- **Háčky a rozšíření entity:** `search`
- **Definice:** `packages/modules/zakazky/src/entities.ts`

### Pole entity `job_template`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `type` | Typ | select | ano | `web`, `marketing`, `systemy` |  | výchozí `web` |  | `type` |
| `defaultBillingModel` | Výchozí fakturace | select | ne | `one_off`, `intro_then_retainer`, `retainer`, `hourly` |  | výchozí `one_off` |  | `default_billing_model` |
| `isDefault` | Výchozí pro typ | checkbox | ne |  |  |  |  | `is_default` |
| `archivedAt` | Archivováno | date | ne |  |  |  | jen pro čtení | `archived_at` |
| `description` | Popis | longtext | ne |  |  |  |  | `description` |
