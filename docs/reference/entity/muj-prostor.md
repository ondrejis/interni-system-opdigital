# Entity modulu Můj prostor

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Můj prostor](../moduly/muj-prostor.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## recurring_service

**Hosting / údržba** (množné číslo: Hosting a údržba). Hosting a údržba webů klientů (opakované služby s obnovou). Stránku `/muj-prostor/hosting` (souhrn, pohledy) kreslí UI modulu; generický seznam s filtry, exportem a detaily záznamů je na `/muj-prostor/hosting/vse`.

- **Modul:** [Můj prostor](../moduly/muj-prostor.md)
- **Tabulka:** `recurring_service` ([databáze](../databaze/muj-prostor.md))
- **Seznam:** `/muj-prostor/hosting/vse`, detail `/muj-prostor/hosting/vse/<id>`
- **Oprávnění:** read: `muj-prostor.hosting`, write: `muj-prostor.hosting`, create: `muj-prostor.hosting`, delete: `muj-prostor.hosting`, export: `muj-prostor.hosting`
- **Název záznamu:** `name`
- **Háčky a rozšíření entity:** `search`
- **Definice:** `packages/modules/muj-prostor/src/entities.ts`

### Pole entity `recurring_service`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `name` | Název | text | ano |  |  |  |  | `name` |
| `company` | Klient | record | ano | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `kind` | Druh | select | ano | `hosting`, `maintenance` |  | výchozí `hosting` |  | `kind` |
| `web` | Web | url | ne |  |  |  |  | `web` |
| `price` | Cena za období | currency | ne |  |  | min 0 | součet | `price_minor` |
| `period` | Období | select | ne | `yearly`, `monthly` |  | výchozí `yearly` |  | `period` |
| `nextRenewal` | Další obnova | date | ne |  |  |  |  | `next_renewal` |
| `status` | Stav | select | ne | `active`, `paused`, `canceled` |  | výchozí `active` |  | `status` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `since` | Od | date | ne |  |  |  |  | `since` |
| `runsAt` | Kde běží | text | ne |  |  |  |  | `runs_at` |
| `autoPrepareInvoice` | Připravovat fakturu | checkbox | ne |  |  |  |  | `auto_prepare_invoice` |
| `invoiceLeadDays` | Faktura dní předem | number | ne |  |  | min 0, max 90, výchozí `14` |  | `invoice_lead_days` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## web_domain

**Doména** (množné číslo: Domény). Domény klientů a agentury s expirací a upozorněním (`warn_days`). Stránku `/muj-prostor/domeny` (barvy expirace, hromadné vložení) kreslí UI modulu; generický seznam s filtry a exportem je na `/muj-prostor/domeny/vse`.

- **Modul:** [Můj prostor](../moduly/muj-prostor.md)
- **Tabulka:** `web_domain` ([databáze](../databaze/muj-prostor.md))
- **Seznam:** `/muj-prostor/domeny/vse`, detail `/muj-prostor/domeny/vse/<id>`
- **Oprávnění:** read: `muj-prostor.domains`, write: `muj-prostor.domains`, create: `muj-prostor.domains`, delete: `muj-prostor.domains`, export: `muj-prostor.domains`
- **Název záznamu:** `domain`
- **Háčky a rozšíření entity:** `beforeCreate`, `beforeUpdate`, `search`
- **Definice:** `packages/modules/muj-prostor/src/entities.ts`

### Pole entity `web_domain`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `domain` | Doména | text | ano |  |  |  |  | `domain` |
| `company` | Klient | record | ne | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `registrar` | Registrátor | text | ne |  |  |  |  | `registrar` |
| `expiresOn` | Expirace | date | ne |  |  |  |  | `expires_on` |
| `payer` | Platí | select | ne | `agency`, `client` |  | výchozí `client` |  | `payer` |
| `autoRenew` | Auto-prodloužení | checkbox | ne |  |  |  |  | `auto_renew` |
| `renewalPrice` | Cena obnovy | currency | ne |  |  | min 0 |  | `renewal_price_minor` |
| `recurringService` | Hosting | record | ne | vazba na [`recurring_service`](muj-prostor.md#recurring_service) |  |  |  | `recurring_service_id` |
| `warnDays` | Upozornit dní předem | number | ne |  |  | min 1, výchozí `30` |  | `warn_days` |
| `dns` | DNS | longtext | ne |  |  |  |  | `dns` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## email_library_item

**Položka knihovny** (množné číslo: E-mailová knihovna). Soukromá e-mailová knihovna vlastníka (KNI-01): texty, které nejsou sdílenými šablonami. Stránku `/muj-prostor/knihovna` (hledání, náhled s daty kontaktu, kopírování, Gmail) kreslí UI modulu; generický seznam s filtry, exportem a plným detailem záznamu je na `/muj-prostor/knihovna/vse`. Text je prostý (`bodyText`) s proměnnými `{jmeno}`; `bodyJson` (Tiptap) vzniká jen přesunem ze šablon a úprava textu ho vynuluje, aby se texty nerozcházely.

- **Modul:** [Můj prostor](../moduly/muj-prostor.md)
- **Tabulka:** `email_library_item` ([databáze](../databaze/muj-prostor.md))
- **Seznam:** `/muj-prostor/knihovna/vse`, detail `/muj-prostor/knihovna/vse/<id>`
- **Oprávnění:** read: `muj-prostor.email_library`, write: `muj-prostor.email_library`, create: `muj-prostor.email_library`, delete: `muj-prostor.email_library`, export: `muj-prostor.email_library`
- **Název záznamu:** `title`
- **Háčky a rozšíření entity:** `beforeCreate`, `beforeUpdate`, `search`
- **Definice:** `packages/modules/muj-prostor/src/library/entity.ts`

### Pole entity `email_library_item`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | Název | text | ano |  |  |  |  | `title` |
| `category` | Kategorie | text | ne |  |  |  |  | `category` |
| `subject` | Předmět | text | ne |  |  |  |  | `subject` |
| `body` | Text | longtext | ne |  |  |  |  | `body_text` |
| `tags` | Štítky | multiselect | ne | číselník `tag` |  |  |  | `tags` |

## recurring_invoice

**Opakovaná faktura** (množné číslo: Opakované faktury). Návrhy opakovaných faktur za období služby (v3, odeslání do Fakturoidu po schválení).

- **Modul:** [Můj prostor](../moduly/muj-prostor.md)
- **Tabulka:** `recurring_invoice` ([databáze](../databaze/muj-prostor.md))
- **Seznam:** `/muj-prostor/faktury/vse`, detail `/muj-prostor/faktury/vse/<id>`
- **Oprávnění:** read: `muj-prostor.recurring_invoices`, write: `muj-prostor.recurring_invoices`, create: `muj-prostor.recurring_invoices`
- **Název záznamu:** `periodFrom`
- **Vytvoření:** jen příkazy modulu (Návrhy faktur vznikají automaticky z opakovaných služeb.)
- **Smazání:** nelze (Návrh faktury se neruší mazáním, ale stornem.)
- **Háčky a rozšíření entity:** `beforeUpdate`
- **Definice:** `packages/modules/muj-prostor/src/entities.ts`

### Pole entity `recurring_invoice`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `periodFrom` | Období od | date | ne |  |  |  | jen pro čtení | `period_from` |
| `periodTo` | Období do | date | ne |  |  |  | jen pro čtení | `period_to` |
| `service` | Služba | record | ne | vazba na [`recurring_service`](muj-prostor.md#recurring_service) |  |  | jen pro čtení | `recurring_service_id` |
| `amount` | Částka | currency | ne |  |  | min 0 | součet | `amount_minor` |
| `status` | Stav | select | ne | `draft`, `approved`, `sent_to_fakturoid`, `canceled` |  | výchozí `draft` | jen pro čtení | `status` |
| `fakturoidNumber` | Číslo ve Fakturoidu | text | ne |  |  |  | jen pro čtení | `fakturoid_number` |
| `fakturoidUrl` | Odkaz | url | ne |  |  |  | jen pro čtení | `fakturoid_url` |
| `error` | Chyba | longtext | ne |  |  |  | jen pro čtení | `error` |
