# @rebar/core/seed

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/seed` (soubor `packages/core/src/seed/index.ts`). Exportů: 5, z toho s popisem 3.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`defineSeed`](#defineseed) | function |  |  |
| [`runSeed`](#runseed) | function | Založí chybějící výchozí data. Nic existujícího nepřepisuje (správce to mohl změnit v administraci). |  |
| [`DEFAULT_ROLES`](#default_roles) | const | Výchozí role platformy: jen systémová role vlastníka (vidí a smí všechno). Jádro nezná žádný modul, takže další role a jejich oprávnění definuje každý klient ve svém seedu (`clients/<slug>/seed/index.ts`, `defineSeed({ roles })`). |  |
| [`RunSeedOptions`](#runseedoptions) | type |  |  |
| [`Seed`](#seed) | type | Výchozí data klienta: role, pipeline, číselníky a číselné řady. Spouští se při instalaci a po aktualizaci (idempotentně). |  |

### defineSeed

function · `packages/core/src/seed/seed.ts`

_Bez popisu._

```ts
function defineSeed(seed: Seed): Seed
```

### runSeed

function · `packages/core/src/seed/seed.ts`

Založí chybějící výchozí data. Nic existujícího nepřepisuje (správce to mohl změnit v administraci).

```ts
async function runSeed(db: Executor, seed: Seed, { config, catalog, moduleSeeds = [] }: RunSeedOptions): Promise<void>
```

### DEFAULT_ROLES

const · `packages/core/src/seed/default-roles.ts`

Výchozí role platformy: jen systémová role vlastníka (vidí a smí všechno). Jádro nezná žádný modul, takže další
role a jejich oprávnění definuje každý klient ve svém seedu (`clients/<slug>/seed/index.ts`, `defineSeed({ roles })`).

```ts
const DEFAULT_ROLES: readonly RoleDef[]
```

### RunSeedOptions

type · `packages/core/src/seed/seed.ts`

_Bez popisu._

```ts
type RunSeedOptions = {
  config: Pick<ClientConfig, "security"> & Partial<Pick<ClientConfig, "dashboards">>;
  catalog: ReadonlySet<string>;
  /** Výchozí data zapnutých modulů (z jejich manifestů). */
  moduleSeeds?: readonly ModuleSeed[];
};
```

### Seed

type · `packages/core/src/seed/seed.ts`

Výchozí data klienta: role, pipeline, číselníky a číselné řady. Spouští se při instalaci a po aktualizaci (idempotentně).

```ts
type Seed = {
  roles: readonly RoleDef[];
  pipelines?: readonly PipelineDef[];
  lookups?: readonly LookupDef[];
  series?: readonly SeriesDef[];
};
```
