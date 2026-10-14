# @rebar/core/views

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/views` (soubor `packages/core/src/views/index.ts`). Exportů: 8, z toho s popisem 4.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createView`](#createview) | function |  |  |
| [`deleteView`](#deleteview) | function |  |  |
| [`ensureSeedViews`](#ensureseedviews) | function | Založí chybějící výchozí sdílené pohledy. Pohled potřebuje vlastníka, proto se použije nejstarší aktivní uživatel (majitel); bez uživatele se nic neděje a krok se zopakuje při dalším seedu. Pohled stejného názvu, který už existuje (i smazaný správcem), se nezakládá znovu. |  |
| [`listViews`](#listviews) | function | Pohledy entity: vlastní a sdílené, s příznakem oblíbeného. |  |
| [`setFavorite`](#setfavorite) | function | Oblíbený pohled se ukazuje v postranním panelu; je to věc uživatele, ne pohledu. |  |
| [`updateView`](#updateview) | function |  |  |
| [`viewConfigSchema`](#viewconfigschema) | const |  |  |
| [`SeedViewDef`](#seedviewdef) | type | Výchozí sdílený pohled entity, který modul nasadí klientovi (např. „Moje zakázky“). |  |

### createView

function · `packages/core/src/views/views.ts`

_Bez popisu._

```ts
async function createView(ctx: Ctx, def: EntityDef, knownAttrs: ReadonlySet<string>, raw: z.input<typeof viewInput>): Promise<{ name: string; id: string; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; entityType: string; position: number; ownerId: string; shared: boolean; config: schema.SavedV…
```

### deleteView

function · `packages/core/src/views/views.ts`

_Bez popisu._

```ts
async function deleteView(ctx: Ctx, id: string): Promise<void>
```

### ensureSeedViews

function · `packages/core/src/views/seed.ts`

Založí chybějící výchozí sdílené pohledy. Pohled potřebuje vlastníka, proto se použije nejstarší aktivní
uživatel (majitel); bez uživatele se nic neděje a krok se zopakuje při dalším seedu. Pohled stejného názvu,
který už existuje (i smazaný správcem), se nezakládá znovu.

```ts
async function ensureSeedViews(db: Executor, views: readonly SeedViewDef[]): Promise<void>
```

### listViews

function · `packages/core/src/views/views.ts`

Pohledy entity: vlastní a sdílené, s příznakem oblíbeného.

```ts
async function listViews(ctx: Ctx, def: EntityDef): Promise<{ id: string; name: string; shared: boolean; mine: boolean; favorite: boolean; config: schema.SavedViewConfig; }[]>
```

### setFavorite

function · `packages/core/src/views/views.ts`

Oblíbený pohled se ukazuje v postranním panelu; je to věc uživatele, ne pohledu.

```ts
async function setFavorite(ctx: Ctx, id: string, favorite: boolean): Promise<void>
```

### updateView

function · `packages/core/src/views/views.ts`

_Bez popisu._

```ts
async function updateView(ctx: Ctx, id: string, knownAttrs: ReadonlySet<string>, patch: Partial<z.input<typeof viewInput>>): Promise<void>
```

### viewConfigSchema

const · `packages/core/src/views/views.ts`

_Bez popisu._

```ts
const viewConfigSchema: z.ZodObject<{ viewType: z.ZodEnum<{ table: "table"; kanban: "kanban"; }>; filters: z.ZodOptional<z.ZodType<import("../entities").FilterGroup, unknown, z.core.$ZodTypeInternals<import("../entities").FilterGroup, unknown>>>; sort: z.ZodOptio…
```

### SeedViewDef

type · `packages/core/src/views/seed.ts`

Výchozí sdílený pohled entity, který modul nasadí klientovi (např. „Moje zakázky“).

```ts
type SeedViewDef = {
  entityType: string;
  name: string;
  /** Pořadí mezi pohledy entity (menší dřív). */
  position?: number;
  config: SavedViewConfig;
};
```
