# @rebar/realizace/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/realizace/server` (soubor `packages/modules/realizace/src/server.ts`). Exportů: 51, z toho s popisem 32.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`conflictFixes`](#conflictfixes) | function | Opravy pro „Přepočítat návaznosti“: nové termíny jen pro první fázi v řetězu konfliktů (předchůdce sám konflikt nemá). Posun navazujících pak provede server (`shift`), takže se nic neposouvá dvakrát. |  |
| [`dependencyConflicts`](#dependencyconflicts) | function | Fáze, která začíná dřív, než skončí její předchůdce (návaznost není dodržená). Hotové fáze se nepočítají. |  |
| [`diffDaysIso`](#diffdaysiso) | function | Počet dní od `a` do `b` (b − a). |  |
| [`endAfter`](#endafter) | function | Konec fáze, která začíná `start` a trvá `workdays` pracovních dní. |  |
| [`jobProgress`](#jobprogress) | function | Celkový průběh zakázky = průběh fází vážený jejich délkou v pracovních dnech. |  |
| [`lengthInWorkdays`](#lengthinworkdays) | function | Délka fáze v pracovních dnech (nejméně 1; milník = 1). |  |
| [`nextWorkday`](#nextworkday) | function | První pracovní den po `date`. |  |
| [`phaseDelay`](#phasedelay) | function | Zpoždění fáze v pracovních dnech: hotová → skutečný konec proti plánu; přeplánovaná na později → posun proti výchozímu plánu; běžící po plánovaném konci → dnes proti plánu. |  |
| [`previousWorkday`](#previousworkday) | function | Poslední pracovní den před `date`. |  |
| [`scheduleSummary`](#schedulesummary) | function | Souhrn harmonogramu pro hlavičku záložky: termín, počty, zpoždění, nejbližší milník. |  |
| [`sendDiaryReminders`](#senddiaryreminders) | function | Odpoledne: zakázky v realizaci, na kterých se dnes pracuje (běží nehotová fáze, nebo zakázka žádný harmonogram nemá) a které nemají dnešní zápis ve stavebním deníku, připomenou zápis vedoucímu a týmu. Jednou za den a zakázku. |  |
| [`sendMorningOverview`](#sendmorningoverview) | function | Ranní přehled „Dnes na stavbě“: každému, kdo vede zakázku, je v jejím týmu nebo odpovídá za fázi a dnes běží fáze (začátek ≤ dnes ≤ konec, nehotová), přijde jedno upozornění se zakázkami a fázemi. Odpovědný za fázi, který není v týmu, vidí jen své fáze. O víkendech a svátcích se neposílá. |  |
| [`sendPhaseDeadlines`](#sendphasedeadlines) | function | Termíny fází: (1) „končí dnes / zítra“ pro nehotové fáze, které končí dnes nebo v nejbližší pracovní den (jednodenní fáze a milníky se vynechávají, ty připomíná začátek); (2) „po termínu“ (naléhavé) pro nehotové fáze, jejichž konec už byl (nejvýš 7 dní zpět, kdyby úloha nějaký den neběžela). Každý stupeň přijde jednou pro fázi a termín konce, takže po posunu termínu se připomene znovu. |  |
| [`sendPhaseStarts`](#sendphasestarts) | function | „Fáze začíná“: fáze, která ještě nezačala (0 %) a její začátek připadl na dnešek nebo na dny od posledního pracovního dne (víkend, svátek). Jednou pro fázi a termín začátku. |  |
| [`shiftDependents`](#shiftdependents) | function | Posune navazující fáze, které by začínaly dřív, než skončí jejich předchůdce: začnou první pracovní den po něm a zachovají délku v pracovních dnech. Pracuje na kopii, vrací změněné fáze (v pořadí posunu). |  |
| [`statusFromProgress`](#statusfromprogress) | function |  |  |
| [`toWorkday`](#toworkday) | function | Nejbližší pracovní den ke dni `date` směrem dopředu (včetně dne samého). |  |
| [`wouldCycle`](#wouldcycle) | function | Návaznost nesmí udělat kruh (A po B po A) ani odkazovat sama na sebe. |  |
| [`DEFECT_PIPELINE`](#defect_pipeline) | const |  |  |
| [`SEVERITY_LOOKUP`](#severity_lookup) | const |  |  |
| [`defect`](schema.md#defect) | const | Vada nebo reklamace na zakázce. Stav je pipeline (kanban), takže jde spravovat jako ostatní záznamy. | v `@rebar/realizace/schema` |
| [`defectEntity`](#defectentity) | const | Vada nebo reklamace na zakázce. Vidí ji ten, kdo vadu řeší, vede zakázku, nebo je v jejím týmu. |  |
| [`defectsOpen`](#defectsopen) | const | Otevřené vady zakázky pro kartu na Přehledu (nejdřív po termínu, pak podle stáří). |  |
| [`diaryDelete`](#diarydelete) | const |  |  |
| [`diaryList`](#diarylist) | const |  |  |
| [`diaryPrefill`](#diaryprefill) | const | Předvyplnění zápisu z docházky, strojů a skladu toho dne (dodávají je ostatní moduly, pokud běží). |  |
| [`diaryPrint`](#diaryprint) | const | Všechny zápisy v období pro tisk deníku (bez cen). |  |
| [`diarySave`](#diarysave) | const |  |  |
| [`diarySign`](#diarysign) | const | Podpis zápisu: soubor s podpisem (ručně, nebo podpis z předání) musí být připojený k téže zakázce. |  |
| [`diaryUnsign`](#diaryunsign) | const |  |  |
| [`diaryWeather`](#diaryweather) | const |  |  |
| [`entities`](#entities) | const |  |  |
| [`handoverDelete`](#handoverdelete) | const |  |  |
| [`handoverItem`](schema.md#handoveritem) | const |  | v `@rebar/realizace/schema` |
| [`handoverList`](#handoverlist) | const |  |  |
| [`handoverProtocol`](schema.md#handoverprotocol) | const | Předávací protokol zakázky (i částečné předání). Podpis zákazníka je soubor připojený k zakázce. | v `@rebar/realizace/schema` |
| [`handoverSave`](#handoversave) | const |  |  |
| [`handoverSign`](#handoversign) | const | Podpis zákazníka: soubor s podpisem musí být připojený k téže zakázce. Podepsaný protokol je neměnný. |  |
| [`investorView`](#investorview) | const | Data Realizace pro veřejnou stránku investora (odkaz jen ke čtení). Příkaz smí volat jen systémový kontext aplikace, který předtím ověřil token odkazu; přihlášený uživatel ho přes `runCommand` volat nesmí, jinak by si mohl vyžádat cizí zakázku. Vrací jen to, co rozsah dovolí, a nikdy ceny, hodiny ani osobní údaje nad rámec jmen. |  |
| [`jobPhase`](schema.md#jobphase) | const | Fáze harmonogramu zakázky. Termíny jsou data (pracovní dny řeší výpočty); `baseline*` je výchozí plán, `actual*` skutečnost. Stav plyne z průběhu (0 % plánováno, 1–99 % probíhá, 100 % hotovo). | v `@rebar/realizace/schema` |
| [`overview`](#overview) | const | Přehled všech zakázek s harmonogramem (v rozsahu, který aktér vidí): průběh, zpoždění, nejbližší fáze. |  |
| [`phaseHooks`](#phasehooks) | const |  |  |
| [`phasesDelete`](#phasesdelete) | const |  |  |
| [`phasesList`](#phaseslist) | const |  |  |
| [`phasesMove`](#phasesmove) | const | Přetažení pruhu v Ganttu: nové datum začátku a konce, volitelně s posunem navazujících. |  |
| [`phasesSave`](#phasessave) | const |  |  |
| [`phasesSetBaseline`](#phasessetbaseline) | const | Aktuální plán se stane novým výchozím (např. po dohodě se zákazníkem o posunu). |  |
| [`phasesSetProgress`](#phasessetprogress) | const |  |  |
| [`server`](#server) | const |  |  |
| [`siteDiary`](schema.md#sitediary) | const | Stavební deník: jeden zápis na zakázku a den. | v `@rebar/realizace/schema` |
| [`PhaseLike`](#phaselike) | type | Výpočty harmonogramu bez databáze (pracovní dny a svátky ČR, návaznosti, průběh, zpoždění). |  |

### conflictFixes

function · `packages/modules/realizace/src/schedule.ts`

Opravy pro „Přepočítat návaznosti“: nové termíny jen pro první fázi v řetězu konfliktů (předchůdce sám konflikt
nemá). Posun navazujících pak provede server (`shift`), takže se nic neposouvá dvakrát.

```ts
function conflictFixes<T extends PhaseLike>(phases: readonly T[]): { id: string; startDate: string; endDate: string }[]
```

### dependencyConflicts

function · `packages/modules/realizace/src/schedule.ts`

Fáze, která začíná dřív, než skončí její předchůdce (návaznost není dodržená). Hotové fáze se nepočítají.

```ts
function dependencyConflicts<T extends PhaseLike>(phases: readonly T[]): T[]
```

### diffDaysIso

function · `packages/core/src/time/dates.ts`

Počet dní od `a` do `b` (b − a).

```ts
function diffDaysIso(a: string, b: string): number
```

### endAfter

function · `packages/modules/realizace/src/schedule.ts`

Konec fáze, která začíná `start` a trvá `workdays` pracovních dní.

```ts
function endAfter(start: string, workdays: number): string
```

### jobProgress

function · `packages/modules/realizace/src/schedule.ts`

Celkový průběh zakázky = průběh fází vážený jejich délkou v pracovních dnech.

```ts
function jobProgress(phases: readonly PhaseLike[]): number
```

### lengthInWorkdays

function · `packages/modules/realizace/src/schedule.ts`

Délka fáze v pracovních dnech (nejméně 1; milník = 1).

```ts
function lengthInWorkdays(start: string, end: string): number
```

### nextWorkday

function · `packages/modules/realizace/src/scheduled.ts`

První pracovní den po `date`.

```ts
function nextWorkday(date: string): string
```

### phaseDelay

function · `packages/modules/realizace/src/schedule.ts`

Zpoždění fáze v pracovních dnech: hotová → skutečný konec proti plánu; přeplánovaná na později → posun proti
výchozímu plánu; běžící po plánovaném konci → dnes proti plánu.

```ts
function phaseDelay(p: PhaseLike, today: string): number
```

### previousWorkday

function · `packages/modules/realizace/src/scheduled.ts`

Poslední pracovní den před `date`.

```ts
function previousWorkday(date: string): string
```

### scheduleSummary

function · `packages/modules/realizace/src/schedule.ts`

Souhrn harmonogramu pro hlavičku záložky: termín, počty, zpoždění, nejbližší milník.

```ts
function scheduleSummary<T extends PhaseLike & { delay: number }>(phases: readonly T[], today: string): { total: number; done: number; late: T[]; start: string; end: string | null; remaining: number; overdue: number; nextMilestone: T; }
```

### sendDiaryReminders

function · `packages/modules/realizace/src/scheduled.ts`

Odpoledne: zakázky v realizaci, na kterých se dnes pracuje (běží nehotová fáze, nebo zakázka žádný harmonogram
nemá) a které nemají dnešní zápis ve stavebním deníku, připomenou zápis vedoucímu a týmu. Jednou za den a zakázku.

```ts
async function sendDiaryReminders(db: Executor, now = new Date()): Promise<ScheduledResult>
```

### sendMorningOverview

function · `packages/modules/realizace/src/scheduled.ts`

Ranní přehled „Dnes na stavbě“: každému, kdo vede zakázku, je v jejím týmu nebo odpovídá za fázi a dnes běží fáze
(začátek ≤ dnes ≤ konec, nehotová), přijde jedno upozornění se zakázkami a fázemi. Odpovědný za fázi, který není
v týmu, vidí jen své fáze. O víkendech a svátcích se neposílá.

```ts
async function sendMorningOverview(db: Executor, now = new Date()): Promise<ScheduledResult>
```

### sendPhaseDeadlines

function · `packages/modules/realizace/src/scheduled.ts`

Termíny fází: (1) „končí dnes / zítra“ pro nehotové fáze, které končí dnes nebo v nejbližší pracovní den
(jednodenní fáze a milníky se vynechávají, ty připomíná začátek); (2) „po termínu“ (naléhavé) pro nehotové fáze,
jejichž konec už byl (nejvýš 7 dní zpět, kdyby úloha nějaký den neběžela). Každý stupeň přijde jednou pro fázi
a termín konce, takže po posunu termínu se připomene znovu.

```ts
async function sendPhaseDeadlines(db: Executor, now = new Date()): Promise<{ upcoming: number; overdue: number }>
```

### sendPhaseStarts

function · `packages/modules/realizace/src/scheduled.ts`

„Fáze začíná“: fáze, která ještě nezačala (0 %) a její začátek připadl na dnešek nebo na dny od posledního
pracovního dne (víkend, svátek). Jednou pro fázi a termín začátku.

```ts
async function sendPhaseStarts(db: Executor, now = new Date()): Promise<ScheduledResult>
```

### shiftDependents

function · `packages/modules/realizace/src/schedule.ts`

Posune navazující fáze, které by začínaly dřív, než skončí jejich předchůdce: začnou první pracovní den po něm
a zachovají délku v pracovních dnech. Pracuje na kopii, vrací změněné fáze (v pořadí posunu).

```ts
function shiftDependents<T extends PhaseLike>(phases: readonly T[], changedId: string): T[]
```

### statusFromProgress

function · `packages/modules/realizace/src/schedule.ts`

_Bez popisu._

```ts
function statusFromProgress(progress: number): "done" | "planned" | "in_progress"
```

### toWorkday

function · `packages/modules/realizace/src/schedule.ts`

Nejbližší pracovní den ke dni `date` směrem dopředu (včetně dne samého).

```ts
function toWorkday(date: string): string
```

### wouldCycle

function · `packages/modules/realizace/src/schedule.ts`

Návaznost nesmí udělat kruh (A po B po A) ani odkazovat sama na sebe.

```ts
function wouldCycle(phases: readonly Pick<PhaseLike, "id" | "dependsOnId">[], phaseId: string | null, dependsOnId: string | null): boolean
```

### DEFECT_PIPELINE

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const DEFECT_PIPELINE: { readonly entityType: "defect"; readonly key: "default"; }
```

### SEVERITY_LOOKUP

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const SEVERITY_LOOKUP: "defect.severity"
```

### defectEntity

const · `packages/modules/realizace/src/server.ts`

Vada nebo reklamace na zakázce. Vidí ji ten, kdo vadu řeší, vede zakázku, nebo je v jejím týmu.

```ts
const defectEntity: import("@rebar/core/entities").EntityDef
```

### defectsOpen

const · `packages/modules/realizace/src/defects.ts`

Otevřené vady zakázky pro kartu na Přehledu (nejdřív po termínu, pak podle stáří).

```ts
const defectsOpen: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; }, z.core.$strip>, { count: number; items: { id: string; title: string; severity: string | null; dueDate: string | null; stage: string; }[]; }>
```

### diaryDelete

const · `packages/modules/realizace/src/diary.ts`

_Bez popisu._

```ts
const diaryDelete: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>, void>
```

### diaryList

const · `packages/modules/realizace/src/diary.ts`

_Bez popisu._

```ts
const diaryList: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; }, z.core.$strip>, { canWrite: boolean; canPrice: boolean; canUnsign: boolean; entries: { id: string; date: string; weather: string | null; temperature: number …
```

### diaryPrefill

const · `packages/modules/realizace/src/diary.ts`

Předvyplnění zápisu z docházky, strojů a skladu toho dne (dodávají je ostatní moduly, pokud běží).

```ts
const diaryPrefill: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; date: z.ZodISODate; }, z.core.$strip>, { people: string; work: string; machines: string; materials: string; workers: DiaryWorker[]; machineRows: DiaryMachine[];…
```

### diaryPrint

const · `packages/modules/realizace/src/diary.ts`

Všechny zápisy v období pro tisk deníku (bez cen).

```ts
const diaryPrint: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; from: z.ZodOptional<z.ZodNullable<z.ZodISODate>>; to: z.ZodOptional<z.ZodNullable<z.ZodISODate>>; }, z.core.$strip>, { job: { number: string; title: string; add…
```

### diarySave

const · `packages/modules/realizace/src/diary.ts`

_Bez popisu._

```ts
const diarySave: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; date: z.ZodISODate; weather: z.ZodOptional<z.ZodNullable<z.ZodString>>; temperature: z.ZodOptional<z.ZodNullable<z.ZodNumber>>; weatherData: z.ZodOptional<z.Zod…
```

### diarySign

const · `packages/modules/realizace/src/diary.ts`

Podpis zápisu: soubor s podpisem (ručně, nebo podpis z předání) musí být připojený k téže zakázce.

```ts
const diarySign: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; signatureFileId: z.ZodUUID; name: z.ZodString; }, z.core.$strip>, void>
```

### diaryUnsign

const · `packages/modules/realizace/src/diary.ts`

_Bez popisu._

```ts
const diaryUnsign: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>, void>
```

### diaryWeather

const · `packages/modules/realizace/src/diary.ts`

_Bez popisu._

```ts
const diaryWeather: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; date: z.ZodISODate; }, z.core.$strip>, WeatherResult>
```

### entities

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### handoverDelete

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const handoverDelete: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>, void>
```

### handoverList

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const handoverList: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; }, z.core.$strip>, { id: string; number: string; date: string; note: string | null; acceptedBy: string | null; status: string; signatureFileId: string | null; s…
```

### handoverSave

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const handoverSave: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; id: z.ZodOptional<z.ZodUUID>; date: z.ZodISODate; note: z.ZodOptional<z.ZodNullable<z.ZodString>>; acceptedBy: z.ZodOptional<z.ZodNullable<z.ZodString>>; items:…
```

### handoverSign

const · `packages/modules/realizace/src/server.ts`

Podpis zákazníka: soubor s podpisem musí být připojený k téže zakázce. Podepsaný protokol je neměnný.

```ts
const handoverSign: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; signatureFileId: z.ZodUUID; acceptedBy: z.ZodString; }, z.core.$strip>, void>
```

### investorView

const · `packages/modules/realizace/src/investor.ts`

Data Realizace pro veřejnou stránku investora (odkaz jen ke čtení). Příkaz smí volat jen systémový kontext
aplikace, který předtím ověřil token odkazu; přihlášený uživatel ho přes `runCommand` volat nesmí, jinak by si
mohl vyžádat cizí zakázku. Vrací jen to, co rozsah dovolí, a nikdy ceny, hodiny ani osobní údaje nad rámec jmen.

```ts
const investorView: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; scope: z.ZodObject<{ schedule: z.ZodBoolean; diary: z.ZodEnum<{ none: "none"; all: "all"; flagged: "flagged"; }>; }, z.core.$strip>; }, z.core.$strip>, { phases…
```

### overview

const · `packages/modules/realizace/src/server.ts`

Přehled všech zakázek s harmonogramem (v rozsahu, který aktér vidí): průběh, zpoždění, nejbližší fáze.

```ts
const overview: import("@rebar/core/module-server").CommandDef<z.ZodObject<{}, z.core.$strip>, { id: string; number: string; title: string; startDate: string; endDate: string; progress: number; delay: number; next: { name: string; startDate: string; endDa…
```

### phaseHooks

const · `packages/modules/realizace/src/hooks.ts`

_Bez popisu._

```ts
const phaseHooks: PhaseTransitionHook[]
```

### phasesDelete

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const phasesDelete: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>, void>
```

### phasesList

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const phasesList: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; }, z.core.$strip>, { phases: { id: string; name: string; startDate: string; endDate: string; baselineStart: string | null; baselineEnd: string | null; actualSta…
```

### phasesMove

const · `packages/modules/realizace/src/server.ts`

Přetažení pruhu v Ganttu: nové datum začátku a konce, volitelně s posunem navazujících.

```ts
const phasesMove: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; id: z.ZodUUID; startDate: z.ZodISODate; endDate: z.ZodISODate; shift: z.ZodDefault<z.ZodBoolean>; }, z.core.$strip>, { shifted: number; }>
```

### phasesSave

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const phasesSave: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; id: z.ZodOptional<z.ZodUUID>; name: z.ZodString; startDate: z.ZodISODate; endDate: z.ZodISODate; actualStart: z.ZodPreprocess<z.ZodOptional<z.ZodNullable<z.ZodI…
```

### phasesSetBaseline

const · `packages/modules/realizace/src/server.ts`

Aktuální plán se stane novým výchozím (např. po dohodě se zákazníkem o posunu).

```ts
const phasesSetBaseline: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; }, z.core.$strip>, void>
```

### phasesSetProgress

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const phasesSetProgress: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; id: z.ZodUUID; progress: z.ZodNumber; }, z.core.$strip>, void>
```

### server

const · `packages/modules/realizace/src/server.ts`

_Bez popisu._

```ts
const server: { readonly entities: readonly [import("@rebar/core/entities").EntityDef]; readonly phaseHooks: import("@rebar/core/entities").PhaseTransitionHook[]; readonly jobs: readonly [import("@rebar/core/module-server").ModuleJob, import("@rebar/cor…
```

### PhaseLike

type · `packages/modules/realizace/src/schedule.ts`

Výpočty harmonogramu bez databáze (pracovní dny a svátky ČR, návaznosti, průběh, zpoždění).

```ts
type PhaseLike = {
  id: string;
  startDate: string;
  endDate: string;
  baselineEnd?: string | null;
  actualEnd?: string | null;
  progress: number;
  status: string;
  milestone?: boolean;
  dependsOnId?: string | null;
};
```
