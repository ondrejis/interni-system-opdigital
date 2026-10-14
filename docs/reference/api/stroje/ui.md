# @rebar/stroje/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/stroje/ui` (soubor `packages/modules/stroje/src/ui.tsx`). Exportů: 5, z toho s popisem 0.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`DefectForm`](#defectform) | function |  |  |
| [`FuelForm`](#fuelform) | function |  |  |
| [`LogForm`](#logform) | function |  |  |
| [`ReservationForm`](#reservationform) | function |  |  |
| [`ui`](#ui) | const |  |  |

### DefectForm

function · `packages/modules/stroje/src/ui.tsx`

_Bez popisu._

```ts
function DefectForm({ assetId: fixed, onDone, }: { assetId?: string | undefined; onDone: () => void; }): import("react").JSX.Element
```

### FuelForm

function · `packages/modules/stroje/src/ui.tsx`

_Bez popisu._

```ts
function FuelForm({ assetId: fixed, onDone, }: { assetId?: string | undefined; onDone: () => void; }): import("react").JSX.Element
```

### LogForm

function · `packages/modules/stroje/src/ui.tsx`

_Bez popisu._

```ts
function LogForm({ assetId: fixed, onDone, }: { assetId?: string | undefined; onDone: () => void; }): import("react").JSX.Element
```

### ReservationForm

function · `packages/modules/stroje/src/ui.tsx`

_Bez popisu._

```ts
function ReservationForm({ assetId: fixed, from, onDone, }: { assetId?: string | undefined; from?: string | undefined; onDone: () => void; }): import("react").JSX.Element
```

### ui

const · `packages/modules/stroje/src/ui.tsx`

_Bez popisu._

```ts
const ui: { readonly terminalWidgets: { readonly "stroje.fleet": { readonly Widget: ({ label, variant, pageHref }: import("@rebar/ui").TerminalWidgetProps) => import("react").JSX.Element; }; }; readonly recordTabs: { readonly asset: readonly [Record…
```
