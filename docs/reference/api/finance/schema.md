# @rebar/finance/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/finance/schema` (soubor `packages/modules/finance/src/schema.ts`). Exportů: 13, z toho s popisem 13.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ALLOCATION_MODES`](#allocation_modes) | const | Jak se platba rozdělila mezi lidi: podle pravidel zakázky, nebo ručně přepsáno. |  |
| [`ISSUER_MODES`](#issuer_modes) | const | Kdo fakturuje retainer: stále stejná osoba, nebo se střídají. |  |
| [`PAYMENT_KINDS`](#payment_kinds) | const | Druh platby (`PaymentKind` v kontraktech). |  |
| [`PAYMENT_SOURCES`](#payment_sources) | const | Odkud platba vznikla. |  |
| [`PAYMENT_STATUSES`](#payment_statuses) | const | Stav platby. |  |
| [`SETTLEMENT_METHODS`](#settlement_methods) | const | Způsob vyrovnání mezi partnery. |  |
| [`SPLIT_APPLIES_TO`](#split_applies_to) | const | Na jaké platby pravidlo rozdělení platí: na všechny, nebo na jeden druh. |  |
| [`SPLIT_MODES`](#split_modes) | const | Způsob pravidla rozdělení. |  |
| [`payment`](#payment) | const | Platba (plánovaná, vystavená, zaplacená, zrušená). `job_id` je prázdné jen u plateb z Fakturoidu (`kind = recurring`, R-12): taková platba je vždy soukromá a mimo saldo. Viditelnost: dědí od zakázky a smí mít vlastní zámek. Měsíční retainer platba je v zakázce jedna na měsíc. |  |
| [`paymentAllocation`](#paymentallocation) | const | Podíl uživatele na platbě v haléřích; součet podílů se rovná částce platby. Dědí viditelnost platby. |  |
| [`retainer`](#retainer) | const | Retainer zakázky: opakovaná měsíční platba s dnem vystavení (1–28) a fakturujícím (pevný, nebo střídavý). Měsíce jsou `YYYY-MM`. Platby z něj generuje úloha `finance.retainer.generate` (idempotentně podle `payment_retainer_month_uq`). |  |
| [`settlement`](#settlement) | const | Vyrovnání mezi partnery (ruční záznam, že jeden druhému zaplatil nebo zafakturoval): kdo, komu, kolik, kdy, jak. Storno vyplní `canceled_at` (záznam se nemaže). Počítá se jen se sdílenými zakázkami. |  |
| [`splitRule`](#splitrule) | const | Pravidlo rozdělení plateb zakázky mezi lidi: procenta, pevná částka za platbu, nebo pevná celková částka; platí pro všechny druhy plateb nebo jen pro jeden, od–do měsíce (`YYYY-MM`). Pořadí určuje `position`. |  |

### ALLOCATION_MODES

const · `packages/modules/finance/src/schema.ts`

Jak se platba rozdělila mezi lidi: podle pravidel zakázky, nebo ručně přepsáno.

```ts
const ALLOCATION_MODES: readonly ["rules", "manual"]
```

### ISSUER_MODES

const · `packages/modules/finance/src/schema.ts`

Kdo fakturuje retainer: stále stejná osoba, nebo se střídají.

```ts
const ISSUER_MODES: readonly ["fixed", "alternate"]
```

### PAYMENT_KINDS

const · `packages/modules/finance/src/schema.ts`

Druh platby (`PaymentKind` v kontraktech).

```ts
const PAYMENT_KINDS: readonly ["one_off", "intro", "retainer", "extra", "recurring"]
```

### PAYMENT_SOURCES

const · `packages/modules/finance/src/schema.ts`

Odkud platba vznikla.

```ts
const PAYMENT_SOURCES: readonly ["manual", "template", "retainer", "fakturoid"]
```

### PAYMENT_STATUSES

const · `packages/modules/finance/src/schema.ts`

Stav platby.

```ts
const PAYMENT_STATUSES: readonly ["planned", "issued", "paid", "canceled"]
```

### SETTLEMENT_METHODS

const · `packages/modules/finance/src/schema.ts`

Způsob vyrovnání mezi partnery.

```ts
const SETTLEMENT_METHODS: readonly ["invoice", "transfer", "offset"]
```

### SPLIT_APPLIES_TO

const · `packages/modules/finance/src/schema.ts`

Na jaké platby pravidlo rozdělení platí: na všechny, nebo na jeden druh.

```ts
const SPLIT_APPLIES_TO: readonly ["all", "one_off", "intro", "retainer", "extra", "recurring"]
```

### SPLIT_MODES

const · `packages/modules/finance/src/schema.ts`

Způsob pravidla rozdělení.

```ts
const SPLIT_MODES: readonly ["percent", "fixed_per_payment", "fixed_total"]
```

### payment

const · `packages/modules/finance/src/schema.ts`

Platba (plánovaná, vystavená, zaplacená, zrušená). `job_id` je prázdné jen u plateb z Fakturoidu (`kind = recurring`,
R-12): taková platba je vždy soukromá a mimo saldo. Viditelnost: dědí od zakázky a smí mít vlastní zámek.
Měsíční retainer platba je v zakázce jedna na měsíc.

```ts
const payment: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "payment"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "payment"; dataType: "date"; columnType: "PgTimestamp"; data: Da…
```

### paymentAllocation

const · `packages/modules/finance/src/schema.ts`

Podíl uživatele na platbě v haléřích; součet podílů se rovná částce platby. Dědí viditelnost platby.

```ts
const paymentAllocation: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "payment_allocation"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "payment_allocation"; dataType: "date"; columnType: "…
```

### retainer

const · `packages/modules/finance/src/schema.ts`

Retainer zakázky: opakovaná měsíční platba s dnem vystavení (1–28) a fakturujícím (pevný, nebo střídavý). Měsíce jsou
`YYYY-MM`. Platby z něj generuje úloha `finance.retainer.generate` (idempotentně podle `payment_retainer_month_uq`).

```ts
const retainer: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "retainer"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "retainer"; dataType: "date"; columnType: "PgTimestamp"; data: …
```

### settlement

const · `packages/modules/finance/src/schema.ts`

Vyrovnání mezi partnery (ruční záznam, že jeden druhému zaplatil nebo zafakturoval): kdo, komu, kolik, kdy, jak.
Storno vyplní `canceled_at` (záznam se nemaže). Počítá se jen se sdílenými zakázkami.

```ts
const settlement: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "settlement"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "settlement"; dataType: "date"; columnType: "PgTimestamp"; da…
```

### splitRule

const · `packages/modules/finance/src/schema.ts`

Pravidlo rozdělení plateb zakázky mezi lidi: procenta, pevná částka za platbu, nebo pevná celková částka;
platí pro všechny druhy plateb nebo jen pro jeden, od–do měsíce (`YYYY-MM`). Pořadí určuje `position`.

```ts
const splitRule: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "split_rule"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "split_rule"; dataType: "date"; columnType: "PgTimestamp"; da…
```
