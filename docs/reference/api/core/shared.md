# @rebar/core/shared

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/shared` (soubor `packages/core/src/entities/shared.ts`). Exportů: 25, z toho s popisem 13.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`formatDate`](#formatdate) | function | „2026-10-08“ → „8. 10. 2026“. |  |
| [`formatMinor`](#formatminor) | function | Částka v haléřích → „125 000 Kč“ (celé koruny; haléře se ukážou, jen když nějaké jsou). |  |
| [`formatNumberUnit`](#formatnumberunit) | function | Číslo s jednotkou pro zobrazení: „5 %“ (`percent_bp`: 500 → „5 %“, `percent`: 23,5 → „23,5 %“). |  |
| [`inputToNumber`](#inputtonumber) | function | Text z editoru → uložená hodnota (`percent_bp`: „2,5“ → 250); `null`, když to není číslo. |  |
| [`numberToInput`](#numbertoinput) | function | Uložená hodnota čísla → text v editoru (`percent_bp`: 250 → „2,5“). |  |
| [`parseMinor`](#parseminor) | function | Text zadaný uživatelem („125 000“, „1 250,50“) → haléře; `null`, když to není číslo. |  |
| [`roundMinor`](config-data.md#roundminor) | function | Zaokrouhlení na celé haléře: půl od nuly (ADR 003). Jediné místo v kódu, kde se zaokrouhluje. | v `@rebar/core/config-data` |
| [`ATTRIBUTE_TYPES`](entities.md#attribute_types) | const | Typy atributů záznamů. Z typu plyne editor v buňce, dostupné filtry, řazení i validace. | v `@rebar/core/entities` |
| [`OPERATORS`](entities.md#operators) | const |  | v `@rebar/core/entities` |
| [`OPERATORS_BY_TYPE`](entities.md#operators_by_type) | const | Operátory dostupné pro typ atributu (z toho se staví nabídka ve filtru). | v `@rebar/core/entities` |
| [`OPERATOR_LABELS`](#operator_labels) | const |  |  |
| [`VALUELESS_OPERATORS`](#valueless_operators) | const | Operátory bez hodnoty (hodnotu uživatel nezadává). |  |
| [`AttributeDescriptor`](#attributedescriptor) | type | Atribut tak, jak ho vidí prohlížeč (bez sloupců databáze). |  |
| [`AttributeType`](entities.md#attributetype) | type |  | v `@rebar/core/entities` |
| [`Choice`](entities.md#choice) | type |  | v `@rebar/core/entities` |
| [`Condition`](entities.md#condition) | type |  | v `@rebar/core/entities` |
| [`EntityDescriptor`](#entitydescriptor) | type |  |  |
| [`FilterGroup`](entities.md#filtergroup) | type |  | v `@rebar/core/entities` |
| [`GroupSummary`](#groupsummary) | type |  |  |
| [`Labels`](entities.md#labels) | type | Popisky odkazovaných záznamů: `labels[atribut][id]`. | v `@rebar/core/entities` |
| [`Operator`](entities.md#operator) | type |  | v `@rebar/core/entities` |
| [`QueryPage`](#querypage) | type |  |  |
| [`QueryParams`](#queryparams) | type |  |  |
| [`RecordRow`](entities.md#recordrow) | type | Řádek záznamu: `id`, `updatedAt` (ISO) a hodnoty podle klíče atributu. | v `@rebar/core/entities` |
| [`StageDescriptor`](#stagedescriptor) | type |  |  |

### formatDate

function · `packages/core/src/entities/shared.ts`

„2026-10-08“ → „8. 10. 2026“.

```ts
function formatDate(iso: string | null | undefined): string
```

### formatMinor

function · `packages/core/src/entities/shared.ts`

Částka v haléřích → „125 000 Kč“ (celé koruny; haléře se ukážou, jen když nějaké jsou).

```ts
function formatMinor(minor: number | null | undefined, currency = "CZK"): string
```

### formatNumberUnit

function · `packages/core/src/entities/shared.ts`

Číslo s jednotkou pro zobrazení: „5 %“ (`percent_bp`: 500 → „5 %“, `percent`: 23,5 → „23,5 %“).

```ts
function formatNumberUnit(unit: "percent" | "percent_bp" | undefined, value: number): string
```

### inputToNumber

function · `packages/core/src/entities/shared.ts`

Text z editoru → uložená hodnota (`percent_bp`: „2,5“ → 250); `null`, když to není číslo.

```ts
function inputToNumber(unit: "percent" | "percent_bp" | undefined, text: string): number | null
```

### numberToInput

function · `packages/core/src/entities/shared.ts`

Uložená hodnota čísla → text v editoru (`percent_bp`: 250 → „2,5“).

```ts
function numberToInput(unit: "percent" | "percent_bp" | undefined, value: number): string
```

### parseMinor

function · `packages/core/src/entities/shared.ts`

Text zadaný uživatelem („125 000“, „1 250,50“) → haléře; `null`, když to není číslo.

```ts
function parseMinor(text: string): number | null
```

### OPERATOR_LABELS

const · `packages/core/src/entities/operators.ts`

_Bez popisu._

```ts
const OPERATOR_LABELS: Record<Operator, string>
```

### VALUELESS_OPERATORS

const · `packages/core/src/entities/operators.ts`

Operátory bez hodnoty (hodnotu uživatel nezadává).

```ts
const VALUELESS_OPERATORS: readonly Operator[]
```

### AttributeDescriptor

type · `packages/core/src/entities/shared.ts`

Atribut tak, jak ho vidí prohlížeč (bez sloupců databáze).

```ts
type AttributeDescriptor = {
  key: string;
  label: string;
  type: AttributeType;
  custom: boolean;
  readonly: boolean;
  required: boolean;
  sortable: boolean;
  filterable: boolean;
  aggregate: boolean;
  defaultVisible: boolean;
  width: number;
  default?: string | number | boolean;
  /** Jednotka čísla (`percent`, `percent_bp`). */
  unit?: "percent" | "percent_bp";
  choices?: readonly Choice[];
  record?: { entityType: string };
  /** Stavy pipeline pro atribut typu `status`. */
  stages?: StageDescriptor[];
};
```

### EntityDescriptor

type · `packages/core/src/entities/shared.ts`

_Bez popisu._

```ts
type EntityDescriptor = {
  key: string;
  label: { one: string; many: string };
  listPath: string;
  titleKey: string;
  statusKey: string | null;
  attributes: AttributeDescriptor[];
  /** Co smí aktér s entitou dělat (jen pro zobrazení; skutečná kontrola je vždy na serveru). */
  can: { create: boolean; write: boolean; delete: boolean; export?: boolean };
};
```

### GroupSummary

type · `packages/core/src/entities/shared.ts`

_Bez popisu._

```ts
type GroupSummary = {
  value: string | boolean | null;
  count: number;
  sums: Record<string, number>;
};
```

### QueryPage

type · `packages/core/src/entities/shared.ts`

_Bez popisu._

```ts
type QueryPage = {
  rows: RecordRow[];
  total: number;
  totals: Record<string, number>;
  labels: Labels;
};
```

### QueryParams

type · `packages/core/src/entities/shared.ts`

_Bez popisu._

```ts
type QueryParams = {
  filters?: FilterGroup;
  sort?: { attr: string; dir: "asc" | "desc" }[];
  q?: string;
  limit?: number;
  offset?: number;
  group?: string | null;
};
```

### StageDescriptor

type · `packages/core/src/entities/shared.ts`

_Bez popisu._

```ts
type StageDescriptor = {
  id: string;
  name: string;
  color: string;
  kind: "open" | "won" | "lost" | "done";
  /** Fáze životního cyklu, do které stav patří (zakázky); jinak `null`. */
  phase?: string | null;
  /** Pravděpodobnost výhry ve stavu (0–100 %) a dny do hnití (CRM); `null` = nezadáno. */
  probabilityPct?: number | null;
  rottingDays?: number | null;
};
```
