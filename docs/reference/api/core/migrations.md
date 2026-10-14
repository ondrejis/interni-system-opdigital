# @rebar/core/migrations

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/migrations` (soubor `packages/core/src/db/migrations.ts`). Exportů: 7, z toho s popisem 6.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`applyGrants`](#applygrants) | function | Přidělí aplikační roli minimální práva: čtení a zápis dat, žádné DDL, u append-only tabulek (audit) jen INSERT a SELECT. Spouští se po každé migraci pod uživatelem migrací, takže je idempotentní. |  |
| [`migrationSources`](#migrationsources) | function | Zdroje migrací: jádro první, pak zapnuté moduly v pořadí závislostí (pořadí `MODULE_IDS` je k tomu záměrně sestavené a hlídá ho test). Každý modul má vlastní tabulku záznamu o migracích. |  |
| [`runMigrations`](#runmigrations) | function | Spustí migrace a přidělí práva aplikační roli. Pouští se jako samostatný krok (nasazení, `pnpm db:migrate`), nikdy ne za běhu aplikace. Migrace jsou jen dopředné a zpětně kompatibilní (expand → contract), aby rollback aplikace nerozbil data. |  |
| [`APPEND_ONLY_TABLES`](#append_only_tables) | const | Tabulky, které smí aplikace jen číst a přidávat do nich. |  |
| [`CORE_MIGRATIONS`](#core_migrations) | const | Složka s SQL migracemi jádra (verzované v repu). |  |
| [`MigrateOptions`](#migrateoptions) | type |  |  |
| [`MigrationSource`](#migrationsource) | type | Složka s migracemi a název tabulky se záznamem o provedených migracích (každý modul má vlastní). |  |

### applyGrants

function · `packages/core/src/db/grants.ts`

Přidělí aplikační roli minimální práva: čtení a zápis dat, žádné DDL,
u append-only tabulek (audit) jen INSERT a SELECT. Spouští se po každé migraci
pod uživatelem migrací, takže je idempotentní.

```ts
async function applyGrants(sql: postgres.Sql, appRole: string, schemas: string[] = ["public"]): Promise<void>
```

### migrationSources

function · `packages/core/src/db/migrations.ts`

Zdroje migrací: jádro první, pak zapnuté moduly v pořadí závislostí (pořadí `MODULE_IDS` je k tomu
záměrně sestavené a hlídá ho test). Každý modul má vlastní tabulku záznamu o migracích.

```ts
function migrationSources(repoRoot: string, moduleIds: readonly string[]): MigrationSource[]
```

### runMigrations

function · `packages/core/src/db/migrate.ts`

Spustí migrace a přidělí práva aplikační roli. Pouští se jako samostatný krok
(nasazení, `pnpm db:migrate`), nikdy ne za běhu aplikace. Migrace jsou jen dopředné
a zpětně kompatibilní (expand → contract), aby rollback aplikace nerozbil data.

```ts
async function runMigrations({ url, appRole, folders = [CORE_MIGRATIONS], queues = [], }: MigrateOptions): Promise<void>
```

### APPEND_ONLY_TABLES

const · `packages/core/src/db/grants.ts`

Tabulky, které smí aplikace jen číst a přidávat do nich.

```ts
const APPEND_ONLY_TABLES: readonly ["audit_log"]
```

### CORE_MIGRATIONS

const · `packages/core/src/db/migrate.ts`

Složka s SQL migracemi jádra (verzované v repu).

```ts
const CORE_MIGRATIONS: string
```

### MigrateOptions

type · `packages/core/src/db/migrate.ts`

_Bez popisu._

```ts
type MigrateOptions = {
  /** Připojení pod uživatelem migrací (vlastník schématu). */
  url: string;
  /** Aplikační role, které se po migraci přidělí práva. */
  appRole: string;
  /** Složky s migracemi: jádro první, pak zapnuté moduly. */
  folders?: (string | MigrationSource)[];
  /** Úlohy na pozadí, jejichž fronty se mají založit (pg-boss; fronty mají vlastní tabulky). */
  queues?: Parameters<typeof installQueues>[1];
};
```

### MigrationSource

type · `packages/core/src/db/migrate.ts`

Složka s migracemi a název tabulky se záznamem o provedených migracích (každý modul má vlastní).

```ts
type MigrationSource = { folder: string; table?: string };
```
