# @rebar/core/tags

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/tags` (soubor `packages/core/src/tags/index.ts`). Exportů: 7, z toho s popisem 7.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createTag`](#createtag) | function | Založí štítek (stabilní klíč se vyrobí z názvu a už se nemění). Vyžaduje `settings.tags`. |  |
| [`deleteTag`](#deletetag) | function | Smaže nepoužitý štítek; použitý jen archivuje (záznamy o hodnotu nepřijdou). |  |
| [`listTags`](#listtags) | function | Všechny štítky (i archivované) a kolik záznamů každý používá. |  |
| [`taggableEntities`](#taggableentities) | function | Entity, které mají atribut štítků (`lookup: "tag"`), s polem, kam se hodnoty ukládají. |  |
| [`updateTag`](#updatetag) | function | Změní název, barvu, rozsah nebo archivaci štítku (záznamy se štítkem se nemění). Vyžaduje `settings.tags`. |  |
| [`TAG_LIST`](#tag_list) | const | Klíč společného číselníku štítků (jeden pro všechny entity; rozsah řeší `lookup_item.scopes`). |  |
| [`TagInfo`](#taginfo) | type | Štítek s rozsahem, barvou a využitím. |  |

### createTag

function · `packages/core/src/tags/tags.ts`

Založí štítek (stabilní klíč se vyrobí z názvu a už se nemění). Vyžaduje `settings.tags`.

```ts
async function createTag(ctx: Ctx, raw: z.input<typeof tagInput>): Promise<{ value: string; id: string; label: string; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; deletedBy: string | null; deletedBatch: string | null; active: boolean; color…
```

### deleteTag

function · `packages/core/src/tags/tags.ts`

Smaže nepoužitý štítek; použitý jen archivuje (záznamy o hodnotu nepřijdou).

```ts
async function deleteTag(ctx: Ctx, registry: EntityRegistry, id: string): Promise<{ archived: boolean }>
```

### listTags

function · `packages/core/src/tags/tags.ts`

Všechny štítky (i archivované) a kolik záznamů každý používá.

```ts
async function listTags(ctx: Ctx, registry: EntityRegistry): Promise<{ tags: TagInfo[]; entities: { key: string; label: string }[] }>
```

### taggableEntities

function · `packages/core/src/tags/tags.ts`

Entity, které mají atribut štítků (`lookup: "tag"`), s polem, kam se hodnoty ukládají.

```ts
function taggableEntities(registry: EntityRegistry): { key: string; label: string; def: import("../entities").EntityDef; field: string; }[]
```

### updateTag

function · `packages/core/src/tags/tags.ts`

Změní název, barvu, rozsah nebo archivaci štítku (záznamy se štítkem se nemění). Vyžaduje `settings.tags`.

```ts
async function updateTag(ctx: Ctx, id: string, patch: { label?: string; color?: string | null; scopes?: string[]; active?: boolean }): Promise<void>
```

### TAG_LIST

const · `packages/core/src/tags/tags.ts`

Klíč společného číselníku štítků (jeden pro všechny entity; rozsah řeší `lookup_item.scopes`).

```ts
const TAG_LIST: "tag"
```

### TagInfo

type · `packages/core/src/tags/tags.ts`

Štítek s rozsahem, barvou a využitím.

```ts
type TagInfo = {
  id: string;
  value: string;
  label: string;
  color: string | null;
  /** Klíče entit, pro které štítek platí; prázdné = všude. */
  scopes: string[];
  active: boolean;
  /** Kolik záznamů štítek používá (podle entit). */
  usage: Record<string, number>;
};
```
