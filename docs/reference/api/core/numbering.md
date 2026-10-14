# @rebar/core/numbering

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/numbering` (soubor `packages/core/src/numbering/index.ts`). Exportů: 12, z toho s popisem 9.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`defineSeries`](#defineseries) | function | Modul deklaruje své číselné řady (faktury, zakázky, doklady skladu…). |  |
| [`ensureSeries`](#ensureseries) | function | Založí chybějící řady z deklarací modulů (existující se nemění). |  |
| [`formatNumber`](#formatnumber) | function | Vzor čísla: `{YYYY}` `{YY}` `{MM}` a `{NNN…}` (počet N = počet číslic). |  |
| [`listSeries`](#listseries) | function | Všechny řady v databázi s ukázkou dalšího čísla. |  |
| [`listSeriesDefs`](#listseriesdefs) | function |  |  |
| [`nextNumber`](#nextnumber) | function | Přidělí další číslo řady. Jeden `UPDATE` zamkne řádek řady, takže souběžné doklady nikdy nedostanou stejné číslo. Volejte ve stejné transakci, která doklad ukládá — když se vrátí, vrátí se i číslo (žádné díry). Zpětné číslování do dřívějšího roku, než kde řada už je, se odmítne. |  |
| [`patternWarning`](#patternwarning) | function | Upozornění (ne chyba) na vzor, který je platný, ale nevhodný. Roční řada bez roku ve vzoru po Novém roce znovu přidělí stejná čísla (FV-0001 podruhé). |  |
| [`previewNext`](#previewnext) | function | Číslo, které by dostal další doklad k danému datu; nic nepřiděluje ani nezamyká. |  |
| [`updateSeriesPattern`](#updateseriespattern) | function | Změna vzoru řady v administraci. |  |
| [`validatePattern`](#validatepattern) | function |  |  |
| [`SeriesDef`](#seriesdef) | type |  |  |
| [`SeriesRow`](#seriesrow) | type | Řada s ukázkou čísla, které dostane další doklad (bez přidělení). |  |

### defineSeries

function · `packages/core/src/numbering/numbering.ts`

Modul deklaruje své číselné řady (faktury, zakázky, doklady skladu…).

```ts
function defineSeries(def: SeriesDef): SeriesDef
```

### ensureSeries

function · `packages/core/src/numbering/numbering.ts`

Založí chybějící řady z deklarací modulů (existující se nemění).

```ts
async function ensureSeries(db: Executor, defs: readonly SeriesDef[] = listSeriesDefs()): Promise<void>
```

### formatNumber

function · `packages/core/src/numbering/pattern.ts`

Vzor čísla: `{YYYY}` `{YY}` `{MM}` a `{NNN…}` (počet N = počet číslic).

```ts
function formatNumber(pattern: string, seq: number, date: Date): string
```

### listSeries

function · `packages/core/src/numbering/numbering.ts`

Všechny řady v databázi s ukázkou dalšího čísla.

```ts
async function listSeries(db: Executor, date = new Date()): Promise<SeriesRow[]>
```

### listSeriesDefs

function · `packages/core/src/numbering/numbering.ts`

_Bez popisu._

```ts
function listSeriesDefs(): SeriesDef[]
```

### nextNumber

function · `packages/core/src/numbering/numbering.ts`

Přidělí další číslo řady. Jeden `UPDATE` zamkne řádek řady, takže souběžné doklady nikdy nedostanou
stejné číslo. Volejte ve stejné transakci, která doklad ukládá — když se vrátí, vrátí se i číslo
(žádné díry). Zpětné číslování do dřívějšího roku, než kde řada už je, se odmítne.

`isTaken` chrání před kolizí s čísly, která vznikla mimo řadu (import, ruční zápis do databáze, obnova ze zálohy):
obsazené číslo se přeskočí a řada se posune dál, takže založení nikdy nespadne na duplicitě.

```ts
async function nextNumber(db: Executor, key: string, date = new Date(), opts: { isTaken?: (number: string) => Promise<boolean> } = {}): Promise<string>
```

### patternWarning

function · `packages/core/src/numbering/pattern.ts`

Upozornění (ne chyba) na vzor, který je platný, ale nevhodný. Roční řada bez roku ve vzoru po Novém roce
znovu přidělí stejná čísla (FV-0001 podruhé).

```ts
function patternWarning(pattern: string, reset: "yearly" | "never"): string | null
```

### previewNext

function · `packages/core/src/numbering/numbering.ts`

Číslo, které by dostal další doklad k danému datu; nic nepřiděluje ani nezamyká.

```ts
function previewNext(row: { pattern: string; reset: "yearly" | "never"; period: string; lastValue: number }, date = new Date()): string
```

### updateSeriesPattern

function · `packages/core/src/numbering/numbering.ts`

Změna vzoru řady v administraci.

```ts
async function updateSeriesPattern(ctx: Ctx, key: string, pattern: string): Promise<void>
```

### validatePattern

function · `packages/core/src/numbering/pattern.ts`

_Bez popisu._

```ts
function validatePattern(pattern: string): string | null
```

### SeriesDef

type · `packages/core/src/numbering/numbering.ts`

_Bez popisu._

```ts
type SeriesDef = { key: string; pattern: string; reset?: "yearly" | "never" };
```

### SeriesRow

type · `packages/core/src/numbering/numbering.ts`

Řada s ukázkou čísla, které dostane další doklad (bez přidělení).

```ts
type SeriesRow = {
  key: string;
  pattern: string;
  reset: "yearly" | "never";
  period: string;
  lastValue: number;
  /** Poslední přidělené číslo, nebo `null`, když řada ještě nebyla použitá v tomto období. */
  next: string;
};
```
