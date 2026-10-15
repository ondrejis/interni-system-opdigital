# @rebar/reklama/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/reklama/api` (soubor `packages/modules/reklama/src/api.ts`). Exportů: 33, z toho s popisem 33.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`adsOverview`](#adsoverview) | function | Výkon reklamy klienta (kampaně jeho marketingových zakázek a reklamní účty klienta) nebo jedné zakázky za období: útrata, leady Meta × OPSYS, CPL, vyhrané obchody a náklad na vyhraný obchod, graf po dnech a seznam kampaní. Respektuje soukromé obchody aktéra; oprávnění `reklama.read` kontroluje volající. |  |
| [`buildMetrics`](#buildmetrics) | function | Z hrubých součtů složí `PerformanceMetrics` (CPL Meta, CPL OPSYS, ztracené leady, náklad na vyhraný obchod). |  |
| [`ctrPct`](#ctrpct) | function | Prokliky v procentech zobrazení (na dvě desetinná místa); `null` bez zobrazení. |  |
| [`fillDaily`](#filldaily) | function | Doplní dny bez dat nulami a seřadí vzestupně, aby graf neměl mezery. Řádky mimo `from..to` zahodí; více řádků téhož dne sečte. |  |
| [`periodFromPreset`](#periodfrompreset) | function | Období z předvolby: `7d`/`30d`/`90d` = posledních N dní včetně dneška, `month` = od 1. dne měsíce do dneška, `custom` = zadané `from`/`to` (chybí-li, posledních 30 dní). |  |
| [`ratioMinor`](#ratiominor) | function | Podíl `a / b` v haléřích zaokrouhlený na celé číslo; `null`, když dělitel není kladný. |  |
| [`rewriteWindow`](#rewritewindow) | function | Okno, které denní synchronizace přepíše: dnešek a `REWRITE_DAYS` předchozích dní (korekce od Meta). |  |
| [`sumMetricsInputs`](#summetricsinputs) | function | Sečte součty (např. kampaně účtu). |  |
| [`REWRITE_DAYS`](#rewrite_days) | const | Kolik předchozích dní (kromě dneška) se při synchronizaci přepisuje kvůli korekcím od Meta. |  |
| [`cplMinor`](#cplminor) | const | CPL = útrata / počet leadů (haléře); `null` bez leadů. |  |
| [`AccountDetailOutput`](#accountdetailoutput) | type | Výstup `reklama.account.detail`: účet, jeho kampaně s výkonem, součty a graf po dnech. |  |
| [`AccountRow`](#accountrow) | type | Řádek seznamu účtů (REK-11): název, komu patří, poslední synchronizace, útrata tento měsíc. |  |
| [`AccountsListOutput`](#accountslistoutput) | type | Výstup `reklama.accounts.list`: účty a zda je Meta napojená. |  |
| [`AdRow`](#adrow) | type | Reklama s výkonem. |  |
| [`AdSetRow`](#adsetrow) | type | Sada reklam s výkonem a reklamami. |  |
| [`AdsOverviewOutput`](#adsoverviewoutput) | type | Záložka „Reklama“ na kartě klienta a v detailu marketingové zakázky. |  |
| [`CampaignDetailOutput`](#campaigndetailoutput) | type | Výstup `reklama.campaign.detail`: kampaň, sady a reklamy s výkonem, graf po dnech a leady. |  |
| [`CampaignLead`](#campaignlead) | type | Lead (obchod se zdrojem Meta) patřící ke kampani. |  |
| [`CampaignRow`](#campaignrow) | type | Kampaň s výkonem za období (řádek tabulky u účtu, REK-08). |  |
| [`ConnectionStatus`](#connectionstatus) | type | Stav napojení na Meta; token se nikdy nevrací. |  |
| [`ConnectionTestOutput`](#connectiontestoutput) | type | Výsledek zkoušky napojení na Meta (počet nalezených účtů, nebo důvod selhání). |  |
| [`DailyPoint`](#dailypoint) | type | Jeden den grafu útraty a leadů. |  |
| [`LeadIngestPayload`](#leadingestpayload) | type | Tělo příchozího leadu po ověření a normalizaci (výstup `leadIngestPayload`). |  |
| [`MappingRow`](#mappingrow) | type | Mapování formuláře na pipeline, fázi a vlastníka. |  |
| [`MappingsOutput`](#mappingsoutput) | type | Výstup `reklama.mappings.list`: mapování, formuláře bez mapování a výchozí cíl. |  |
| [`MetricsInput`](#metricsinput) | type | Surové součty za období, ze kterých se skládají metriky. |  |
| [`MetricsOutput`](#metricsoutput) | type | Výstup `reklama.metrics`: součty a graf po dnech pro zvolený rozsah. |  |
| [`PerformanceMetrics`](#performancemetrics) | type | Čísla výkonu za období (útrata, zobrazení, kliky, leady Meta × OPSYS, vyhrané obchody). |  |
| [`Period`](#period) | type | Období (včetně obou konců), ve kterém se počítají statistiky. |  |
| [`PeriodPreset`](#periodpreset) | type | Předvolby období v záhlaví: 7, 30, 90 dní, tento měsíc, vlastní. |  |
| [`RecentLead`](#recentlead) | type | Poslední příchozí leady včetně selhaných (REK-05). |  |
| [`SeenForm`](#seenform) | type | Formulář, ze kterého už přišel lead (nabídka při zakládání mapování), s počtem leadů a zda je namapovaný. |  |
| [`SyncSummary`](#syncsummary) | type | Výsledek synchronizace (ruční obnova i denní úloha). |  |

### adsOverview

function · `packages/modules/reklama/src/api.ts`

Výkon reklamy klienta (kampaně jeho marketingových zakázek a reklamní účty klienta) nebo jedné zakázky za období:
útrata, leady Meta × OPSYS, CPL, vyhrané obchody a náklad na vyhraný obchod, graf po dnech a seznam kampaní.
Respektuje soukromé obchody aktéra; oprávnění `reklama.read` kontroluje volající.

```ts
function adsOverview(ctx: Ctx, scope: { companyId: string } | { jobId: string }, period: Period): Promise<AdsOverviewOutput>
```

### buildMetrics

function · `packages/modules/reklama/src/meta/logic.ts`

Z hrubých součtů složí `PerformanceMetrics` (CPL Meta, CPL OPSYS, ztracené leady, náklad na vyhraný obchod).

```ts
function buildMetrics(i: MetricsInput): PerformanceMetrics
```

### ctrPct

function · `packages/modules/reklama/src/meta/logic.ts`

Prokliky v procentech zobrazení (na dvě desetinná místa); `null` bez zobrazení.

```ts
function ctrPct(clicks: number, impressions: number): number | null
```

### fillDaily

function · `packages/modules/reklama/src/meta/logic.ts`

Doplní dny bez dat nulami a seřadí vzestupně, aby graf neměl mezery. Řádky mimo `from..to` zahodí; více řádků téhož
dne sečte.

```ts
function fillDaily(points: readonly Pick< DailyPoint, "date" | "spendMinor" | "impressions" | "clicks" | "leadsMeta" | "leadsOpsys" >[], from: string, to: string): DailyPoint[]
```

### periodFromPreset

function · `packages/modules/reklama/src/meta/logic.ts`

Období z předvolby: `7d`/`30d`/`90d` = posledních N dní včetně dneška, `month` = od 1. dne měsíce do dneška,
`custom` = zadané `from`/`to` (chybí-li, posledních 30 dní).

```ts
function periodFromPreset(preset: PeriodPreset, today: string, custom?: { from?: string; to?: string }): { from: string; to: string }
```

### ratioMinor

function · `packages/modules/reklama/src/meta/logic.ts`

Podíl `a / b` v haléřích zaokrouhlený na celé číslo; `null`, když dělitel není kladný.

```ts
function ratioMinor(a: number, b: number): number | null
```

### rewriteWindow

function · `packages/modules/reklama/src/meta/logic.ts`

Okno, které denní synchronizace přepíše: dnešek a `REWRITE_DAYS` předchozích dní (korekce od Meta).

```ts
function rewriteWindow(today: string): { from: string; to: string }
```

### sumMetricsInputs

function · `packages/modules/reklama/src/meta/logic.ts`

Sečte součty (např. kampaně účtu).

```ts
function sumMetricsInputs(list: readonly MetricsInput[]): MetricsInput
```

### REWRITE_DAYS

const · `packages/modules/reklama/src/meta/logic.ts`

Kolik předchozích dní (kromě dneška) se při synchronizaci přepisuje kvůli korekcím od Meta.

```ts
const REWRITE_DAYS: 7
```

### cplMinor

const · `packages/modules/reklama/src/meta/logic.ts`

CPL = útrata / počet leadů (haléře); `null` bez leadů.

```ts
const cplMinor: (a: number, b: number) => number | null
```

### AccountDetailOutput

type · `packages/modules/reklama/src/contract.ts`

Výstup `reklama.account.detail`: účet, jeho kampaně s výkonem, součty a graf po dnech.

```ts
type AccountDetailOutput = {
  account: AccountRow;
  campaigns: CampaignRow[];
  totals: PerformanceMetrics;
  daily: DailyPoint[];
};
```

### AccountRow

type · `packages/modules/reklama/src/contract.ts`

Řádek seznamu účtů (REK-11): název, komu patří, poslední synchronizace, útrata tento měsíc.

```ts
type AccountRow = {
  id: string;
  metaId: string;
  name: string;
  ownerKind: (typeof AD_OWNER_KINDS)[number];
  companyId: string | null;
  companyName: string | null;
  currency: string | null;
  timezone: string | null;
  active: boolean;
  lastSyncAt: string | null;
  /** Text poslední chyby synchronizace; `null` = poslední běh dopadl dobře. */
  lastSyncError: string | null;
  campaignCount: number;
  spendThisMonthMinor: number;
};
```

### AccountsListOutput

type · `packages/modules/reklama/src/contract.ts`

Výstup `reklama.accounts.list`: účty a zda je Meta napojená.

```ts
type AccountsListOutput = { accounts: AccountRow[]; connected: boolean };
```

### AdRow

type · `packages/modules/reklama/src/contract.ts`

Reklama s výkonem.

```ts
type AdRow = {
  id: string;
  metaId: string;
  name: string;
  status: string | null;
  creativeUrl: string | null;
  metrics: PerformanceMetrics;
};
```

### AdSetRow

type · `packages/modules/reklama/src/contract.ts`

Sada reklam s výkonem a reklamami.

```ts
type AdSetRow = {
  id: string;
  metaId: string;
  name: string;
  status: string | null;
  metrics: PerformanceMetrics;
  ads: AdRow[];
};
```

### AdsOverviewOutput

type · `packages/modules/reklama/src/contract.ts`

Záložka „Reklama“ na kartě klienta a v detailu marketingové zakázky.

```ts
type AdsOverviewOutput = {
  totals: PerformanceMetrics;
  daily: DailyPoint[];
  campaigns: CampaignRow[];
  currency: string;
};
```

### CampaignDetailOutput

type · `packages/modules/reklama/src/contract.ts`

Výstup `reklama.campaign.detail`: kampaň, sady a reklamy s výkonem, graf po dnech a leady.

```ts
type CampaignDetailOutput = {
  campaign: CampaignRow;
  account: { id: string; name: string; currency: string | null };
  adSets: AdSetRow[];
  totals: PerformanceMetrics;
  daily: DailyPoint[];
  leads: CampaignLead[];
};
```

### CampaignLead

type · `packages/modules/reklama/src/contract.ts`

Lead (obchod se zdrojem Meta) patřící ke kampani.

```ts
type CampaignLead = {
  dealId: string;
  title: string;
  createdAt: string;
  result: "open" | "won" | "lost";
  stageId: string;
  companyId: string | null;
};
```

### CampaignRow

type · `packages/modules/reklama/src/contract.ts`

Kampaň s výkonem za období (řádek tabulky u účtu, REK-08).

```ts
type CampaignRow = {
  id: string;
  metaId: string;
  accountId: string;
  name: string;
  objective: string | null;
  status: string | null;
  jobId: string | null;
  jobTitle: string | null;
  metrics: PerformanceMetrics;
};
```

### ConnectionStatus

type · `packages/modules/reklama/src/contract.ts`

Stav napojení na Meta; token se nikdy nevrací.

```ts
type ConnectionStatus = {
  connected: boolean;
  status: "ok" | "reauth" | "error" | null;
  updatedAt: string | null;
};
```

### ConnectionTestOutput

type · `packages/modules/reklama/src/contract.ts`

Výsledek zkoušky napojení na Meta (počet nalezených účtů, nebo důvod selhání).

```ts
type ConnectionTestOutput = { ok: boolean; accounts: number; message: string | null };
```

### DailyPoint

type · `packages/modules/reklama/src/contract.ts`

Jeden den grafu útraty a leadů.

```ts
type DailyPoint = {
  date: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  leadsMeta: number;
  leadsOpsys: number;
};
```

### LeadIngestPayload

type · `packages/modules/reklama/src/contract.ts`

Tělo příchozího leadu po ověření a normalizaci (výstup `leadIngestPayload`).

```ts
type LeadIngestPayload = z.output<typeof leadIngestPayload>;
```

### MappingRow

type · `packages/modules/reklama/src/contract.ts`

Mapování formuláře na pipeline, fázi a vlastníka.

```ts
type MappingRow = {
  id: string;
  metaFormId: string;
  name: string;
  pipelineId: string | null;
  stageId: string | null;
  ownerId: string | null;
  defaultServices: string[];
};
```

### MappingsOutput

type · `packages/modules/reklama/src/contract.ts`

Výstup `reklama.mappings.list`: mapování, formuláře bez mapování a výchozí cíl.

```ts
type MappingsOutput = {
  mappings: MappingRow[];
  seenForms: SeenForm[];
  /** Co se použije u nemapovaného formuláře (R-44): výchozí pipeline, první fáze, vlastník Ondřej. */
  fallback: { pipelineId: string | null; stageId: string | null; ownerId: string | null };
  /** Fáze pipeline „Obchody“ (nabídka v mapování) a aktivní uživatelé (nabídka vlastníka leadů). */
  stages: { id: string; name: string }[];
  users: { id: string; name: string }[];
};
```

### MetricsInput

type · `packages/modules/reklama/src/meta/logic.ts`

Surové součty za období, ze kterých se skládají metriky.

```ts
type MetricsInput = {
  spendMinor: number;
  impressions: number;
  clicks: number;
  leadsMeta: number;
  leadsOpsys: number;
  wonDeals: number;
};
```

### MetricsOutput

type · `packages/modules/reklama/src/contract.ts`

Výstup `reklama.metrics`: součty a graf po dnech pro zvolený rozsah.

```ts
type MetricsOutput = { totals: PerformanceMetrics; daily: DailyPoint[]; currency: string };
```

### PerformanceMetrics

type · `packages/modules/reklama/src/contract.ts`

Čísla výkonu za období (útrata, zobrazení, kliky, leady Meta × OPSYS, vyhrané obchody).

```ts
type PerformanceMetrics = {
  spendMinor: number;
  impressions: number;
  clicks: number;
  /** Prokliky v procentech zobrazení; `null` bez zobrazení. */
  ctrPct: number | null;
  /** Leady podle Mety (denní statistiky). */
  leadsMeta: number;
  /** Obchody se zdrojem Meta v OPSYS (lead, který opravdu dorazil). */
  leadsOpsys: number;
  /** Rozdíl `leadsMeta - leadsOpsys`: ztracené leady (kladné = Meta jich napočítala víc). */
  leadsLost: number;
  /** Útrata / leady Meta (haléře); `null` bez leadů. */
  cplMinor: number | null;
  /** Útrata / leady OPSYS (haléře); `null` bez leadů. */
  cplOpsysMinor: number | null;
  wonDeals: number;
  /** Útrata / vyhrané obchody (haléře); `null` bez výher. */
  costPerWonMinor: number | null;
};
```

### Period

type · `packages/modules/reklama/src/contract.ts`

Období (včetně obou konců), ve kterém se počítají statistiky.

```ts
type Period = z.output<typeof period>;
```

### PeriodPreset

type · `packages/modules/reklama/src/meta/logic.ts`

Předvolby období v záhlaví: 7, 30, 90 dní, tento měsíc, vlastní.

```ts
type PeriodPreset = "7d" | "30d" | "90d" | "month" | "custom";
```

### RecentLead

type · `packages/modules/reklama/src/contract.ts`

Poslední příchozí leady včetně selhaných (REK-05).

```ts
type RecentLead = {
  id: string;
  leadgenId: string;
  status: "received" | "processed" | "failed";
  error: string | null;
  receivedAt: string;
  dealId: string | null;
};
```

### SeenForm

type · `packages/modules/reklama/src/contract.ts`

Formulář, ze kterého už přišel lead (nabídka při zakládání mapování), s počtem leadů a zda je namapovaný.

```ts
type SeenForm = { formId: string; name: string | null; leads: number; mapped: boolean };
```

### SyncSummary

type · `packages/modules/reklama/src/contract.ts`

Výsledek synchronizace (ruční obnova i denní úloha).

```ts
type SyncSummary = {
  accounts: number;
  campaigns: number;
  adSets: number;
  ads: number;
  insightRows: number;
  /** Od kdy se statistiky přepsaly (posledních 7 dní). */
  rewrittenFrom: string;
  errors: { accountId: string | null; message: string }[];
};
```
