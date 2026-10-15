# @rebar/muj-prostor/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/muj-prostor/schema` (soubor `packages/modules/muj-prostor/src/schema.ts`). Exportů: 9, z toho s popisem 9.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`DOMAIN_PAYERS`](#domain_payers) | const | Kdo platí doménu. |  |
| [`INVOICE_STATUSES`](#invoice_statuses) | const | Stav návrhu opakované faktury. |  |
| [`RECURRING_KINDS`](#recurring_kinds) | const | Druh opakované služby. |  |
| [`RECURRING_PERIODS`](#recurring_periods) | const | Období, za které se služba platí (R-26: ročně i měsíčně). |  |
| [`RECURRING_STATUSES`](#recurring_statuses) | const | Stav opakované služby. |  |
| [`emailLibraryItem`](#emaillibraryitem) | const | Soukromá knihovna e-mailových textů vlastníka (odděleně od sdílených šablon, lze přesouvat mezi nimi). |  |
| [`recurringInvoice`](#recurringinvoice) | const | Návrh opakované faktury za období služby (v3, Fakturoid): koncept → schválená → odeslaná do Fakturoidu. Pro službu a začátek období je jen jeden návrh (`recurring_invoice_period_uq`). |  |
| [`recurringService`](#recurringservice) | const | Opakovaná služba klienta (hosting, údržba webu) s cenou za období a dalším termínem obnovy. |  |
| [`webDomain`](#webdomain) | const | Doména klienta nebo agentury: registrátor, expirace, kdo platí, varování `warn_days` předem. Doména je mezi živými unikátní. |  |

### DOMAIN_PAYERS

const · `packages/modules/muj-prostor/src/schema.ts`

Kdo platí doménu.

```ts
const DOMAIN_PAYERS: readonly ["agency", "client"]
```

### INVOICE_STATUSES

const · `packages/modules/muj-prostor/src/schema.ts`

Stav návrhu opakované faktury.

```ts
const INVOICE_STATUSES: readonly ["draft", "approved", "sent_to_fakturoid", "canceled"]
```

### RECURRING_KINDS

const · `packages/modules/muj-prostor/src/schema.ts`

Druh opakované služby.

```ts
const RECURRING_KINDS: readonly ["hosting", "maintenance"]
```

### RECURRING_PERIODS

const · `packages/modules/muj-prostor/src/schema.ts`

Období, za které se služba platí (R-26: ročně i měsíčně).

```ts
const RECURRING_PERIODS: readonly ["yearly", "monthly"]
```

### RECURRING_STATUSES

const · `packages/modules/muj-prostor/src/schema.ts`

Stav opakované služby.

```ts
const RECURRING_STATUSES: readonly ["active", "paused", "canceled"]
```

### emailLibraryItem

const · `packages/modules/muj-prostor/src/schema.ts`

Soukromá knihovna e-mailových textů vlastníka (odděleně od sdílených šablon, lze přesouvat mezi nimi).

```ts
const emailLibraryItem: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "email_library_item"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "email_library_item"; dataType: "date"; columnType: "…
```

### recurringInvoice

const · `packages/modules/muj-prostor/src/schema.ts`

Návrh opakované faktury za období služby (v3, Fakturoid): koncept → schválená → odeslaná do Fakturoidu. Pro službu
a začátek období je jen jeden návrh (`recurring_invoice_period_uq`).

```ts
const recurringInvoice: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "recurring_invoice"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "recurring_invoice"; dataType: "date"; columnType: "Pg…
```

### recurringService

const · `packages/modules/muj-prostor/src/schema.ts`

Opakovaná služba klienta (hosting, údržba webu) s cenou za období a dalším termínem obnovy.

```ts
const recurringService: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "recurring_service"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "recurring_service"; dataType: "date"; columnType: "Pg…
```

### webDomain

const · `packages/modules/muj-prostor/src/schema.ts`

Doména klienta nebo agentury: registrátor, expirace, kdo platí, varování `warn_days` předem. Doména je mezi živými unikátní.

```ts
const webDomain: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "web_domain"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "web_domain"; dataType: "date"; columnType: "PgTimestamp"; da…
```
