# @rebar/core/pdf

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/pdf` (soubor `packages/core/src/pdf/index.ts`). Exportů: 1, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`renderPdf`](#renderpdf) | function | Vykreslí definici dokumentu do PDF (A4, Roboto 9,5 pt, pokud definice neřekne jinak). |  |

Re-exporty z externích knihoven: `Content` (`.pnpm`), `TDocumentDefinitions` (`.pnpm`), `TableCell` (`.pnpm`).

### renderPdf

function · `packages/core/src/pdf/render.ts`

Vykreslí definici dokumentu do PDF (A4, Roboto 9,5 pt, pokud definice neřekne jinak).

```ts
async function renderPdf(def: TDocumentDefinitions): Promise<Buffer>
```
