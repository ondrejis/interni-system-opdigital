# @rebar/core/db

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/db` (soubor `packages/core/src/db/index.ts`). Exportů: 15, z toho s popisem 9.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`audit`](#audit) | function | Sloupce `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` pro každou tabulku mimo identitu. |  |
| [`auditColumnsWith`](#auditcolumnswith) | function | Sloupce, které má mít každá tabulka (ADR 002). `userId` je odkaz na `user.id` zadaný líně kvůli cyklu mezi tabulkami. |  |
| [`createDb`](#createdb) | function | Připojení k databázi pod uživatelem s minimálními právy. |  |
| [`minor`](#minor) | function | Peněžní částka v haléřích (celé číslo, ADR 003). Sloupec pojmenujte `*_minor`. |  |
| [`newId`](#newid) | function | Nové ID záznamu: UUID v7 (časově řazené). PostgreSQL 17 `uuidv7()` nemá, generuje aplikace (ADR 002). |  |
| [`pk`](#pk) | function | Primární klíč: UUID v7 generované aplikací. |  |
| [`ts`](#ts) | function |  |  |
| [`visibilityColumns`](#visibilitycolumns) | function | Sloupce viditelnosti shared/private (zámek) pro každou entitu s `EntityDef.visibility` (D §5.1). `is_private` je efektivní (denormalizovaná) hodnota, `visibility_source` říká, zda ji zvolil uživatel (`own`), nebo se zdědila od rodiče (`inherited`). Použití: `...visibilityColumns()` v tabulce a `visibilityIndex("deal_private_idx", t)` mezi indexy. |  |
| [`visibilityIndex`](#visibilityindex) | function | Částečný index nad soukromými záznamy tabulky (`where is_private`); rychlá filtrace i anti-join. |  |
| [`AuditChange`](#auditchange) | type |  |  |
| [`CreateDbOptions`](#createdboptions) | type |  |  |
| [`Db`](#db) | type |  |  |
| [`DbHandle`](#dbhandle) | type |  |  |
| [`Executor`](#executor) | type | Cokoli, čím jde posílat dotazy: připojení nebo transakce. |  |
| [`Tx`](#tx) | type |  |  |

### audit

function · `packages/core/src/db/schema/common.ts`

Sloupce `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` pro každou tabulku mimo identitu.

```ts
function audit(): { createdAt: import("drizzle-orm").HasDefault<import("drizzle-orm").NotNull<import("drizzle-orm/pg-core").PgTimestampBuilderInitial<string>>>; updatedAt: import("drizzle-orm").HasDefault<import("drizzle-orm").HasDefault<import("drizzle-orm…
```

### auditColumnsWith

function · `packages/core/src/db/columns.ts`

Sloupce, které má mít každá tabulka (ADR 002). `userId` je odkaz na `user.id`
zadaný líně kvůli cyklu mezi tabulkami.

```ts
function auditColumnsWith(userId: () => AnyPgColumn): { createdAt: import("drizzle-orm").HasDefault<import("drizzle-orm").NotNull<import("drizzle-orm/pg-core").PgTimestampBuilderInitial<string>>>; updatedAt: import("drizzle-orm").HasDefault<import("drizzle-orm").HasDefault<import("drizzle-orm…
```

### createDb

function · `packages/core/src/db/client.ts`

Připojení k databázi pod uživatelem s minimálními právy.

```ts
function createDb(url: string, { max = 10, logger }: CreateDbOptions = {}): DbHandle
```

### minor

function · `packages/core/src/db/columns.ts`

Peněžní částka v haléřích (celé číslo, ADR 003). Sloupec pojmenujte `*_minor`.

```ts
function minor(name: string): import("drizzle-orm/pg-core").PgBigInt53BuilderInitial<string>
```

### newId

function · `packages/core/src/db/ids.ts`

Nové ID záznamu: UUID v7 (časově řazené). PostgreSQL 17 `uuidv7()` nemá, generuje aplikace (ADR 002).

```ts
function newId(): string
```

### pk

function · `packages/core/src/db/columns.ts`

Primární klíč: UUID v7 generované aplikací.

```ts
function pk(name = "id"): import("drizzle-orm").HasRuntimeDefault<import("drizzle-orm").HasDefault<import("drizzle-orm").IsPrimaryKey<import("drizzle-orm").NotNull<import("drizzle-orm/pg-core").PgUUIDBuilderInitial<string>>>>>
```

### ts

function · `packages/core/src/db/columns.ts`

_Bez popisu._

```ts
function ts(name: string): import("drizzle-orm/pg-core").PgTimestampBuilderInitial<string>
```

### visibilityColumns

function · `packages/core/src/db/columns.ts`

Sloupce viditelnosti shared/private (zámek) pro každou entitu s `EntityDef.visibility` (D §5.1). `is_private` je
efektivní (denormalizovaná) hodnota, `visibility_source` říká, zda ji zvolil uživatel (`own`), nebo se zdědila od
rodiče (`inherited`). Použití: `...visibilityColumns()` v tabulce a `visibilityIndex("deal_private_idx", t)` mezi indexy.

```ts
function visibilityColumns(): { isPrivate: import("drizzle-orm").HasDefault<import("drizzle-orm").NotNull<import("drizzle-orm/pg-core").PgBooleanBuilderInitial<"is_private">>>; visibilitySource: import("drizzle-orm").HasDefault<import("drizzle-orm").NotNull<import("dri…
```

### visibilityIndex

function · `packages/core/src/db/columns.ts`

Částečný index nad soukromými záznamy tabulky (`where is_private`); rychlá filtrace i anti-join.

```ts
function visibilityIndex(name: string, table: { isPrivate: AnyPgColumn }): import("drizzle-orm/pg-core").IndexBuilder
```

### AuditChange

type · `packages/core/src/db/schema/audit.ts`

_Bez popisu._

```ts
type AuditChange = { field: string; old: unknown; new: unknown };
```

### CreateDbOptions

type · `packages/core/src/db/client.ts`

_Bez popisu._

```ts
type CreateDbOptions = {
  /** Max. počet spojení v poolu. Na 1 vCPU / 4 GB stačí málo. */
  max?: number;
  /** Zachytávání dotazů (měření výkonu, počítání dotazů v testech na N+1). */
  logger?: { logQuery(query: string, params: unknown[]): void };
};
```

### Db

type · `packages/core/src/db/client.ts`

_Bez popisu._

```ts
type Db = PostgresJsDatabase<typeof schema>;
```

### DbHandle

type · `packages/core/src/db/client.ts`

_Bez popisu._

```ts
type DbHandle = {
  db: Db;
  sql: ReturnType<typeof postgres>;
  close: () => Promise<void>;
};
```

### Executor

type · `packages/core/src/db/client.ts`

Cokoli, čím jde posílat dotazy: připojení nebo transakce.

```ts
type Executor = Db | Tx;
```

### Tx

type · `packages/core/src/db/client.ts`

_Bez popisu._

```ts
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
```
