# @rebar/core/config-data

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/config-data` (soubor `packages/core/src/config-data/index.ts`). Exportů: 35, z toho s popisem 25.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`addLookupItem`](#addlookupitem) | function | Přidá položku. `value` je stabilní klíč (nejde měnit), `label` jde přejmenovat. |  |
| [`addStage`](#addstage) | function |  |  |
| [`defaultVatRateBp`](#defaultvatratebp) | function | Výchozí sazba k datu: nastavená v administraci (je-li k datu platná), jinak nejvyšší platná, jinak 21 %. |  |
| [`deleteStage`](#deletestage) | function | Smaže (měkce) nepoužívaný stav; používaný se odmítne a doporučí se přesunout záznamy jinam. |  |
| [`deleteVatRate`](#deletevatrate) | function | Smaže (měkce) sazbu. Doklady mají sazbu uloženou u sebe, takže se jich to netýká. Výchozí sazbu smazat nejde. |  |
| [`ensureLookup`](#ensurelookup) | function | Založí číselník z výchozí definice, pokud neexistuje (seed klienta). |  |
| [`ensurePipeline`](#ensurepipeline) | function | Založí pipeline z výchozí definice, pokud ještě neexistuje (seed klienta). Existující nemění. |  |
| [`getLookup`](#getlookup) | function | Položky číselníku v pořadí; ve výchozím stavu jen aktivní. |  |
| [`getPipeline`](#getpipeline) | function | Pipeline se stavy v pořadí. |  |
| [`getPipelinePhases`](#getpipelinephases) | function |  |  |
| [`listAllVatRates`](#listallvatrates) | function | Všechny sazby včetně vypršelých a budoucích (správa v administraci); nejnovější platnost první. |  |
| [`listLookups`](#listlookups) | function | Všechny číselníky s položkami včetně neaktivních (pro správu v administraci). |  |
| [`listPipelines`](#listpipelines) | function | Všechny pipeline se stavy a počtem použití každého stavu (pro správu v administraci). |  |
| [`listVatRates`](#listvatrates) | function | Platné sazby DPH k datu (nejnovější platnost první). `rateBp`: 21 % = 2100. |  |
| [`registerStageUsage`](#registerstageusage) | function |  |  |
| [`registerStageUsageFromEntities`](#registerstageusagefromentities) | function | Zaregistruje počítání použití stavů z popisů entit: každý atribut typu `status` s pipeline se spočítá jako počet nesmazaných záznamů s tímto stavem. Moduly tak nemusí registrovat nic ručně. |  |
| [`reorderLookupItems`](#reorderlookupitems) | function | Přeuspořádá položky číselníku; `orderedIds` musí obsahovat všechny položky (i neaktivní) právě jednou. |  |
| [`reorderStages`](#reorderstages) | function | Přeuspořádá stavy; `orderedIds` musí obsahovat všechny stavy pipeline právě jednou. |  |
| [`restoreStage`](#restorestage) | function | Vrátí smazaný stav na konec pipeline (zpět po omylu). |  |
| [`restoreVatRate`](#restorevatrate) | function | Vrátí smazanou sazbu (zpět po omylu). |  |
| [`roundMinor`](#roundminor) | function | Zaokrouhlení na celé haléře: půl od nuly (ADR 003). Jediné místo v kódu, kde se zaokrouhluje. |  |
| [`saveVatRate`](#savevatrate) | function |  |  |
| [`setDefaultVatCode`](#setdefaultvatcode) | function | Nastaví výchozí sazbu nových řádků dokladů. |  |
| [`setPipelinePhases`](#setpipelinephases) | function |  |  |
| [`stageUsageCount`](#stageusagecount) | function | Počet záznamů, které stav používají (0, když pro typ není nic zaregistrováno). |  |
| [`updateLookupItem`](#updatelookupitem) | function | Přejmenuje nebo (de)aktivuje položku. Mazání se nedělá — záznamy se na hodnotu odkazují. |  |
| [`updateStage`](#updatestage) | function |  |  |
| [`vatAmountMinor`](#vatamountminor) | function | Výše DPH z částky bez DPH v haléřích; zaokrouhluje na haléře (půl od nuly, i u záporných částek — dobropisy). |  |
| [`vatChoices`](#vatchoices) | function | Sazby platné k datu pro výběr v dokladech spolu s výchozí. |  |
| [`getDefaultVatCode`](#getdefaultvatcode) | const | Kód výchozí sazby (nastavené v administraci), nebo `null` = nejvyšší platná sazba. |  |
| [`LookupDef`](#lookupdef) | type |  |  |
| [`PipelineDef`](#pipelinedef) | type |  |  |
| [`PipelinePhase`](#pipelinephase) | type | Pevné fáze, do kterých musí patřit stavy pipeline (zakázky: `inquiry`…`paused`). Modul je zaregistruje při sestavení; správa stavů pak nedovolí, aby nějaká fáze zůstala bez stavu nebo aby stav dostal neznámou fázi. |  |
| [`StageDef`](#stagedef) | type |  |  |
| [`StageKind`](#stagekind) | type |  |  |

### addLookupItem

function · `packages/core/src/config-data/lookups.ts`

Přidá položku. `value` je stabilní klíč (nejde měnit), `label` jde přejmenovat.

```ts
async function addLookupItem(ctx: Ctx, key: string, item: { value: string; label: string; color?: string }): Promise<{ value: string; id: string; label: string; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; deletedBy: string | null; deletedBatch: string | null; active: boolean; color…
```

### addStage

function · `packages/core/src/config-data/pipelines.ts`

_Bez popisu._

```ts
async function addStage(ctx: Ctx, pipelineId: string, def: StageDef): Promise<{ name: string; id: string; kind: "open" | "won" | "lost" | "done"; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; deletedBy: string | null; deletedBatch: string | null…
```

### defaultVatRateBp

function · `packages/core/src/config-data/vat.ts`

Výchozí sazba k datu: nastavená v administraci (je-li k datu platná), jinak nejvyšší platná, jinak 21 %.

```ts
async function defaultVatRateBp(db: Executor, at: string): Promise<number>
```

### deleteStage

function · `packages/core/src/config-data/pipelines.ts`

Smaže (měkce) nepoužívaný stav; používaný se odmítne a doporučí se přesunout záznamy jinam.

```ts
async function deleteStage(ctx: Ctx, stageId: string): Promise<void>
```

### deleteVatRate

function · `packages/core/src/config-data/vat.ts`

Smaže (měkce) sazbu. Doklady mají sazbu uloženou u sebe, takže se jich to netýká. Výchozí sazbu smazat nejde.

```ts
async function deleteVatRate(ctx: Ctx, id: string): Promise<void>
```

### ensureLookup

function · `packages/core/src/config-data/lookups.ts`

Založí číselník z výchozí definice, pokud neexistuje (seed klienta).

```ts
async function ensureLookup(executor: Executor, def: LookupDef): Promise<string>
```

### ensurePipeline

function · `packages/core/src/config-data/pipelines.ts`

Založí pipeline z výchozí definice, pokud ještě neexistuje (seed klienta). Existující nemění.

```ts
async function ensurePipeline(executor: Executor, def: PipelineDef): Promise<string>
```

### getLookup

function · `packages/core/src/config-data/lookups.ts`

Položky číselníku v pořadí; ve výchozím stavu jen aktivní.

```ts
async function getLookup(db: Executor, key: string, opts: { includeInactive?: boolean } = {}): Promise<{ id: string; value: string; label: string; color: string | null; active: boolean; position: number; scopes: string[]; }[]>
```

### getPipeline

function · `packages/core/src/config-data/pipelines.ts`

Pipeline se stavy v pořadí.

```ts
async function getPipeline(db: Executor, entityType: string, key: string): Promise<{ stages: { createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; deletedBy: string | null; deletedBatch: string | null; id: string; pipelineId: string; name: string; color: s…
```

### getPipelinePhases

function · `packages/core/src/config-data/pipelines.ts`

_Bez popisu._

```ts
function getPipelinePhases(entityType: string): readonly PipelinePhase[]
```

### listAllVatRates

function · `packages/core/src/config-data/vat.ts`

Všechny sazby včetně vypršelých a budoucích (správa v administraci); nejnovější platnost první.

```ts
async function listAllVatRates(db: Executor): Promise<{ createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; deletedBy: string | null; deletedBatch: string | null; id: string; code: string; label: string; rateBp: number; validFr…
```

### listLookups

function · `packages/core/src/config-data/lookups.ts`

Všechny číselníky s položkami včetně neaktivních (pro správu v administraci).

```ts
async function listLookups(db: Executor): Promise<{ id: string; key: string; name: string; items: { id: string; value: string; label: string; color: string | null; active: boolean; position: number; scopes: string[]; }[]; }[]>
```

### listPipelines

function · `packages/core/src/config-data/pipelines.ts`

Všechny pipeline se stavy a počtem použití každého stavu (pro správu v administraci).

```ts
async function listPipelines(db: Executor): Promise<{ stages: { usage: number; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; deletedBy: string | null; deletedBatch: string | null; id: string; pipelineId: string; name: s…
```

### listVatRates

function · `packages/core/src/config-data/vat.ts`

Platné sazby DPH k datu (nejnovější platnost první). `rateBp`: 21 % = 2100.

```ts
async function listVatRates(db: Executor, at: string): Promise<{ createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; deletedBy: string | null; deletedBatch: string | null; id: string; code: string; label: string; rateBp: number; validFr…
```

### registerStageUsage

function · `packages/core/src/config-data/pipelines.ts`

_Bez popisu._

```ts
function registerStageUsage(entityType: string, check: UsageCheck): void
```

### registerStageUsageFromEntities

function · `packages/core/src/config-data/pipelines.ts`

Zaregistruje počítání použití stavů z popisů entit: každý atribut typu `status` s pipeline se spočítá
jako počet nesmazaných záznamů s tímto stavem. Moduly tak nemusí registrovat nic ručně.

```ts
function registerStageUsageFromEntities(defs: readonly { table: unknown; attributes: readonly { type: string; field?: string; pipeline?: { entityType: string; key: string }; }[]; }[]): void
```

### reorderLookupItems

function · `packages/core/src/config-data/lookups.ts`

Přeuspořádá položky číselníku; `orderedIds` musí obsahovat všechny položky (i neaktivní) právě jednou.

```ts
async function reorderLookupItems(ctx: Ctx, key: string, orderedIds: readonly string[]): Promise<void>
```

### reorderStages

function · `packages/core/src/config-data/pipelines.ts`

Přeuspořádá stavy; `orderedIds` musí obsahovat všechny stavy pipeline právě jednou.

```ts
async function reorderStages(ctx: Ctx, pipelineId: string, orderedIds: readonly string[]): Promise<void>
```

### restoreStage

function · `packages/core/src/config-data/pipelines.ts`

Vrátí smazaný stav na konec pipeline (zpět po omylu).

```ts
async function restoreStage(ctx: Ctx, stageId: string): Promise<void>
```

### restoreVatRate

function · `packages/core/src/config-data/vat.ts`

Vrátí smazanou sazbu (zpět po omylu).

```ts
async function restoreVatRate(ctx: Ctx, id: string): Promise<void>
```

### roundMinor

function · `packages/core/src/entities/shared.ts`

Zaokrouhlení na celé haléře: půl od nuly (ADR 003). Jediné místo v kódu, kde se zaokrouhluje.

```ts
function roundMinor(value: number): number
```

### saveVatRate

function · `packages/core/src/config-data/vat.ts`

_Bez popisu._

```ts
async function saveVatRate(ctx: Ctx, raw: z.input<typeof vatInput>): Promise<{ id: string; label: string; createdAt: Date; updatedAt: Date; createdBy: string | null; updatedBy: string | null; deletedAt: Date | null; deletedBy: string | null; deletedBatch: string | null; code: string; rateBp: number; validFr…
```

### setDefaultVatCode

function · `packages/core/src/config-data/vat.ts`

Nastaví výchozí sazbu nových řádků dokladů.

```ts
async function setDefaultVatCode(ctx: Ctx, code: string): Promise<void>
```

### setPipelinePhases

function · `packages/core/src/config-data/pipelines.ts`

_Bez popisu._

```ts
function setPipelinePhases(entityType: string, phases: readonly PipelinePhase[]): void
```

### stageUsageCount

function · `packages/core/src/config-data/pipelines.ts`

Počet záznamů, které stav používají (0, když pro typ není nic zaregistrováno).

```ts
async function stageUsageCount(db: Executor, entityType: string, stageId: string): Promise<number>
```

### updateLookupItem

function · `packages/core/src/config-data/lookups.ts`

Přejmenuje nebo (de)aktivuje položku. Mazání se nedělá — záznamy se na hodnotu odkazují.

```ts
async function updateLookupItem(ctx: Ctx, itemId: string, patch: { label?: string; color?: string | null; active?: boolean }): Promise<void>
```

### updateStage

function · `packages/core/src/config-data/pipelines.ts`

_Bez popisu._

```ts
async function updateStage(ctx: Ctx, stageId: string, patch: Partial<StageDef>): Promise<void>
```

### vatAmountMinor

function · `packages/core/src/config-data/vat.ts`

Výše DPH z částky bez DPH v haléřích; zaokrouhluje na haléře (půl od nuly, i u záporných částek — dobropisy).

```ts
function vatAmountMinor(netMinor: number, rateBp: number): number
```

### vatChoices

function · `packages/core/src/config-data/vat.ts`

Sazby platné k datu pro výběr v dokladech spolu s výchozí.

```ts
async function vatChoices(db: Executor, at: string): Promise<{ rates: { code: string; label: string; rateBp: number; }[]; defaultBp: number; }>
```

### getDefaultVatCode

const · `packages/core/src/config-data/vat.ts`

Kód výchozí sazby (nastavené v administraci), nebo `null` = nejvyšší platná sazba.

```ts
const getDefaultVatCode: (db: Executor) => Promise<string | null>
```

### LookupDef

type · `packages/core/src/config-data/lookups.ts`

_Bez popisu._

```ts
type LookupDef = {
  key: string;
  name: string;
  items: readonly { value: string; label: string; color?: string }[];
};
```

### PipelineDef

type · `packages/core/src/config-data/pipelines.ts`

_Bez popisu._

```ts
type PipelineDef = {
  entityType: string;
  key: string;
  name: string;
  stages: readonly StageDef[];
};
```

### PipelinePhase

type · `packages/core/src/config-data/pipelines.ts`

Pevné fáze, do kterých musí patřit stavy pipeline (zakázky: `inquiry`…`paused`). Modul je zaregistruje při
sestavení; správa stavů pak nedovolí, aby nějaká fáze zůstala bez stavu nebo aby stav dostal neznámou fázi.

```ts
type PipelinePhase = { key: string; label: string };
```

### StageDef

type · `packages/core/src/config-data/pipelines.ts`

_Bez popisu._

```ts
type StageDef = {
  name: string;
  color?: string;
  kind?: StageKind;
  /** Fáze životního cyklu (zakázky); `null` = stav bez fáze. */
  phase?: string | null;
  /** Pravděpodobnost výhry ve stavu v procentech (0–100), `null` = nezadáno (CRM váží hodnotu zakázky). */
  probabilityPct?: number | null;
  /** Počet dnů bez aktivity, po kterých záznam ve stavu „hnije“; `null` = nehlídá se. */
  rottingDays?: number | null;
};
```

### StageKind

type · `packages/core/src/config-data/pipelines.ts`

_Bez popisu._

```ts
type StageKind = "open" | "won" | "lost" | "done";
```
