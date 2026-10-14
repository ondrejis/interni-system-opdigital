# @rebar/sklad/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/sklad/ui` (soubor `packages/modules/sklad/src/ui.tsx`). Exportů: 3, z toho s popisem 0.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`DocForm`](#docform) | function |  |  |
| [`ORDER_STATUSES`](server.md#order_statuses) | const |  | v `@rebar/sklad/server` |
| [`ui`](#ui) | const |  |  |

### DocForm

function · `packages/modules/sklad/src/ui.tsx`

_Bez popisu._

```ts
function DocForm({ type, jobId: fixedJob, onDone, }: { type: Exclude<StockDocType, "adjustment">; jobId?: string | null; onDone: () => void; }): import("react").JSX.Element
```

### ui

const · `packages/modules/sklad/src/ui.tsx`

_Bez popisu._

```ts
const ui: { readonly terminalWidgets: { readonly "sklad.issue": { readonly Widget: ({ label, variant, pageHref }: import("@rebar/ui").TerminalWidgetProps) => import("react").JSX.Element; }; }; readonly recordTabs: { readonly stock_item: readonly [Re…
```
