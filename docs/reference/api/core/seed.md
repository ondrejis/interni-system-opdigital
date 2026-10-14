# @rebar/core/seed

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/seed` (soubor `packages/core/src/seed/index.ts`). Exportů: 6, z toho s popisem 4.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`defineSeed`](#defineseed) | function |  |  |
| [`runSeed`](#runseed) | function | Založí chybějící výchozí data. Nic existujícího nepřepisuje (správce to mohl změnit v administraci). |  |
| [`ACCOUNTANT_ROLE`](#accountant_role) | const | Účetní: doklady a podklady pro účetnictví bez zakázkové ekonomiky. Není součástí `DEFAULT_ROLES` (ne každý klient ji má); klient ji do seedu přidá (`roles: [...DEFAULT_ROLES, ACCOUNTANT_ROLE]`) a výchozí nástěnka „Účetní“ se jí pak založí. |  |
| [`DEFAULT_ROLES`](#default_roles) | const | Výchozí role pro stavební a řemeslné firmy (zadání §2). Klient je může v seedu upravit nebo nahradit; po prvním založení je dál spravuje v administraci. Rozsah `own` = jen vlastní a přidělené záznamy. |  |
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

### ACCOUNTANT_ROLE

const · `packages/core/src/seed/default-roles.ts`

Účetní: doklady a podklady pro účetnictví bez zakázkové ekonomiky. Není součástí `DEFAULT_ROLES` (ne každý klient
ji má); klient ji do seedu přidá (`roles: [...DEFAULT_ROLES, ACCOUNTANT_ROLE]`) a výchozí nástěnka „Účetní“ se jí pak založí.

```ts
const ACCOUNTANT_ROLE: RoleDef
```

### DEFAULT_ROLES

const · `packages/core/src/seed/default-roles.ts`

Výchozí role pro stavební a řemeslné firmy (zadání §2). Klient je může v seedu upravit nebo nahradit;
po prvním založení je dál spravuje v administraci. Rozsah `own` = jen vlastní a přidělené záznamy.

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
