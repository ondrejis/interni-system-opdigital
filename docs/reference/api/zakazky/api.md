# @rebar/zakazky/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/api` (soubor `packages/modules/zakazky/src/api.ts`). Exportů: 13, z toho s popisem 13.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`completeJob`](#completejob) | function | Dokončí nebo zruší zakázku (`finished` a `retainer_ended` = Dokončená, `cancelled` = Zrušená); nezablokuje, jen vrací, co zůstalo otevřené (úkoly, neuhrazené platby, další živá zakázka klienta). Vyšle `project.completed`. |  |
| [`createJob`](#createjob) | function | Ruční založení zakázky (z šablony nebo bez ní); uvnitř vytvoří fáze, členy, úkoly a platby, přidá klientovi službu a vyšle `project.created`. |  |
| [`createJobsFromWonDeal`](#createjobsfromwondeal) | function | Založí zakázky z vyhraného obchodu v jedné transakci: pro každý řádek zakázku s fázemi ze šablony, členy, úkoly (služba `tasks`), plánovanými platbami a rozdělením (služba `finance`), službou klienta (služba `clients`) a událostí `project.created` (pro Disk). Cena: u jediného řádku se předvyplní hodnotou obchodu (R-39). Soukromý obchod dává soukromé zakázky. Vrací zakázky v pořadí řádků; prázdné `rows` nic nezaloží. |  |
| [`getJobBrief`](#getjobbrief) | function | Stručný popis zakázky, nebo `null`, když neexistuje nebo ji aktér nesmí vidět. |  |
| [`getJobBriefs`](#getjobbriefs) | function | Stručné popisy více zakázek najednou (neviditelné a neexistující se vynechají). |  |
| [`listTemplates`](#listtemplates) | function | Šablony zakázek (volitelně jen pro jeden typ); archivované se nevracejí. |  |
| [`setCurrentPhase`](#setcurrentphase) | function | Přepne aktuální fázi zakázky; dřívější fáze se dokončí (volitelně i jejich otevřené úkoly), pozdější se vrátí do stavu Nezahájená. Vyšle `project.phase_changed` a za každou nově dokončenou fázi `project.phase_completed`. |  |
| [`setMarketingStage`](#setmarketingstage) | function | Nastaví fázi marketingové zakázky (volá `finance` po vyhodnocení úvodní fáze a po rozhodnutí klienta). Stav `retainer` přesune zakázku do fáze s rolí `retainer` (dřívější fáze se dokončí); `ended` jen zapíše stav, zakázku pak ukončí volající přes `completeJob({ reason: "retainer_ended" })`. |  |
| [`CreateJobInput`](#createjobinput) | type | Vstup založení zakázky (před doplněním výchozích hodnot). |  |
| [`CreatedJob`](#createdjob) | type | Výsledek založení zakázky. |  |
| [`JobBrief`](#jobbrief) | type | Stručný popis zakázky pro jiné moduly (bez soukromých údajů navíc). |  |
| [`JobFromDealRow`](#jobfromdealrow) | type | Řádek dialogu „Založit zakázky“ po výhře obchodu (před doplněním výchozích hodnot). |  |
| [`TemplateBrief`](#templatebrief) | type | Šablona zakázky ve stručném výpisu pro výběr v dialozích. |  |

### completeJob

function · `packages/modules/zakazky/src/api.ts`

Dokončí nebo zruší zakázku (`finished` a `retainer_ended` = Dokončená, `cancelled` = Zrušená); nezablokuje, jen
vrací, co zůstalo otevřené (úkoly, neuhrazené platby, další živá zakázka klienta). Vyšle `project.completed`.

```ts
async function completeJob(ctx: Ctx, deps: ModuleDeps, input: { jobId: string; reason: CompleteReason }): Promise<{ openTasks: number; unpaidPayments: number; clientHasOtherActiveJob: boolean }>
```

### createJob

function · `packages/modules/zakazky/src/api.ts`

Ruční založení zakázky (z šablony nebo bez ní); uvnitř vytvoří fáze, členy, úkoly a platby, přidá klientovi službu
a vyšle `project.created`.

```ts
async function createJob(ctx: Ctx, deps: ModuleDeps, input: CreateJobInput): Promise<{ id: string; number: string }>
```

### createJobsFromWonDeal

function · `packages/modules/zakazky/src/api.ts`

Založí zakázky z vyhraného obchodu v jedné transakci: pro každý řádek zakázku s fázemi ze šablony, členy, úkoly
(služba `tasks`), plánovanými platbami a rozdělením (služba `finance`), službou klienta (služba `clients`)
a událostí `project.created` (pro Disk). Cena: u jediného řádku se předvyplní hodnotou obchodu (R-39). Soukromý
obchod dává soukromé zakázky. Vrací zakázky v pořadí řádků; prázdné `rows` nic nezaloží.

```ts
async function createJobsFromWonDeal(ctx: Ctx, deps: ModuleDeps, input: { dealId: string; companyId: string; rows: JobFromDealRow[]; dealValueMinor?: number | null; }): Promise<{ jobs: CreatedJob[] }>
```

### getJobBrief

function · `packages/modules/zakazky/src/api.ts`

Stručný popis zakázky, nebo `null`, když neexistuje nebo ji aktér nesmí vidět.

```ts
async function getJobBrief(ctx: Ctx, jobId: string): Promise<JobBrief | null>
```

### getJobBriefs

function · `packages/modules/zakazky/src/api.ts`

Stručné popisy více zakázek najednou (neviditelné a neexistující se vynechají).

```ts
async function getJobBriefs(ctx: Ctx, jobIds: string[]): Promise<JobBrief[]>
```

### listTemplates

function · `packages/modules/zakazky/src/api.ts`

Šablony zakázek (volitelně jen pro jeden typ); archivované se nevracejí.

```ts
async function listTemplates(ctx: Ctx, type?: ServiceType): Promise<TemplateBrief[]>
```

### setCurrentPhase

function · `packages/modules/zakazky/src/api.ts`

Přepne aktuální fázi zakázky; dřívější fáze se dokončí (volitelně i jejich otevřené úkoly), pozdější se vrátí do
stavu Nezahájená. Vyšle `project.phase_changed` a za každou nově dokončenou fázi `project.phase_completed`.

```ts
async function setCurrentPhase(ctx: Ctx, deps: ModuleDeps, input: { jobId: string; phaseId: string; completeOpenTasks?: boolean }): Promise<{ completedPhaseIds: string[] }>
```

### setMarketingStage

function · `packages/modules/zakazky/src/api.ts`

Nastaví fázi marketingové zakázky (volá `finance` po vyhodnocení úvodní fáze a po rozhodnutí klienta). Stav `retainer`
přesune zakázku do fáze s rolí `retainer` (dřívější fáze se dokončí); `ended` jen zapíše stav, zakázku pak
ukončí volající přes `completeJob({ reason: "retainer_ended" })`.

```ts
async function setMarketingStage(ctx: Ctx, jobId: string, stage: MarketingStage): Promise<void>
```

### CreateJobInput

type · `packages/modules/zakazky/src/contract.ts`

Vstup založení zakázky (před doplněním výchozích hodnot).

```ts
type CreateJobInput = z.input<typeof createInput>;
```

### CreatedJob

type · `packages/modules/zakazky/src/contract.ts`

Výsledek založení zakázky.

```ts
type CreatedJob = { id: string; number: string; type: ServiceType };
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

type · `packages/modules/zakazky/src/contract.ts`

Řádek dialogu „Založit zakázky“ po výhře obchodu (před doplněním výchozích hodnot).

```ts
type JobFromDealRow = z.input<typeof jobFromDealRow>;
```

### TemplateBrief

type · `packages/modules/zakazky/src/api.ts`

Šablona zakázky ve stručném výpisu pro výběr v dialozích.

```ts
type TemplateBrief = {
  id: string;
  name: string;
  type: ServiceType;
  isDefault: boolean;
  defaultBilling: BillingModel;
};
```
