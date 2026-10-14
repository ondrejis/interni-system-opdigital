# @rebar/klienti/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/klienti/ui` (soubor `packages/modules/klienti/src/ui.tsx`). Exportů: 1, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ui`](#ui) | const | UI modulu „klienti“. Zástupné stránky nahradí skutečné UI. |  |

### ui

const · `packages/modules/klienti/src/ui.tsx`

UI modulu „klienti“. Zástupné stránky nahradí skutečné UI.

```ts
const ui: { readonly pages: readonly [{ readonly path: "/klienti"; readonly render: () => import("react").JSX.Element; }]; }
```
