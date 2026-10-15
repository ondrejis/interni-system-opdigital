# @rebar/hodiny/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/hodiny/api` (soubor `packages/modules/hodiny/src/api.ts`). Exportů: 11, z toho s popisem 11.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`computeJobEffort`](#computejobeffort) | function | Spočítá, kolik zakázka stála času a jaká z ní vyšla hodinovka. Lidé z hodin a z příjmů se spojí (kdo má jen příjem, má sazbu `null`, kdo má jen hodiny, příjem 0). Pořadí: nejvíc hodin první, při shodě podle id. |  |
| [`formatDuration`](#formatduration) | function | Čas v minutách jako text: `90` → `1:30` (nebo `1,5`); nula a záporné hodnoty jako `0:00`. |  |
| [`hourlyRate`](#hourlyrate) | function | Efektivní hodinová sazba v haléřích; `null`, když nejsou žádné odpracované minuty. |  |
| [`parseCellDuration`](#parsecellduration) | function | Čas z buňky týdenní mřížky: prázdný text nebo nula znamená „bez času“ (buňka se vymaže), jinak jako `parseDuration`. |  |
| [`parseDuration`](#parseduration) | function | Rozebere zadaný čas na minuty. Prázdný text je chyba (u buňky mřížky ho řeší `parseCellDuration`). |  |
| [`MAX_DAY_MINUTES`](#max_day_minutes) | const | Nejvíc minut jednoho záznamu i jednoho dne jednoho člověka (24 hodin). |  |
| [`DurationFormat`](#durationformat) | type | Způsob zobrazení času: `hm` = `1:30`, `decimal` = `1,5` (hodiny na dvě desetinná místa bez zbytečných nul). |  |
| [`JobEffort`](#jobeffort) | type | Výsledek výpočtu. |  |
| [`JobEffortInput`](#jobeffortinput) | type | Vstup výpočtu. |  |
| [`ParsedDuration`](#parsedduration) | type | Výsledek rozboru zadaného času: minuty, nebo česká chyba. |  |
| [`UserEffort`](#usereffort) | type | Člověk v přehledu zakázky. |  |

### computeJobEffort

function · `packages/modules/hodiny/src/logic/effort.ts`

Spočítá, kolik zakázka stála času a jaká z ní vyšla hodinovka. Lidé z hodin a z příjmů se spojí (kdo má jen příjem,
má sazbu `null`, kdo má jen hodiny, příjem 0). Pořadí: nejvíc hodin první, při shodě podle id.

```ts
function computeJobEffort(input: JobEffortInput): JobEffort
```

### formatDuration

function · `packages/modules/hodiny/src/logic/parse-time.ts`

Čas v minutách jako text: `90` → `1:30` (nebo `1,5`); nula a záporné hodnoty jako `0:00`.

```ts
function formatDuration(minutes: number, format: DurationFormat = "hm"): string
```

### hourlyRate

function · `packages/modules/hodiny/src/logic/effort.ts`

Efektivní hodinová sazba v haléřích; `null`, když nejsou žádné odpracované minuty.

```ts
function hourlyRate(incomeMinor: number, minutes: number): number | null
```

### parseCellDuration

function · `packages/modules/hodiny/src/logic/parse-time.ts`

Čas z buňky týdenní mřížky: prázdný text nebo nula znamená „bez času“ (buňka se vymaže), jinak jako `parseDuration`.

```ts
function parseCellDuration(input: string): ParsedDuration
```

### parseDuration

function · `packages/modules/hodiny/src/logic/parse-time.ts`

Rozebere zadaný čas na minuty. Prázdný text je chyba (u buňky mřížky ho řeší `parseCellDuration`).

- `1,5`, `1.5`, `2` = hodiny (číslo bez jednotky jsou vždy hodiny),
- `1:30`, `0:45` = hodiny a minuty,
- `90m`, `45 min` = minuty, `2h`, `1,5 hod` = hodiny, `1h30`, `1 h 30 min` = hodiny a minuty.

Desetinné hodiny se zaokrouhlí na celé minuty. Nula je platná (minuty 0); nejvýš 24 hodin.

```ts
function parseDuration(input: string): ParsedDuration
```

### MAX_DAY_MINUTES

const · `packages/modules/hodiny/src/logic/parse-time.ts`

Nejvíc minut jednoho záznamu i jednoho dne jednoho člověka (24 hodin).

```ts
const MAX_DAY_MINUTES: number
```

### DurationFormat

type · `packages/modules/hodiny/src/logic/parse-time.ts`

Způsob zobrazení času: `hm` = `1:30`, `decimal` = `1,5` (hodiny na dvě desetinná místa bez zbytečných nul).

```ts
type DurationFormat = "hm" | "decimal";
```

### JobEffort

type · `packages/modules/hodiny/src/logic/effort.ts`

Výsledek výpočtu.

```ts
type JobEffort = {
  workedMinutes: number;
  estimateMin: number | null;
  /** Kolik z odhadu zbývá (nikdy záporné); `null` bez odhadu. */
  remainingMinutes: number | null;
  /** O kolik je odhad překročen (0, když ne); `null` bez odhadu. */
  overrunMinutes: number | null;
  /** Odpracováno jako procento odhadu (může být nad 100); `null` bez odhadu. */
  progressPct: number | null;
  users: UserEffort[];
  /** Příjmy zakázky celkem (součet podílů) v haléřích; `null`, když finance nejsou k dispozici. */
  totalIncomeMinor: number | null;
  /** Efektivní sazba zakázky jako celku (příjmy ÷ všechny hodiny); `null` bez příjmů nebo bez hodin. */
  effectiveRateMinor: number | null;
};
```

### JobEffortInput

type · `packages/modules/hodiny/src/logic/effort.ts`

Vstup výpočtu.

```ts
type JobEffortInput = {
  hours: readonly UserMinutes[];
  /** Součet odhadů úkolů v minutách; `null` nebo 0 = odhad není. */
  estimateMin: number | null;
  /** Podíl každého člověka na příjmech zakázky v haléřích (`finance.allocatedByUser`); `null` = finance nejsou k dispozici. */
  incomeByUser: Readonly<Record<string, number>> | null;
};
```

### ParsedDuration

type · `packages/modules/hodiny/src/logic/parse-time.ts`

Výsledek rozboru zadaného času: minuty, nebo česká chyba.

```ts
type ParsedDuration = { ok: true; minutes: number } | { ok: false; error: string };
```

### UserEffort

type · `packages/modules/hodiny/src/logic/effort.ts`

Člověk v přehledu zakázky.

```ts
type UserEffort = {
  userId: string;
  minutes: number;
  /** Podíl na odpracovaných hodinách zakázky v procentech (0 až 100); `null`, když nikdo nic nezapsal. */
  sharePct: number | null;
  /** Podíl na příjmech v haléřích; `null`, když finance nejsou k dispozici. */
  incomeMinor: number | null;
  /** Efektivní sazba v haléřích za hodinu; `null` bez příjmů nebo bez hodin. */
  rateMinor: number | null;
};
```
