# @rebar/finance/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/finance/ui` (soubor `packages/modules/finance/src/ui.tsx`). Exportů: 3, z toho s popisem 3.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`FinanceSettings`](#financesettings) | function | Nastavení → Finance (NAS-09): z čeho se počítá saldo vyrovnání (zaplacené / vystavené) a výchozí rozdělení nových zakázek. Bez zadaného výchozího rozdělení se použije 50 / 50 mezi vlastníkem a partnerem. |  |
| [`SplitEditor`](#spliteditor) | function | Editor pravidel rozdělení s živým náhledem. |  |
| [`ui`](#ui) | const | UI modulu „finance“ složené z oblastí. |  |

### FinanceSettings

function · `packages/modules/finance/src/ui/settings.tsx`

Nastavení → Finance (NAS-09): z čeho se počítá saldo vyrovnání (zaplacené / vystavené) a výchozí rozdělení nových
zakázek. Bez zadaného výchozího rozdělení se použije 50 / 50 mezi vlastníkem a partnerem.

```ts
function FinanceSettings(): import("react").JSX.Element
```

### SplitEditor

function · `packages/modules/finance/src/ui/split-editor.tsx`

Editor pravidel rozdělení s živým náhledem.

```ts
function SplitEditor({ value, onChange, issuerId, allowDefault = false, disabled = false, previewKind, }: Props): import("react").JSX.Element
```

### ui

const · `packages/modules/finance/src/ui.tsx`

UI modulu „finance“ složené z oblastí.

```ts
const ui: ModuleUi
```
