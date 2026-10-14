# @rebar/dochazka/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/dochazka/server` (soubor `packages/modules/dochazka/src/server.ts`). Exportů: 49, z toho s popisem 23.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`assertDayLimit`](#assertdaylimit) | function | Den nesmí přesáhnout 24 hodin. |  |
| [`clockMinutes`](#clockminutes) | function | Odpracované minuty z píchačky: od příchodu do odchodu minus přestávky (nikdy záporné). |  |
| [`clockRunText`](#clockruntext) | function | Texty do upozornění: „dnes v 7:02“ / „2. 3. 2026 v 7:02“ a „14:20 h“ (skutečně uplynulý čas). |  |
| [`editedStatus`](#editedstatus) | function | Stav záznamu po úpravě: vrácený se po opravě vrací do rozpracovaných; schválený a odeslaný záznam smí měnit jen ten, kdo schvaluje (u odeslaného i sám autor po vzetí týdne zpět). |  |
| [`entryMinutes`](#entryminutes) | function | Doba záznamu v minutách: buď od–do minus přestávka (konec musí být po začátku), nebo přímo hodiny. Vždy musí vyjít kladná doba. |  |
| [`expectedToWork`](#expectedtowork) | function | Kdo má v tento den pracovat. V datech není plán směn ani kalendář dovolených (absence jsou jen záznamy docházky s druhem dovolená/nemoc/lékař…, které den zároveň zaplní), proto je pravidlo záměrně konzervativní: aktivní uživatel s právem `dochazka.own`, který má kartu zaměstnance, není externista a už nastoupil. Kdo má na dnešek jakýkoli záznam (i absenci) nebo mu běží píchačka, se nepřipomíná. |  |
| [`forgottenClockStage`](#forgottenclockstage) | function | Je běžící píchačka zapomenutá? Vrací důvod, nebo `null`. - `carried`: začala v předchozím dni a běží aspoň 10 h, - `long`: začala dnes a běží aspoň 12 h, - `evening`: začala dnes, je po 19:00 a běží aspoň 6 h. Mimo okno 6:00–22:00 se nehlásí nic. |  |
| [`isAbsence`](#isabsence) | function |  |  |
| [`monthBalance`](#monthbalance) | function | Přesčas/mínus: odpracováno proti fondu měsíce (absence se do odpracovaného počítají, kromě náhradního volna jako „čerpání“). |  |
| [`sendEveningReminders`](#sendeveningreminders) | function | Odpolední připomínka (17:30 v pracovní dny): kdo dnes nezapsal nic, dostane jedno upozornění. |  |
| [`sendForgottenClockOut`](#sendforgottenclockout) | function | Zapomenutý odchod: běžící píchačky, které `forgottenClockStage` označí. Zaměstnanec dostane naléhavé upozornění (jednou za den a záznam); běží-li píchačka od předchozího dne, vědí o tom i schvalovatelé s rozsahem „vše“. |  |
| [`sendMissingClockIn`](#sendmissingclockin) | function | Ráno v pracovní den: očekávaný zaměstnanec (viz `expectedToWork`), který nemá žádný dnešní záznam ani běžící píchačku, dostane upozornění „chybí příchod“. Pracovní dny podle nastavení docházky a státních svátků. |  |
| [`TimeRuleError`](#timeruleerror) | class |  |  |
| [`BILLABLE_KINDS`](#billable_kinds) | const | Druhy, které zakázce účtují práci. |  |
| [`CARRIED_MIN_HOURS`](#carried_min_hours) | const | Píchačka z předchozího dne je „zapomenutá“, až když běží aspoň tolik hodin (noční směna 22–06 ne). |  |
| [`EVENING_FROM`](#evening_from) | const | Po tomto čase hlídáme píchačku, která už běží aspoň `EVENING_MIN_HOURS` (večerní směna od 17:00 není zapomenutá). |  |
| [`EVENING_MIN_HOURS`](#evening_min_hours) | const |  |  |
| [`FORGOT_WINDOW`](#forgot_window) | const | Zapomenutý odchod se hlásí jen ve dne; v noci by naléhavé upozornění (obchází tiché hodiny) budilo lidi. |  |
| [`LONG_RUN_HOURS`](#long_run_hours) | const | Během jednoho dne: tolik hodin v kuse je zjevně moc. |  |
| [`PAID_ABSENCE`](#paid_absence) | const | Absence, které se započítávají do plnění fondu pracovní doby (náhradní volno čerpá fond, takže ne). |  |
| [`TIME_KINDS`](#time_kinds) | const | Druhy záznamů. Absence (dovolená, nemoc…) nemají zakázku a nezapočítávají se do nákladů zakázek. |  |
| [`TIME_KIND_VALUES`](#time_kind_values) | const |  |  |
| [`TIME_STATUSES`](#time_statuses) | const |  |  |
| [`approvals`](#approvals) | const |  |  |
| [`clockBreak`](#clockbreak) | const |  |  |
| [`clockIn`](#clockin) | const |  |  |
| [`clockOut`](#clockout) | const |  |  |
| [`clockStatus`](#clockstatus) | const |  |  |
| [`dochazkaSetting`](#dochazkasetting) | const | Pravidla docházky: pracovní doba, schvalování, výchozí náklad hodiny, připomínka. |  |
| [`entities`](#entities) | const |  |  |
| [`getSettings`](#getsettings) | const |  |  |
| [`lockMonth`](#lockmonth) | const |  |  |
| [`month`](#month) | const |  |  |
| [`remove`](#remove) | const |  |  |
| [`report`](#report) | const |  |  |
| [`reviewWeek`](#reviewweek) | const |  |  |
| [`save`](#save) | const |  |  |
| [`saveSettings`](#savesettings) | const |  |  |
| [`server`](#server) | const |  |  |
| [`submitWeek`](#submitweek) | const |  |  |
| [`timeEntry`](schema.md#timeentry) | const | Záznam docházky. Doba je v minutách. Zápis je buď ručně (od–do s přestávkou, nebo přímo hodiny), nebo z píchačky (`source = clock`): běžící záznam má `startedAt` a nemá `endedAt`. Zakázka a fáze jsou měkké odkazy (bez cizího klíče), aby docházka fungovala i bez modulů Zakázky a Realizace. `hourlyCostMinor` je snímek nákladu zaměstnance v době zápisu. | v `@rebar/dochazka/schema` |
| [`timeEntryEntity`](#timeentryentity) | const |  |  |
| [`timeLock`](schema.md#timelock) | const | Uzavřený měsíc (podklad pro mzdy): v něm už se docházka nemění. | v `@rebar/dochazka/schema` |
| [`week`](#week) | const |  |  |
| [`withdrawWeek`](#withdrawweek) | const |  |  |
| [`ExpectedPerson`](#expectedperson) | type | Zaměstnanec s údaji potřebnými k rozhodnutí, zda má dnes pracovat. |  |
| [`ForgotStage`](#forgotstage) | type | Proč je běžící píchačka považována za zapomenutou. |  |
| [`TimeKind`](#timekind) | type |  |  |
| [`TimeStatus`](#timestatus) | type |  |  |

### assertDayLimit

function · `packages/modules/dochazka/src/rules.ts`

Den nesmí přesáhnout 24 hodin.

```ts
function assertDayLimit(alreadyMinutes: number, addMinutes: number): void
```

### clockMinutes

function · `packages/modules/dochazka/src/rules.ts`

Odpracované minuty z píchačky: od příchodu do odchodu minus přestávky (nikdy záporné).

```ts
function clockMinutes(startedAt: Date, endedAt: Date, breakMinutes: number): number
```

### clockRunText

function · `packages/modules/dochazka/src/notice-rules.ts`

Texty do upozornění: „dnes v 7:02“ / „2. 3. 2026 v 7:02“ a „14:20 h“ (skutečně uplynulý čas).

```ts
function clockRunText(startedAt: Date, now: Date, tz?: string): { since: string; running: string; }
```

### editedStatus

function · `packages/modules/dochazka/src/rules.ts`

Stav záznamu po úpravě: vrácený se po opravě vrací do rozpracovaných; schválený a odeslaný záznam smí měnit jen ten,
kdo schvaluje (u odeslaného i sám autor po vzetí týdne zpět).

```ts
function editedStatus(opts: { status: string; isOwner: boolean; canApprove: boolean; }): TimeStatus
```

### entryMinutes

function · `packages/modules/dochazka/src/rules.ts`

Doba záznamu v minutách: buď od–do minus přestávka (konec musí být po začátku), nebo přímo hodiny.
Vždy musí vyjít kladná doba.

```ts
function entryMinutes(i: { startTime?: string | null; endTime?: string | null; breakMinutes?: number; hours?: number | null; }): number
```

### expectedToWork

function · `packages/modules/dochazka/src/notice-rules.ts`

Kdo má v tento den pracovat. V datech není plán směn ani kalendář dovolených (absence jsou jen záznamy docházky
s druhem dovolená/nemoc/lékař…, které den zároveň zaplní), proto je pravidlo záměrně konzervativní:
aktivní uživatel s právem `dochazka.own`, který má kartu zaměstnance, není externista a už nastoupil.
Kdo má na dnešek jakýkoli záznam (i absenci) nebo mu běží píchačka, se nepřipomíná.

```ts
function expectedToWork(people: readonly ExpectedPerson[], today: string, covered: ReadonlySet<string>): string[]
```

### forgottenClockStage

function · `packages/modules/dochazka/src/notice-rules.ts`

Je běžící píchačka zapomenutá? Vrací důvod, nebo `null`.
- `carried`: začala v předchozím dni a běží aspoň 10 h,
- `long`: začala dnes a běží aspoň 12 h,
- `evening`: začala dnes, je po 19:00 a běží aspoň 6 h.
Mimo okno 6:00–22:00 se nehlásí nic.

```ts
function forgottenClockStage(startedAt: Date, now: Date, tz?: string): ForgotStage | null
```

### isAbsence

function · `packages/modules/dochazka/src/rules.ts`

_Bez popisu._

```ts
function isAbsence(kind: string): boolean
```

### monthBalance

function · `packages/modules/dochazka/src/rules.ts`

Přesčas/mínus: odpracováno proti fondu měsíce (absence se do odpracovaného počítají, kromě náhradního volna jako „čerpání“).

```ts
function monthBalance(workedMinutes: number, fundMinutes: number): number
```

### sendEveningReminders

function · `packages/modules/dochazka/src/notices.ts`

Odpolední připomínka (17:30 v pracovní dny): kdo dnes nezapsal nic, dostane jedno upozornění.

```ts
async function sendEveningReminders(db: Executor, settings: Pick<DochazkaSettings, "reminder" | "workDays">, now = new Date()): Promise<{ created: number }>
```

### sendForgottenClockOut

function · `packages/modules/dochazka/src/notices.ts`

Zapomenutý odchod: běžící píchačky, které `forgottenClockStage` označí. Zaměstnanec dostane naléhavé upozornění
(jednou za den a záznam); běží-li píchačka od předchozího dne, vědí o tom i schvalovatelé s rozsahem „vše“.

```ts
async function sendForgottenClockOut(db: Executor, now = new Date()): Promise<{ person: number; team: number }>
```

### sendMissingClockIn

function · `packages/modules/dochazka/src/notices.ts`

Ráno v pracovní den: očekávaný zaměstnanec (viz `expectedToWork`), který nemá žádný dnešní záznam ani běžící
píchačku, dostane upozornění „chybí příchod“. Pracovní dny podle nastavení docházky a státních svátků.

```ts
async function sendMissingClockIn(db: Executor, settings: Pick<DochazkaSettings, "workDays">, now = new Date()): Promise<{ created: number; expected: number }>
```

### TimeRuleError

class · `packages/modules/dochazka/src/rules.ts`

_Bez popisu._

```ts
class TimeRuleError extends Error {

}
```

### BILLABLE_KINDS

const · `packages/modules/dochazka/src/rules.ts`

Druhy, které zakázce účtují práci.

```ts
const BILLABLE_KINDS: readonly string[]
```

### CARRIED_MIN_HOURS

const · `packages/modules/dochazka/src/notice-rules.ts`

Píchačka z předchozího dne je „zapomenutá“, až když běží aspoň tolik hodin (noční směna 22–06 ne).

```ts
const CARRIED_MIN_HOURS: 10
```

### EVENING_FROM

const · `packages/modules/dochazka/src/notice-rules.ts`

Po tomto čase hlídáme píchačku, která už běží aspoň `EVENING_MIN_HOURS` (večerní směna od 17:00 není zapomenutá).

```ts
const EVENING_FROM: "19:00"
```

### EVENING_MIN_HOURS

const · `packages/modules/dochazka/src/notice-rules.ts`

_Bez popisu._

```ts
const EVENING_MIN_HOURS: 6
```

### FORGOT_WINDOW

const · `packages/modules/dochazka/src/notice-rules.ts`

Zapomenutý odchod se hlásí jen ve dne; v noci by naléhavé upozornění (obchází tiché hodiny) budilo lidi.

```ts
const FORGOT_WINDOW: { readonly from: "06:00"; readonly to: "22:00"; }
```

### LONG_RUN_HOURS

const · `packages/modules/dochazka/src/notice-rules.ts`

Během jednoho dne: tolik hodin v kuse je zjevně moc.

```ts
const LONG_RUN_HOURS: 12
```

### PAID_ABSENCE

const · `packages/modules/dochazka/src/rules.ts`

Absence, které se započítávají do plnění fondu pracovní doby (náhradní volno čerpá fond, takže ne).

```ts
const PAID_ABSENCE: readonly string[]
```

### TIME_KINDS

const · `packages/modules/dochazka/src/rules.ts`

Druhy záznamů. Absence (dovolená, nemoc…) nemají zakázku a nezapočítávají se do nákladů zakázek.

```ts
const TIME_KINDS: readonly [{ readonly value: "work"; readonly label: "Práce"; readonly absence: false; readonly color: "blue"; }, { readonly value: "travel"; readonly label: "Cesta"; readonly absence: false; readonly color: "indigo"; }, { readonly value: "…
```

### TIME_KIND_VALUES

const · `packages/modules/dochazka/src/rules.ts`

_Bez popisu._

```ts
const TIME_KIND_VALUES: ["admin" | "work" | "travel" | "workshop" | "vacation" | "sick" | "doctor" | "holiday" | "comp", ...("admin" | "work" | "travel" | "workshop" | "vacation" | "sick" | "doctor" | "holiday" | "comp")[]]
```

### TIME_STATUSES

const · `packages/modules/dochazka/src/rules.ts`

_Bez popisu._

```ts
const TIME_STATUSES: readonly ["draft", "submitted", "approved", "returned"]
```

### approvals

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const approvals: import("@rebar/core/module-server").CommandDef<z.ZodObject<{}, z.core.$strip>, { userId: string; name: string; week: string; minutes: number; entries: number; }[]>
```

### clockBreak

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const clockBreak: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ action: z.ZodEnum<{ start: "start"; end: "end"; }>; at: z.ZodOptional<z.ZodNullable<z.ZodISODateTime>>; }, z.core.$strip>, void>
```

### clockIn

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const clockIn: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; kind: z.ZodDefault<z.ZodEnum<{ admin: "admin"; work: "work"; travel: "travel"; workshop: "workshop"; }>>; note: z.ZodOptional<z.Zo…
```

### clockOut

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const clockOut: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ note: z.ZodOptional<z.ZodNullable<z.ZodString>>; jobId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; at: z.ZodOptional<z.ZodNullable<z.ZodISODateTime>>; }, z.core.$strip>, { discarde…
```

### clockStatus

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const clockStatus: import("@rebar/core/module-server").CommandDef<z.ZodObject<{}, z.core.$strip>, { running: { id: string; startedAt: string; breakStartedAt: string | null; breakMinutes: number; kind: string; jobId: string | null; jobTitle: string | null; no…
```

### dochazkaSetting

const · `packages/modules/dochazka/src/settings.ts`

Pravidla docházky: pracovní doba, schvalování, výchozí náklad hodiny, připomínka.

```ts
const dochazkaSetting: import("@rebar/core/settings").SettingDef<{ hoursPerDay: number; workDays: number[]; requireApproval: boolean; defaultHourlyCostMinor: number; reminder: boolean; }>
```

### entities

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### getSettings

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const getSettings: import("@rebar/core/module-server").CommandDef<z.ZodObject<{}, z.core.$strip>, { hoursPerDay: number; workDays: number[]; requireApproval: boolean; defaultHourlyCostMinor: number; reminder: boolean; }>
```

### lockMonth

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const lockMonth: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ month: z.ZodString; locked: z.ZodBoolean; }, z.core.$strip>, void>
```

### month

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const month: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ month: z.ZodString; userId: z.ZodOptional<z.ZodUUID>; }, z.core.$strip>, { month: string; locked: boolean; days: { date: string; holiday: string | null; workday: boolean; minutes…
```

### remove

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const remove: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>, void>
```

### report

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const report: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ month: z.ZodString; }, z.core.$strip>, { month: string; locked: boolean; canClose: boolean; users: { userId: string; name: string; workedMinutes: number; absenceMinutes: number; …
```

### reviewWeek

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const reviewWeek: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ userId: z.ZodUUID; weekStart: z.ZodISODate; decision: z.ZodEnum<{ approve: "approve"; return: "return"; }>; note: z.ZodOptional<z.ZodNullable<z.ZodString>>; }, z.core.$strip>, { …
```

### save

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const save: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ id: z.ZodOptional<z.ZodUUID>; userId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; date: z.ZodISODate; kind: z.ZodEnum<{ admin: "admin"; work: "work"; travel: "travel"; workshop: "wo…
```

### saveSettings

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const saveSettings: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ hoursPerDay: z.ZodNumber; workDays: z.ZodArray<z.ZodNumber>; requireApproval: z.ZodBoolean; defaultHourlyCostMinor: z.ZodNumber; reminder: z.ZodBoolean; }, z.core.$strip>, void>
```

### server

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const server: { readonly entities: readonly [import("@rebar/core/entities").EntityDef]; readonly dashboardMetrics: import("@rebar/core/module-server").DashboardMetricDef[]; readonly commands: readonly [import("@rebar/core/module-server").CommandDef<z.Zo…
```

### submitWeek

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const submitWeek: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ weekStart: z.ZodISODate; }, z.core.$strip>, { count: number; minutes: number; }>
```

### timeEntryEntity

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const timeEntryEntity: import("@rebar/core/entities").EntityDef
```

### week

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const week: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ weekStart: z.ZodISODate; userId: z.ZodOptional<z.ZodUUID>; }, z.core.$strip>, { weekStart: string; userId: string; userName: string; isSelf: boolean; entries: { jobTitle: string …
```

### withdrawWeek

const · `packages/modules/dochazka/src/server.ts`

_Bez popisu._

```ts
const withdrawWeek: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ weekStart: z.ZodISODate; }, z.core.$strip>, void>
```

### ExpectedPerson

type · `packages/modules/dochazka/src/notice-rules.ts`

Zaměstnanec s údaji potřebnými k rozhodnutí, zda má dnes pracovat.

```ts
type ExpectedPerson = { userId: string; employmentType: string; startDate: string | null };
```

### ForgotStage

type · `packages/modules/dochazka/src/notice-rules.ts`

Proč je běžící píchačka považována za zapomenutou.

```ts
type ForgotStage = "carried" | "long" | "evening";
```

### TimeKind

type · `packages/modules/dochazka/src/rules.ts`

_Bez popisu._

```ts
type TimeKind = (typeof TIME_KINDS)[number]["value"];
```

### TimeStatus

type · `packages/modules/dochazka/src/rules.ts`

_Bez popisu._

```ts
type TimeStatus = (typeof TIME_STATUSES)[number];
```
