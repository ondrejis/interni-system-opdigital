# @rebar/fakturace/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/fakturace/schema` (soubor `packages/modules/fakturace/src/schema.ts`). Exportů: 7, z toho s popisem 6.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`invoice`](#invoice) | const | Faktura. Koncept nemá číslo (přidělí se při vystavení, aby v řadě nevznikaly díry). Stav: `draft` → `issued` → `partial` (část uhrazena) → `paid`; `credited` = zrušeno dobropisem. Součty jsou v haléřích a počítají se při uložení z položek. |  |
| [`invoiceDispatch`](#invoicedispatch) | const | Evidence odeslání vydané faktury e-mailem (doklad nebo upomínka). Tělo zprávy se neukládá (jen předmět); stav doručení do SMTP drží `email_log` (měkký odkaz `emailLogId`) a zrcadlí se sem úlohou i při čtení. |  |
| [`invoiceLine`](#invoiceline) | const |  |  |
| [`payment`](#payment) | const | Úhrada faktury; částečné úhrady jsou povolené. |  |
| [`receivedInvoice`](#receivedinvoice) | const | Přijatá (nákladová) faktura od dodavatele. Rozpadá se na řádky s oddílem rozpočtu zakázky, tím vstupuje do skutečných nákladů (poskytovatel nákladů fakturace). Schválená faktura je zamčená; úprava = vrátit do konceptu. |  |
| [`receivedInvoiceLine`](#receivedinvoiceline) | const | Řádek přijaté faktury rozpadnutý na oddíl rozpočtu (a případně položku) zakázky. |  |
| [`PartySnapshot`](#partysnapshot) | type | Údaje o straně dokladu, uložené při vystavení, aby se vystavený doklad už nikdy neměnil. |  |

### invoice

const · `packages/modules/fakturace/src/schema.ts`

Faktura. Koncept nemá číslo (přidělí se při vystavení, aby v řadě nevznikaly díry). Stav:
`draft` → `issued` → `partial` (část uhrazena) → `paid`; `credited` = zrušeno dobropisem.
Součty jsou v haléřích a počítají se při uložení z položek.

```ts
const invoice: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "invoice"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "invoice"; dataType: "date"; columnType: "PgTimestamp"; data: Da…
```

### invoiceDispatch

const · `packages/modules/fakturace/src/schema.ts`

Evidence odeslání vydané faktury e-mailem (doklad nebo upomínka). Tělo zprávy se neukládá (jen předmět);
stav doručení do SMTP drží `email_log` (měkký odkaz `emailLogId`) a zrcadlí se sem úlohou i při čtení.

```ts
const invoiceDispatch: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "invoice_dispatch"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "invoice_dispatch"; dataType: "string"; columnType: "PgUUID"; …
```

### invoiceLine

const · `packages/modules/fakturace/src/schema.ts`

_Bez popisu._

```ts
const invoiceLine: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "invoice_line"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "invoice_line"; dataType: "string"; columnType: "PgUUID"; data: st…
```

### payment

const · `packages/modules/fakturace/src/schema.ts`

Úhrada faktury; částečné úhrady jsou povolené.

```ts
const payment: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "payment"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "payment"; dataType: "date"; columnType: "PgTimestamp"; data: Da…
```

### receivedInvoice

const · `packages/modules/fakturace/src/schema.ts`

Přijatá (nákladová) faktura od dodavatele. Rozpadá se na řádky s oddílem rozpočtu zakázky, tím vstupuje do skutečných
nákladů (poskytovatel nákladů fakturace). Schválená faktura je zamčená; úprava = vrátit do konceptu.

```ts
const receivedInvoice: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "received_invoice"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "received_invoice"; dataType: "date"; columnType: "PgTi…
```

### receivedInvoiceLine

const · `packages/modules/fakturace/src/schema.ts`

Řádek přijaté faktury rozpadnutý na oddíl rozpočtu (a případně položku) zakázky.

```ts
const receivedInvoiceLine: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "received_invoice_line"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "received_invoice_line"; dataType: "string"; columnType: …
```

### PartySnapshot

type · `packages/modules/fakturace/src/schema.ts`

Údaje o straně dokladu, uložené při vystavení, aby se vystavený doklad už nikdy neměnil.

```ts
type PartySnapshot = {
  name: string;
  ico: string | null;
  dic: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  email?: string | null;
  phone?: string | null;
  web?: string | null;
  bankAccount?: string | null;
};
```
