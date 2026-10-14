# @rebar/dochazka/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/dochazka/ui` (soubor `packages/modules/dochazka/src/ui.tsx`). Exportů: 2, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ClockCard`](#clockcard) | function | Píchačka: velká tlačítka pro příchod, přestávku a odchod; čas běží i při zavřené stránce (počítá se z času příchodu). |  |
| [`ui`](#ui) | const |  |  |

### ClockCard

function · `packages/modules/dochazka/src/ui.tsx`

Píchačka: velká tlačítka pro příchod, přestávku a odchod; čas běží i při zavřené stránce (počítá se z času příchodu).

```ts
function ClockCard({ compact }: { compact?: boolean }): import("react").JSX.Element
```

### ui

const · `packages/modules/dochazka/src/ui.tsx`

_Bez popisu._

```ts
const ui: { readonly terminalWidgets: { readonly "dochazka.clock": { readonly Widget: ({ label, settings, variant, pageHref }: import("@rebar/ui").TerminalWidgetProps) => import("react").JSX.Element; }; }; readonly pages: readonly [{ readonly path: …
```
