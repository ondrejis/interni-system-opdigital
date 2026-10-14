# @rebar/zakazky/phases

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/phases` (soubor `packages/modules/zakazky/src/lifecycle/phases.ts`). Exportů: 22, z toho s popisem 12.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`allowedNext`](#allowednext) | function | Fáze, do kterých se z `from` smí přejít (u pozastavení včetně návratu do `pausedFrom`). |  |
| [`canTransition`](#cantransition) | function |  |  |
| [`isPhaseKey`](#isphasekey) | function |  |  |
| [`isPreContract`](#isprecontract) | function |  |  |
| [`isPriceLocked`](#ispricelocked) | function | Stav záznamu v seznamu: kdy je smluvní cena zamčená. |  |
| [`listPriceMinor`](#listpriceminor) | function | Cena zakázky pro seznam (`job.sum_contract_minor`) a hlavičku: smluvní cena; v poptávce a nabídce bez zadané ceny cena nabídky z rozpočtu (prodej bez DPH), aby seznam neukazoval 0 Kč u nabídky za miliony. Hlavička říká „Cena nabídky“. |  |
| [`primaryActionFor`](#primaryactionfor) | function | Hlavní akce zakázky ve fázi; u pozastavené zakázky je to návrat do původní fáze. |  |
| [`transitionProblem`](#transitionproblem) | function | Česká věta, proč přechod nejde (prázdné = jde). |  |
| [`ACTIVE_PHASES`](#active_phases) | const | Fáze, ve kterých zakázka běží (do rozsahu „aktivní“, kalendáře, docházky…). |  |
| [`HEALTH`](#health) | const | Semafor zakázky. Pravidlo počítá `computeHealth` v `costs/summary.ts` (oblast costs), tady jsou jen štítky. |  |
| [`HEALTH_CHOICES`](#health_choices) | const |  |  |
| [`MAIN_PHASES`](#main_phases) | const | Hlavní řada fází v pořadí cyklu (bez prohráno a pozastaveno). |  |
| [`PHASES`](#phases) | const |  |  |
| [`PHASE_CHOICES`](#phase_choices) | const | Možnosti pro atribut typu výběr (`phase`). |  |
| [`PHASE_KEYS`](#phase_keys) | const |  |  |
| [`PHASE_LIST`](#phase_list) | const | Fáze seřazené podle `order` (pro nabídky a pohledy). |  |
| [`PRE_CONTRACT_PHASES`](#pre_contract_phases) | const | Fáze před výhrou: smluvní cena ještě není, rozpočet nese jen cenu nabídky. |  |
| [`PRICE_LOCKED_PHASES`](#price_locked_phases) | const | Od zahájení realizace se původní smluvní cena nemění; roste jen schválenými změnami. |  |
| [`HealthKey`](#healthkey) | type |  |  |
| [`PhaseAction`](#phaseaction) | type |  |  |
| [`PhaseDef`](#phasedef) | type |  |  |
| [`PhaseKey`](#phasekey) | type |  |  |

### allowedNext

function · `packages/modules/zakazky/src/lifecycle/phases.ts`

Fáze, do kterých se z `from` smí přejít (u pozastavení včetně návratu do `pausedFrom`).

```ts
function allowedNext(from: PhaseKey, pausedFrom?: string | null): PhaseKey[]
```

### canTransition

function · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
function canTransition(from: PhaseKey, to: PhaseKey, pausedFrom?: string | null): boolean
```

### isPhaseKey

function · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
function isPhaseKey(v: unknown): v is PhaseKey
```

### isPreContract

function · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
function isPreContract(phase: unknown): boolean
```

### isPriceLocked

function · `packages/modules/zakazky/src/lifecycle/phases.ts`

Stav záznamu v seznamu: kdy je smluvní cena zamčená.

```ts
function isPriceLocked(phase: PhaseKey, pausedFrom?: string | null): boolean
```

### listPriceMinor

function · `packages/modules/zakazky/src/lifecycle/phases.ts`

Cena zakázky pro seznam (`job.sum_contract_minor`) a hlavičku: smluvní cena; v poptávce a nabídce bez zadané ceny
cena nabídky z rozpočtu (prodej bez DPH), aby seznam neukazoval 0 Kč u nabídky za miliony. Hlavička říká „Cena nabídky“.

```ts
function listPriceMinor(phase: unknown, contractMinor: number, budgetSellMinor: number): number
```

### primaryActionFor

function · `packages/modules/zakazky/src/lifecycle/phases.ts`

Hlavní akce zakázky ve fázi; u pozastavené zakázky je to návrat do původní fáze.

```ts
function primaryActionFor(phase: PhaseKey, pausedFrom?: string | null): PhaseAction | null
```

### transitionProblem

function · `packages/modules/zakazky/src/lifecycle/phases.ts`

Česká věta, proč přechod nejde (prázdné = jde).

```ts
function transitionProblem(from: PhaseKey, to: PhaseKey, pausedFrom?: string | null): string | null
```

### ACTIVE_PHASES

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

Fáze, ve kterých zakázka běží (do rozsahu „aktivní“, kalendáře, docházky…).

```ts
const ACTIVE_PHASES: readonly PhaseKey[]
```

### HEALTH

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

Semafor zakázky. Pravidlo počítá `computeHealth` v `costs/summary.ts` (oblast costs), tady jsou jen štítky.

```ts
const HEALTH: { readonly ok: { readonly label: "OK"; readonly color: "green"; }; readonly warning: { readonly label: "Pozor"; readonly color: "orange"; }; readonly danger: { readonly label: "Problém"; readonly color: "red"; }; }
```

### HEALTH_CHOICES

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
const HEALTH_CHOICES: { value: "ok" | "warning" | "danger"; label: "OK" | "Pozor" | "Problém"; color: "red" | "orange" | "green"; }[]
```

### MAIN_PHASES

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

Hlavní řada fází v pořadí cyklu (bez prohráno a pozastaveno).

```ts
const MAIN_PHASES: readonly PhaseKey[]
```

### PHASES

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
const PHASES: Record<PhaseKey, PhaseDef>
```

### PHASE_CHOICES

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

Možnosti pro atribut typu výběr (`phase`).

```ts
const PHASE_CHOICES: { value: "lost" | "inquiry" | "preparation" | "offer" | "execution" | "handover" | "warranty" | "closed" | "paused"; label: string; color: string; }[]
```

### PHASE_KEYS

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
const PHASE_KEYS: readonly ["inquiry", "offer", "preparation", "execution", "handover", "warranty", "closed", "lost", "paused"]
```

### PHASE_LIST

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

Fáze seřazené podle `order` (pro nabídky a pohledy).

```ts
const PHASE_LIST: readonly PhaseDef[]
```

### PRE_CONTRACT_PHASES

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

Fáze před výhrou: smluvní cena ještě není, rozpočet nese jen cenu nabídky.

```ts
const PRE_CONTRACT_PHASES: readonly PhaseKey[]
```

### PRICE_LOCKED_PHASES

const · `packages/modules/zakazky/src/lifecycle/phases.ts`

Od zahájení realizace se původní smluvní cena nemění; roste jen schválenými změnami.

```ts
const PRICE_LOCKED_PHASES: readonly PhaseKey[]
```

### HealthKey

type · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
type HealthKey = keyof typeof HEALTH;
```

### PhaseAction

type · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
type PhaseAction = { label: string; to: PhaseKey };
```

### PhaseDef

type · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
type PhaseDef = {
  key: PhaseKey;
  label: string;
  /** Barva štítku (`Chip color`). */
  color: string;
  /** Pořadí v životním cyklu; vedlejší fáze (prohráno, pozastaveno) jsou až za hlavní řadou. */
  order: number;
  /** Hlavní akce zakázky v této fázi: další fáze, nebo `null`, když žádná není (u `paused` viz `primaryActionFor`). */
  primaryAction: PhaseAction | null;
  /** Jednou větou, co fáze znamená (nápověda v dialogu přechodu). */
  hint: string;
};
```

### PhaseKey

type · `packages/modules/zakazky/src/lifecycle/phases.ts`

_Bez popisu._

```ts
type PhaseKey = (typeof PHASE_KEYS)[number];
```
