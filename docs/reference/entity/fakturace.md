# Entity modulu Fakturace

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (registr entit modulu (`ModuleServer.entities`), manifest a schéma tabulek). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Entity modulu [Fakturace](../moduly/fakturace.md). Typy atributů vysvětluje [ARCHITECTURE](../../ARCHITECTURE.md); každý atribut dává tabulce, filtrům, řazení, detailu, hledání a exportu typ a omezení bez dalšího kódu.

## invoice

**Faktura** (množné číslo: Faktury).

- **Modul:** [Fakturace](../moduly/fakturace.md)
- **Tabulka:** `invoice` ([databáze](../databaze/fakturace.md))
- **Seznam:** `/fakturace`, detail `/fakturace/<id>`
- **Oprávnění:** read: `fakturace.read`, write: `fakturace.write`, export: `fakturace.export`
- **Název záznamu:** `title`
- **Rozsah „jen moje“:** sloupce `created_by`
- **Háčky a rozšíření entity:** `beforeCreate`, `afterUpdate`, `beforeDelete`, `search`
- **Definice:** `packages/modules/fakturace/src/server.ts`

### Pole entity `invoice`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `title` | Název | text | ne |  |  |  |  | `title` |
| `number` | Číslo | text | ne |  |  |  | jen pro čtení | `number` |
| `kind` | Druh | select | ano | `proforma`, `partial`, `final`, `credit_note`, `retention` |  |  |  | `kind` |
| `vatMode` | Režim DPH | select | ne | `standard`, `reverse_charge` |  |  | jen pro čtení | `vat_mode` |
| `state` | Stav | select | ne | `draft`, `issued`, `partial`, `paid`, `credited` |  |  | jen pro čtení | `state` |
| `company` | Odběratel | record | ano | vazba na [`company`](kontakty.md#company) |  |  |  | `company_id` |
| `person` | Kontaktní osoba | record | ne | vazba na [`person`](kontakty.md#person) |  |  |  | `person_id` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `issueDate` | Vystaveno | date | ne |  |  |  |  | `issue_date` |
| `taxableDate` | DUZP | date | ne |  |  |  |  | `taxable_date` |
| `dueDate` | Splatnost | date | ne |  |  |  |  | `due_date` |
| `net` | Základ | currency | ne |  |  |  | jen pro čtení, součet | `net_minor` |
| `vat` | DPH | currency | ne |  |  |  | jen pro čtení, součet | `vat_minor` |
| `gross` | Celkem | currency | ne |  |  |  | jen pro čtení, součet | `gross_minor` |
| `retention` | Zádržné | currency | ne |  |  |  | jen pro čtení, součet | `retention_minor` |
| `paid` | Uhrazeno | currency | ne |  |  |  | jen pro čtení, součet | `paid_minor` |
| `overdue` | Po splatnosti | checkbox | ne |  |  |  | jen pro čtení | `overdue` |
| `variableSymbol` | Variabilní symbol | text | ne |  |  |  | jen pro čtení | `variable_symbol` |
| `sentOn` | Odesláno e-mailem | date | ne |  |  |  | jen pro čtení | `sent_on` |
| `reminderCount` | Upomínky | number | ne |  |  |  | jen pro čtení | `reminder_count` |
| `lastReminderOn` | Poslední upomínka | date | ne |  |  |  | jen pro čtení | `last_reminder_on` |
| `originalInvoice` | K dokladu | record | ne | vazba na [`invoice`](fakturace.md#invoice) |  |  | jen pro čtení | `original_invoice_id` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |

## received_invoice

**Přijatá faktura** (množné číslo: Přijaté faktury). Přijatá faktura od dodavatele. Zakládá se i v seznamu; řádky, schválení a úhrada jsou na detailu.

- **Modul:** [Fakturace](../moduly/fakturace.md)
- **Tabulka:** `received_invoice` ([databáze](../databaze/fakturace.md))
- **Seznam:** `/fakturace/prijate`, detail `/fakturace/prijate/<id>`
- **Oprávnění:** read: `fakturace.read`, write: `fakturace.write`, export: `fakturace.export`
- **Název záznamu:** `number`, stav (kanban): `state`
- **Rozsah „jen moje“:** sloupce `created_by`
- **Háčky a rozšíření entity:** `beforeCreate`, `beforeUpdate`, `beforeDelete`, `search`
- **Definice:** `packages/modules/fakturace/src/received/entity.ts`

### Pole entity `received_invoice`

| Klíč | Název | Typ | Povinné | Hodnoty a vazby | Oprávnění ke čtení | Omezení | Příznaky | Sloupec v DB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `number` | Číslo dokladu | text | ano |  |  |  |  | `number` |
| `supplier` | Dodavatel | record | ano | vazba na [`company`](kontakty.md#company) |  |  |  | `supplier_id` |
| `job` | Zakázka | record | ne | vazba na [`job`](zakazky.md#job) |  |  |  | `job_id` |
| `state` | Stav | select | ne | `draft`, `pending`, `approved`, `rejected`, `paid` |  |  | jen pro čtení | `state` |
| `issueDate` | Vystaveno | date | ne |  |  |  |  | `issue_date` |
| `taxableDate` | DUZP | date | ne |  |  |  |  | `taxable_date` |
| `dueDate` | Splatnost | date | ne |  |  |  |  | `due_date` |
| `receivedDate` | Přijato | date | ne |  |  |  |  | `received_date` |
| `net` | Základ | currency | ne |  |  |  | součet | `net_minor` |
| `vat` | DPH | currency | ne |  |  |  | jen pro čtení, součet | `vat_minor` |
| `gross` | Celkem | currency | ne |  |  |  | součet | `gross_minor` |
| `paid` | Uhrazeno | currency | ne |  |  |  | jen pro čtení, součet | `paid_minor` |
| `paidDate` | Datum úhrady | date | ne |  |  |  | jen pro čtení | `paid_date` |
| `vatMode` | Režim DPH | select | ne | `standard`, `reverse_charge` |  | výchozí `standard` |  | `vat_mode` |
| `variableSymbol` | Variabilní symbol | text | ne |  |  |  |  | `variable_symbol` |
| `order` | Objednávka | record | ne | vazba na [`job_order`](zakazky.md#job_order) |  |  |  | `order_id` |
| `note` | Poznámka | longtext | ne |  |  |  |  | `note` |
