# @rebar/kontakty/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kontakty/ui` (soubor `packages/modules/kontakty/src/ui.tsx`). Exportů: 1, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ui`](#ui) | const | Firma ukáže své kontaktní osoby (stejný seznam jako jinde, nová osoba se rovnou přiřadí k firmě). |  |

### ui

const · `packages/modules/kontakty/src/ui.tsx`

Firma ukáže své kontaktní osoby (stejný seznam jako jinde, nová osoba se rovnou přiřadí k firmě).

```ts
const ui: { readonly recordTabs: { readonly company: readonly [{ readonly id: "osoby"; readonly label: "Osoby"; readonly permission: "kontakty.read"; readonly render: ({ id }: { id: string; }) => import("react").JSX.Element; }]; }; readonly recordAc…
```
