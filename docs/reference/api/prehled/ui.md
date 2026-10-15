# @rebar/prehled/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/prehled/ui` (soubor `packages/modules/prehled/src/ui.tsx`). Exportů: 1, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ui`](#ui) | const | UI modulu „prehled“. Skutečnou stránku `/prehled` vykresluje statická trasa aplikace (`apps/web/src/app/(app)/prehled`), protože potřebuje server actions nástěnek, které modul nezná; trasa předběhne obecný host stránek modulu, takže tato zástupná stránka se nikdy neukáže (test `tests/modules.test.ts` ji vyžaduje ke každé stránce z manifestu). |  |

### ui

const · `packages/modules/prehled/src/ui.tsx`

UI modulu „prehled“. Skutečnou stránku `/prehled` vykresluje statická trasa aplikace
(`apps/web/src/app/(app)/prehled`), protože potřebuje server actions nástěnek, které modul nezná; trasa předběhne
obecný host stránek modulu, takže tato zástupná stránka se nikdy neukáže (test `tests/modules.test.ts` ji vyžaduje
ke každé stránce z manifestu).

```ts
const ui: { readonly pages: readonly [{ readonly path: "/prehled"; readonly render: () => import("react").JSX.Element; }]; }
```
