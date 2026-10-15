# @rebar/prehled/presets

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/prehled/presets` (soubor `packages/modules/prehled/src/presets.ts`). Exportů: 3, z toho s popisem 2.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`INCOME`](#income) | const | Příjmy tento měsíc podle R-41: můj podíl zaplaceno / vystaveno / plánováno. |  |
| [`UNPAID`](#unpaid) | const | Nezaplacené platby: dlaždice financí (po splatnosti) a součet plateb blízko splatnosti. |  |
| [`WIDGET_PRESETS`](#widget_presets) | const |  |  |

### INCOME

const · `packages/modules/prehled/src/presets.ts`

Příjmy tento měsíc podle R-41: můj podíl zaplaceno / vystaveno / plánováno.

```ts
const INCOME: Omit<DashboardWidget, "id">[]
```

### UNPAID

const · `packages/modules/prehled/src/presets.ts`

Nezaplacené platby: dlaždice financí (po splatnosti) a součet plateb blízko splatnosti.

```ts
const UNPAID: Omit<DashboardWidget, "id">[]
```

### WIDGET_PRESETS

const · `packages/modules/prehled/src/presets.ts`

_Bez popisu._

```ts
const WIDGET_PRESETS: readonly WidgetPresetDef[]
```
