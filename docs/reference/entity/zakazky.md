# Entity modulu Zakázky

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Zakázky](../moduly/zakazky.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## job

**Zakázka** (množné číslo: Zakázky). Zakázka. Vedoucí a členové týmu ji vidí i při oprávnění „jen moje“.

- **Modul:** [Zakázky](../moduly/zakazky.md)
- **Tabulka:** `job` ([databáze](../databaze/zakazky.md))
- **Seznam:** `/zakazky`, detail `/zakazky/<id>`
- **Oprávnění:** read: `zakazky.read`, write: `zakazky.write`
- **Název záznamu:** `title`, stav (kanban): `stage`
- **Rozsah „jen moje“:** sloupce `manager_id`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `search`, `scope`, `owners`, `ownerDefaults`
- **Definice:** `packages/modules/zakazky/src/server.ts`

### Pole entity `job`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `number` | Číslo | text | ne |  |  |  | jen pro čtení | `number` |
| `title` | Název | text | ano |  |  |  |  | `title` |
| `company` | Zákazník | record | ano | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `phase` | Fáze | select | ne | `inquiry`, `offer`, `preparation`, `execution`, `handover`, `warranty`, `closed`, `lost`, `paused` |  |  | jen pro čtení | `phase` |
| `stage` | Stav | status | ano | pipeline `job/default` |  |  |  | `stage_id` |
| `manager` | Odpovědný | user | ne |  |  |  |  | `manager_id` |
| `endDate` | Termín | date | ne |  |  |  |  | `end_date` |
| `value` | Hodnota | currency | ne |  | `zakazky.finance` | min 0 | součet | `value_minor` |
| `startDate` | Zahájení | date | ne |  |  |  |  | `start_date` |
| `person` | Kontaktní osoba | record | ne | vazba na [`person`](kontakty.md#person) |  |  |  | `person_id` |
| `address` | Adresa stavby | text | ne |  |  |  |  | `address` |
| `warrantyMonths` | Délka záruky (měsíce) | number | ne |  |  | min 0, max 600 |  | `warranty_months` |
| `warrantyUntil` | Záruka do | date | ne |  |  |  |  | `warranty_until` |
| `color` | Barva | select | ne | `gray`, `blue`, `green`, `orange`, `red`, `purple`, `pink`, `teal`, `yellow`, `indigo` |  |  |  | `color` |
| `lostReason` | Důvod prohry | select | ne | číselník `job.lost_reason` |  |  |  | `lost_reason` |
| `pausedFrom` | Pozastaveno z fáze | select | ne | `inquiry`, `offer`, `preparation`, `execution`, `handover`, `warranty`, `closed`, `lost`, `paused` |  |  | jen pro čtení | `paused_from` |
| `wonAt` | Vyhráno | date | ne |  |  |  | jen pro čtení | `won_at` |
| `handoverAt` | Předáno | date | ne |  |  |  | jen pro čtení | `handover_at` |
| `closedAt` | Uzavřeno | date | ne |  |  |  | jen pro čtení | `closed_at` |
| `sourceInquiry` | Vzniklo z poptávky | record | ne | vazba na `inquiry` |  |  |  | `source_inquiry_id` |
| `description` | Popis | longtext | ne |  |  |  |  | `description` |
| `expectedCloseDate` | Očekávané uzavření | date | ne |  |  |  |  | `expected_close_date` |
| `crmWeighted` | Vážená hodnota | currency | ne |  | `zakazky.finance` |  | jen pro čtení, součet | `crm_weighted_minor` |
| `crmProbabilityPct` | Pravděpodobnost výhry (ručně) | number | ne |  |  | min 0, max 100, jednotka percent |  | `crm_probability_pct` |
| `crmSource` | Zdroj obchodu | select | ne | číselník `job.source` |  |  |  | `crm_source` |
| `crmSourceChannel` | Kanál | text | ne |  |  |  |  | `crm_source_channel` |
| `crmCampaign` | Kampaň | text | ne |  |  |  |  | `crm_campaign` |
| `siteCity` | Město stavby | text | ne |  |  |  |  | `site_city` |
| `crmStageEnteredAt` | Ve stavu od | date | ne |  |  |  | jen pro čtení | `crm_stage_entered_at` |
| `crmNextActivityAt` | Další aktivita | date | ne |  |  |  | jen pro čtení | `crm_next_activity_at` |
| `crmLastActivityAt` | Poslední aktivita | date | ne |  |  |  | jen pro čtení | `crm_last_activity_at` |
| `crmOpenActivities` | Otevřené aktivity | number | ne |  |  |  | jen pro čtení | `crm_open_activities` |
| `crmOverdueActivities` | Aktivity po termínu | number | ne |  |  |  | jen pro čtení | `crm_overdue_activities` |
| `crmRotting` | Hnije | checkbox | ne |  |  |  | jen pro čtení | `crm_rotting` |
| `crmArchivedAt` | Archivováno | date | ne |  |  |  | jen pro čtení | `crm_archived_at` |
| `crmLostNote` | Poznámka k prohře | longtext | ne |  |  |  |  | `crm_lost_note` |
| `createdAt` | Vytvořeno | date | ne |  |  |  | jen pro čtení | `created_at` |
| `updatedAt` | Poslední úprava | date | ne |  |  |  | jen pro čtení | `updated_at` |
| `phaseChangedAt` | Ve fázi od | date | ne |  |  |  | jen pro čtení | `phase_changed_at` |

#### Výchozí pipeline „Zakázky“ (`default`)

| Pořadí | Stav | Barva | Druh | Fáze |
| --- | --- | --- | --- | --- |
| 1 | Nová poptávka | gray |  | inquiry |
| 2 | Kontaktováno | blue |  | inquiry |
| 3 | Obhlídka | teal |  | inquiry |
| 4 | Nabídka v přípravě | purple |  | offer |
| 5 | Nabídka odeslána | indigo |  | offer |
| 6 | Jednání | orange |  | offer |
| 7 | Příprava | blue |  | preparation |
| 8 | Realizace | orange |  | execution |
| 9 | Předání | teal |  | handover |
| 10 | Záruka | indigo |  | warranty |
| 11 | Uzavřeno | green | done | closed |
| 12 | Prohráno | red | lost | lost |
| 13 | Pozastaveno | yellow |  | paused |
