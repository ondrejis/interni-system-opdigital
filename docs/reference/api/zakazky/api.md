# @rebar/zakazky/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/api` (soubor `packages/modules/zakazky/src/api.ts`). Exportů: 10, z toho s popisem 10.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`completeJob`](#completejob) | function | Dokončí nebo zruší zakázku; vrací, co zůstalo otevřené (úkoly, neuhrazené platby, další aktivní zakázka klienta). |  |
| [`createJob`](#createjob) | function | Ruční založení zakázky (z šablony); uvnitř vytvoří fáze, členy, úkoly a platby a vyšle `project.created`. |  |
| [`createJobsFromWonDeal`](#createjobsfromwondeal) | function | Založí zakázky z vyhraného obchodu v jedné transakci (fáze, členové, služby `tasks`/`finance`/`clients`, `project.created`). |  |
| [`getJobBrief`](#getjobbrief) | function | Stručný popis zakázky, nebo `null`, když neexistuje nebo ji aktér nesmí vidět. |  |
| [`listTemplates`](#listtemplates) | function | Šablony zakázek (volitelně jen pro jeden typ). |  |
| [`setCurrentPhase`](#setcurrentphase) | function | Přepne aktuální fázi zakázky; předchozí fáze se uzavřou (volitelně i jejich otevřené úkoly). |  |
| [`setMarketingStage`](#setmarketingstage) | function | Nastaví fázi marketingové zakázky (volá finance po vyhodnocení úvodní fáze a po rozhodnutí klienta). |  |
| [`CreateJobInput`](#createjobinput) | type | Vstup ručního založení zakázky (z šablony nebo bez ní). |  |
| [`JobBrief`](#jobbrief) | type | Stručný popis zakázky pro jiné moduly (bez soukromých údajů navíc). |  |
| [`JobFromDealRow`](#jobfromdealrow) | type | Jedna zakázka zakládaná z vyhraného obchodu (řádek dialogu „Založit zakázky“). |  |

### completeJob

function · `packages/modules/zakazky/src/api.ts`

Dokončí nebo zruší zakázku; vrací, co zůstalo otevřené (úkoly, neuhrazené platby, další aktivní zakázka klienta).

```ts
async function completeJob(_ctx: Ctx, _deps: ModuleDeps, _input: { jobId: string; reason: "finished" | "retainer_ended" | "cancelled" }): Promise<{ openTasks: number; unpaidPayments: number; clientHasOtherActiveJob: boolean }>
```

### createJob

function · `packages/modules/zakazky/src/api.ts`

Ruční založení zakázky (z šablony); uvnitř vytvoří fáze, členy, úkoly a platby a vyšle `project.created`.

```ts
async function createJob(_ctx: Ctx, _deps: ModuleDeps, _input: CreateJobInput): Promise<{ id: string; number: string }>
```

### createJobsFromWonDeal

function · `packages/modules/zakazky/src/api.ts`

Založí zakázky z vyhraného obchodu v jedné transakci (fáze, členové, služby `tasks`/`finance`/`clients`, `project.created`).

```ts
async function createJobsFromWonDeal(_ctx: Ctx, _deps: ModuleDeps, _input: { dealId: string; companyId: string; rows: JobFromDealRow[]; dealValueMinor?: number | null; }): Promise<{ jobs: { id: string; number: string; type: ServiceType }[] }>
```

### getJobBrief

function · `packages/modules/zakazky/src/api.ts`

Stručný popis zakázky, nebo `null`, když neexistuje nebo ji aktér nesmí vidět.

```ts
async function getJobBrief(_ctx: Ctx, _jobId: string): Promise<JobBrief | null>
```

### listTemplates

function · `packages/modules/zakazky/src/api.ts`

Šablony zakázek (volitelně jen pro jeden typ).

```ts
async function listTemplates(_ctx: Ctx, _type?: ServiceType): Promise< { id: string; name: string; type: ServiceType; isDefault: boolean; defaultBilling: BillingModel; }[] >
```

### setCurrentPhase

function · `packages/modules/zakazky/src/api.ts`

Přepne aktuální fázi zakázky; předchozí fáze se uzavřou (volitelně i jejich otevřené úkoly).

```ts
async function setCurrentPhase(_ctx: Ctx, _deps: ModuleDeps, _input: { jobId: string; phaseId: string; completeOpenTasks?: boolean }): Promise<{ completedPhaseIds: string[] }>
```

### setMarketingStage

function · `packages/modules/zakazky/src/api.ts`

Nastaví fázi marketingové zakázky (volá finance po vyhodnocení úvodní fáze a po rozhodnutí klienta).

```ts
async function setMarketingStage(_ctx: Ctx, _jobId: string, _stage: MarketingStage): Promise<void>
```

### CreateJobInput

type · `packages/modules/zakazky/src/api.ts`

Vstup ručního založení zakázky (z šablony nebo bez ní).

```ts
type CreateJobInput = {
  title: string;
  type: ServiceType;
  companyId: string;
  ownerId: string;
  memberIds?: string[];
  templateId?: string | null;
  startDate?: string;
  dueDate?: string | null;
  billingModel?: BillingModel;
  split?: SplitRuleInput[];
  retainer?: RetainerSetup;
  dealId?: string | null;
  description?: string | null;
  isPrivate?: boolean;
};
```

### JobBrief

type · `packages/modules/zakazky/src/api.ts`

Stručný popis zakázky pro jiné moduly (bez soukromých údajů navíc).

```ts
type JobBrief = {
  id: string;
  number: string;
  title: string;
  type: ServiceType;
  companyId: string | null;
  ownerId: string | null;
  status: JobStatus;
  isPrivate: boolean;
  startDate: string | null;
  billingModel: BillingModel;
  marketingStage: MarketingStage | null;
};
```

### JobFromDealRow

type · `packages/modules/zakazky/src/api.ts`

Jedna zakázka zakládaná z vyhraného obchodu (řádek dialogu „Založit zakázky“).

```ts
type JobFromDealRow = {
  type: ServiceType;
  templateId: string | null;
  title: string;
  startDate: string;
  ownerId: string;
  memberIds: string[];
  billingModel?: BillingModel;
  split?: SplitRuleInput[];
  retainer?: RetainerSetup;
};
```
