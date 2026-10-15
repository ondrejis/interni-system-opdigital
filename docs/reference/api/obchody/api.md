# @rebar/obchody/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/obchody/api` (soubor `packages/modules/obchody/src/api.ts`). Exportů: 21, z toho s popisem 21.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`activityState`](#activitystate) | function | Stav „další aktivity“: bez naplánované aktivity `none`; jinak podle termínu porovnaného s dneškem v pražském čase. Aktivita dnes s uplynulým časem je po termínu; čas přesně o půlnoci se bere jako aktivita na celý den (ta je „dnes“ po celý den). |  |
| [`clampPct`](#clamppct) | function | Pravděpodobnost do rozsahu 0–100; nečíselná hodnota je 0. |  |
| [`columnSummary`](#columnsummary) | function | Souhrn sloupce boardu (OBCH-05): počet, součet hodnot a vážený součet (hodnota × pravděpodobnost fáze). Obchod bez hodnoty se počítá, ale nic nepřidá k součtům. |  |
| [`createDealFromLead`](#createdealfromlead) | function | Založí obchod z příchozího leadu (idempotentně podle `meta.leadgenId`): `created=false`, když obchod pro stejný lead už existuje. Volá `reklama` z ingestu `leads` (v transakci ingestu). Fáze z `formMapping` musí patřit do pipeline obchodů; obchod je zdroje Meta, „neotevřený“ a bez hodnoty. |  |
| [`daysInStage`](#daysinstage) | function | Dny ve fázi (pás fází, karta): od vstupu do aktuální fáze. |  |
| [`daysSince`](#dayssince) | function | Celé kalendářní dny (pražské) od `since` do `now`; budoucí datum nebo prázdná hodnota je 0. |  |
| [`dealHighlight`](#dealhighlight) | function | Zvýraznění obchodu podle fáze: výstražná ikona bez další aktivity, červeně po překročení prahu fáze a zvýraznění neotevřeného leadu. Zavřený (vyhraný, prohraný) obchod se nezvýrazňuje nikdy. |  |
| [`effectiveProbabilityPct`](#effectiveprobabilitypct) | function | Platná pravděpodobnost obchodu v procentech: vyhraný = 100, prohraný = 0, otevřený podle fáze (bez pravděpodobnosti u fáze 0). |  |
| [`isRotting`](#isrotting) | function | Hnije obchod? Ano, když od posledního pohybu uplynul aspoň `rottingDays` dní. Posledním pohybem je pozdější z okamžiku vstupu do fáze a poslední dokončené aktivity. Fáze bez `rottingDays` (nebo 0) nehnije; bez jediného údaje o čase také ne. |  |
| [`isUnopenedLead`](#isunopenedlead) | function | Nový Meta lead, který ještě nikdo neotevřel (na boardu je zvýrazněný, R-42/OBCH-15). |  |
| [`storedWeightedMinor`](#storedweightedminor) | function | Uložená vážená hodnota obchodu v haléřích (sloupec `weighted_minor`); `null`, když obchod nemá hodnotu. Přepočítává se při změně fáze, hodnoty a výsledku. |  |
| [`weightedValueMinor`](#weightedvalueminor) | function | Vážená hodnota v haléřích: hodnota × pravděpodobnost / 100, zaokrouhleno na haléř. |  |
| [`DEAL_RESULTS`](#deal_results) | const | Výsledek obchodu: otevřený, vyhraný, prohraný (fáze pipeline jsou jen `open`, výsledek je tady). |  |
| [`DEAL_SOURCES`](#deal_sources) | const | Zdroj obchodu. |  |
| [`LOST_REASON_LOOKUP`](#lost_reason_lookup) | const | Číselník důvodů prohry obchodu (seed v manifestu, upravitelný v Nastavení). |  |
| [`ActivityState`](#activitystate) | type | Stav další aktivity obchodu pro ikonu na kartě. |  |
| [`ColumnSummary`](#columnsummary) | type | Souhrn sloupce boardu: počet, součet a vážený součet. |  |
| [`CreateDealFromLeadInput`](#createdealfromleadinput) | type | Vstup `createDealFromLead`: lead z Meta formuláře a mapování formuláře na pipeline. |  |
| [`DealHighlight`](#dealhighlight) | type | Vizuální zvýraznění obchodu (OBCH-07, OBCH-15): nic se podle něj nedělá automaticky. |  |
| [`DealResult`](#dealresult) | type | Výsledek obchodu. |  |
| [`DealSource`](#dealsource) | type | Zdroj obchodu. |  |

### activityState

function · `packages/modules/obchody/src/deals/logic.ts`

Stav „další aktivity“: bez naplánované aktivity `none`; jinak podle termínu porovnaného s dneškem v pražském čase.
Aktivita dnes s uplynulým časem je po termínu; čas přesně o půlnoci se bere jako aktivita na celý den (ta je „dnes“
po celý den).

```ts
function activityState(nextActivityAt: DateInput | null | undefined, now: Date = new Date()): ActivityState
```

### clampPct

function · `packages/modules/obchody/src/deals/logic.ts`

Pravděpodobnost do rozsahu 0–100; nečíselná hodnota je 0.

```ts
function clampPct(pct: number): number
```

### columnSummary

function · `packages/modules/obchody/src/deals/logic.ts`

Souhrn sloupce boardu (OBCH-05): počet, součet hodnot a vážený součet (hodnota × pravděpodobnost fáze). Obchod bez
hodnoty se počítá, ale nic nepřidá k součtům.

```ts
function columnSummary(deals: ReadonlyArray<{ valueMinor: number | null; probabilityPct: number }>): ColumnSummary
```

### createDealFromLead

function · `packages/modules/obchody/src/api.ts`

Založí obchod z příchozího leadu (idempotentně podle `meta.leadgenId`): `created=false`, když obchod
pro stejný lead už existuje. Volá `reklama` z ingestu `leads` (v transakci ingestu). Fáze z `formMapping` musí patřit
do pipeline obchodů; obchod je zdroje Meta, „neotevřený“ a bez hodnoty.

```ts
async function createDealFromLead(ctx: Ctx, deps: ModuleDeps, input: CreateDealFromLeadInput): Promise<{ dealId: string; created: boolean }>
```

### daysInStage

function · `packages/modules/obchody/src/deals/logic.ts`

Dny ve fázi (pás fází, karta): od vstupu do aktuální fáze.

```ts
function daysInStage(stageEnteredAt: DateInput | null | undefined, now?: Date): number
```

### daysSince

function · `packages/modules/obchody/src/deals/logic.ts`

Celé kalendářní dny (pražské) od `since` do `now`; budoucí datum nebo prázdná hodnota je 0.

```ts
function daysSince(since: DateInput | null | undefined, now: Date = new Date()): number
```

### dealHighlight

function · `packages/modules/obchody/src/deals/logic.ts`

Zvýraznění obchodu podle fáze: výstražná ikona bez další aktivity, červeně po překročení prahu fáze a zvýraznění
neotevřeného leadu. Zavřený (vyhraný, prohraný) obchod se nezvýrazňuje nikdy.

```ts
function dealHighlight(input: HighlightInput, now: Date = new Date()): DealHighlight
```

### effectiveProbabilityPct

function · `packages/modules/obchody/src/deals/logic.ts`

Platná pravděpodobnost obchodu v procentech: vyhraný = 100, prohraný = 0, otevřený podle fáze (bez pravděpodobnosti
u fáze 0).

```ts
function effectiveProbabilityPct(result: DealResult, stageProbabilityPct: number | null | undefined): number
```

### isRotting

function · `packages/modules/obchody/src/deals/logic.ts`

Hnije obchod? Ano, když od posledního pohybu uplynul aspoň `rottingDays` dní. Posledním pohybem je pozdější z okamžiku
vstupu do fáze a poslední dokončené aktivity. Fáze bez `rottingDays` (nebo 0) nehnije; bez jediného údaje o čase také ne.

```ts
function isRotting(input: { stageEnteredAt?: DateInput | null | undefined; lastActivityAt?: DateInput | null | undefined; rottingDays?: number | null | undefined; }, now: Date = new Date()): boolean
```

### isUnopenedLead

function · `packages/modules/obchody/src/deals/logic.ts`

Nový Meta lead, který ještě nikdo neotevřel (na boardu je zvýrazněný, R-42/OBCH-15).

```ts
function isUnopenedLead(d: { source: DealSource | string | null | undefined; firstOpenedAt: DateInput | null | undefined; result: DealResult; }): boolean
```

### storedWeightedMinor

function · `packages/modules/obchody/src/deals/logic.ts`

Uložená vážená hodnota obchodu v haléřích (sloupec `weighted_minor`); `null`, když obchod nemá hodnotu.
Přepočítává se při změně fáze, hodnoty a výsledku.

```ts
function storedWeightedMinor(valueMinor: number | null | undefined, result: DealResult, stageProbabilityPct: number | null | undefined): number | null
```

### weightedValueMinor

function · `packages/modules/obchody/src/deals/logic.ts`

Vážená hodnota v haléřích: hodnota × pravděpodobnost / 100, zaokrouhleno na haléř.

```ts
function weightedValueMinor(valueMinor: number, probabilityPct: number): number
```

### DEAL_RESULTS

const · `packages/modules/obchody/src/shared.ts`

Výsledek obchodu: otevřený, vyhraný, prohraný (fáze pipeline jsou jen `open`, výsledek je tady).

```ts
const DEAL_RESULTS: readonly ["open", "won", "lost"]
```

### DEAL_SOURCES

const · `packages/modules/obchody/src/shared.ts`

Zdroj obchodu.

```ts
const DEAL_SOURCES: readonly ["manual", "meta", "web_form", "referral", "other"]
```

### LOST_REASON_LOOKUP

const · `packages/modules/obchody/src/shared.ts`

Číselník důvodů prohry obchodu (seed v manifestu, upravitelný v Nastavení).

```ts
const LOST_REASON_LOOKUP: "deal.lost_reason"
```

### ActivityState

type · `packages/modules/obchody/src/deals/logic.ts`

Stav další aktivity obchodu pro ikonu na kartě.

```ts
type ActivityState = "today" | "future" | "overdue" | "none";
```

### ColumnSummary

type · `packages/modules/obchody/src/deals/logic.ts`

Souhrn sloupce boardu: počet, součet a vážený součet.

```ts
type ColumnSummary = {
  count: number;
  /** Součet hodnot v haléřích. */
  totalMinor: number;
  /** Součet vážených hodnot v haléřích (každý obchod zaokrouhlený zvlášť). */
  weightedMinor: number;
};
```

### CreateDealFromLeadInput

type · `packages/modules/obchody/src/api.ts`

Vstup `createDealFromLead`: lead z Meta formuláře a mapování formuláře na pipeline.

```ts
type CreateDealFromLeadInput = {
  title: string;
  /** Firma obchodu; lead z formuláře bez firmy má jen kontakt (sloupec `deal.company_id` je nullable). */
  companyId: string | null;
  personId: string;
  source: "meta";
  meta: {
    campaignId?: string;
    /** Název kampaně: uloží se jako detail zdroje obchodu („Nová poptávka z kampaně …“). */
    campaignName?: string;
    adsetId?: string;
    adId?: string;
    leadgenId: string;
    formId: string;
  };
  formMapping: { pipelineId: string; stageId: string; ownerId: string; services: ServiceType[] };
};
```

### DealHighlight

type · `packages/modules/obchody/src/deals/logic.ts`

Vizuální zvýraznění obchodu (OBCH-07, OBCH-15): nic se podle něj nedělá automaticky.

```ts
type DealHighlight = {
  /** Stav další aktivity (ikona hodin/výstrahy). Zavřený obchod je vždy `none`. */
  activityState: ActivityState;
  /** Otevřený obchod bez naplánované další aktivity: výstražná ikona. */
  noNextActivity: boolean;
  /** Ve fázi déle bez aktivity, než fáze dovoluje: červený obchod. */
  rotting: boolean;
  /** Celé dny ve fázi. */
  daysInStage: number;
  /** Celé dny od poslední dokončené aktivity (nebo od vstupu do fáze, když žádná není). */
  daysSinceActivity: number;
  /** Nový Meta lead bez otevření. */
  unopenedLead: boolean;
};
```

### DealResult

type · `packages/modules/obchody/src/shared.ts`

Výsledek obchodu.

```ts
type DealResult = (typeof DEAL_RESULTS)[number];
```

### DealSource

type · `packages/modules/obchody/src/shared.ts`

Zdroj obchodu.

```ts
type DealSource = (typeof DEAL_SOURCES)[number];
```
