# Entity modulu Reklama

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Reklama](../moduly/reklama.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## ad_account

**Reklamní účet** (množné číslo: Reklamní účty). Reklamní účet z Meta Ads (jen čtení z Mety; vlastníka a klienta nastavuje uživatel).

- **Modul:** [Reklama](../moduly/reklama.md)
- **Tabulka:** `ad_account` ([databáze](../databaze/reklama.md))
- **Seznam:** `/reklama`, detail `/reklama/<id>`
- **Oprávnění:** read: `reklama.read`, write: `reklama.write`, create: `reklama.manage`
- **Název záznamu:** `name`
- **Vytvoření:** jen příkazy modulu (Účty se načítají synchronizací z Meta.)
- **Smazání:** nelze (Účty se nemažou, jen se deaktivují.)
- **Háčky a rozšíření entity:** `search`
- **Definice:** `packages/modules/reklama/src/entities.ts`

### Pole entity `ad_account`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `metaId` | Meta ID | text | ne |  |  |  | jen pro čtení | `meta_id` |
| `ownerKind` | Vlastník účtu | select | ne | `agency`, `client` |  | výchozí `agency` |  | `owner_kind` |
| `company` | Klient | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `currency` | Měna | text | ne |  |  |  | jen pro čtení | `currency` |
| `timezone` | Časové pásmo | text | ne |  |  |  | jen pro čtení | `timezone` |
| `active` | Aktivní | checkbox | ne |  |  |  |  | `active` |
| `lastSyncAt` | Poslední synchronizace | date | ne |  |  |  | jen pro čtení | `last_sync_at` |

## ad_campaign

**Kampaň** (množné číslo: Kampaně). Reklamní kampaň (jen čtení z Mety); uživatel ji přiřazuje k marketingové zakázce.

- **Modul:** [Reklama](../moduly/reklama.md)
- **Tabulka:** `ad_campaign` ([databáze](../databaze/reklama.md))
- **Seznam:** `/reklama/kampane`, detail `/reklama/kampane/<id>`
- **Oprávnění:** read: `reklama.read`, write: `reklama.write`
- **Název záznamu:** `name`
- **Vytvoření:** jen příkazy modulu (Kampaně se načítají synchronizací z Meta.)
- **Smazání:** nelze (Kampaně se nemažou.)
- **Háčky a rozšíření entity:** `search`
- **Definice:** `packages/modules/reklama/src/entities.ts`

### Pole entity `ad_campaign`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ne |  |  |  | jen pro čtení | `name` |
| `account` | Účet | record | ne | vazba na [`ad_account`](reklama.md#ad_account) |  |  | jen pro čtení | `account_id` |
| `objective` | Cíl | text | ne |  |  |  | jen pro čtení | `objective` |
| `status` | Stav | text | ne |  |  |  | jen pro čtení | `status` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `metaId` | Meta ID | text | ne |  |  |  | jen pro čtení | `meta_id` |
