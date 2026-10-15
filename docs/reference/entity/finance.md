# Entity modulu Finance

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Finance](../moduly/finance.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## payment

**Platba** (množné číslo: Platby). Platba zakázky (plánovaná, vystavená, zaplacená). Vzniká příkazy modulu (šablona, retainer, ruční zadání); rozdělení mezi lidi je v `payment_allocation`. Částky vidí jen, kdo má `finance.read`. Platba bez zakázky (Fakturoid) je vždy soukromá a mimo saldo (R-12).

- **Modul:** [Finance](../moduly/finance.md)
- **Tabulka:** `payment` ([databáze](../databaze/finance.md))
- **Seznam:** `/finance/platby`, detail `/finance/platby/<id>`
- **Oprávnění:** read: `finance.read`, write: `finance.payments_write`, create: `finance.payments_write`, delete: `finance.payments_write`, export: `finance.export`
- **Název záznamu:** `description`
- **Rozsah „jen moje“:** sloupce `issuer_id`
- **Vytvoření:** jen příkazy modulu (Platba se zakládá v zakázce (záložka Finance) nebo na stránce Platby a rozdělení.)
- **Háčky a rozšíření entity:** `search`
- **Definice:** `packages/modules/finance/src/entities.ts`

### Pole entity `payment`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `description` | Popis | text | ano |  |  |  |  | `description` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  | jen pro čtení | `job_id` |
| `company` | Klient | record | ne | vazba na [`company`](kontakty.md#company) |  |  | jen pro čtení | `company_id` |
| `amount` | Částka | currency | ano |  |  | min 1 | jen pro čtení, součet | `amount_minor` |
| `kind` | Druh | select | ne | `one_off`, `intro`, `retainer`, `extra`, `recurring` |  | výchozí `one_off` | jen pro čtení | `kind` |
| `status` | Stav | select | ne | `planned`, `issued`, `paid`, `canceled` |  | výchozí `planned` | jen pro čtení | `status` |
| `issuer` | Fakturuje | user | ne |  |  |  | jen pro čtení | `issuer_id` |
| `dueOn` | Splatnost | date | ne |  |  |  | jen pro čtení | `due_on` |
| `periodMonth` | Měsíc | text | ne |  |  |  | jen pro čtení | `period_month` |
| `invoiceNumber` | Číslo faktury | text | ne |  |  |  | jen pro čtení | `invoice_number` |
| `invoiceUrl` | Odkaz na fakturu | url | ne |  |  |  | jen pro čtení | `invoice_url` |
| `issuedOn` | Vystaveno | date | ne |  |  |  | jen pro čtení | `issued_on` |
| `paidOn` | Zaplaceno | date | ne |  |  |  | jen pro čtení | `paid_on` |
| `source` | Zdroj | select | ne | `manual`, `template`, `retainer`, `fakturoid` |  | výchozí `manual` | jen pro čtení | `source` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## settlement

**Vyrovnání** (množné číslo: Vyrovnání). Záznam vyrovnání mezi partnery (kdo komu, kolik, jak). Storno místo mazání; zápis jen s `finance.settlements_write`.

- **Modul:** [Finance](../moduly/finance.md)
- **Tabulka:** `settlement` ([databáze](../databaze/finance.md))
- **Seznam:** `/finance/vyrovnani/zapisy`, detail `/finance/vyrovnani/zapisy/<id>`
- **Oprávnění:** read: `finance.read`, write: `finance.settlements_write`, create: `finance.settlements_write`, export: `finance.export`
- **Název záznamu:** `settledOn`
- **Vytvoření:** jen příkazy modulu (Vyrovnání se zapisuje na stránce Vyrovnání („Zapsat vyrovnání“).)
- **Smazání:** nelze (Vyrovnání se neruší mazáním, ale stornem.)
- **Definice:** `packages/modules/finance/src/entities.ts`

### Pole entity `settlement`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `settledOn` | Datum | date | ano |  |  |  | jen pro čtení | `settled_on` |
| `from` | Od | user | ano |  |  |  | jen pro čtení | `from_user_id` |
| `to` | Komu | user | ano |  |  |  | jen pro čtení | `to_user_id` |
| `amount` | Částka | currency | ano |  |  | min 1 | jen pro čtení, součet | `amount_minor` |
| `method` | Způsob | select | ano | `invoice`, `transfer`, `offset` |  | výchozí `transfer` | jen pro čtení | `method` |
| `reference` | Odkaz / číslo | text | ne |  |  |  |  | `reference` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |
| `canceledAt` | Stornováno | date | ne |  |  |  | jen pro čtení | `canceled_at` |
