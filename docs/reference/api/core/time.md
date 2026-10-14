# @rebar/core/time

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/time` (soubor `packages/core/src/time/index.ts`). Exportů: 22, z toho s popisem 16.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`addDaysIso`](#adddaysiso) | function |  |  |
| [`addMonthsIso`](#addmonthsiso) | function | Posune datum o měsíce; den se při krátším měsíci zkrátí na jeho poslední (31. 1. + 1 měsíc = 28. 2.). |  |
| [`addWorkdays`](#addworkdays) | function | Datum po `n` pracovních dnech (n může být záporné); `n = 0` vrátí nejbližší pracovní den od data výše. |  |
| [`czechHolidays`](#czechholidays) | function | Státní svátky ČR v daném roce: `YYYY-MM-DD` → název. |  |
| [`diffDaysIso`](#diffdaysiso) | function | Počet dní od `a` do `b` (b − a). |  |
| [`eachDayIso`](#eachdayiso) | function |  |  |
| [`formatClock`](#formatclock) | function | Okamžik jako čas „14:30“ v dané zóně (výchozí Europe/Prague), stejný na serveru i v prohlížeči. |  |
| [`formatInstant`](#formatinstant) | function | Okamžik jako krátký český text v dané zóně (výchozí Europe/Prague): „8. 10. 14:30“, s `year` „8. 10. 2026 14:30“, s `time: false` jen datum. Text se skládá z čísel, takže je stejný na serveru i v prohlížeči bez ohledu na časové pásmo stroje i verzi ICU (jinak by se vykreslení liší a React hlásí chybu hydratace #418). Neplatná nebo prázdná hodnota je pomlčka. |  |
| [`formatMinutes`](#formatminutes) | function | 450 → „7:30“. |  |
| [`holidayName`](#holidayname) | function |  |  |
| [`isWorkday`](#isworkday) | function | Pracovní den = den v pracovním týdnu, který není státní svátek. |  |
| [`isoWeekday`](#isoweekday) | function | Den v týdnu podle ISO: pondělí = 1 … neděle = 7. |  |
| [`localParts`](#localparts) | function | Rozloží okamžik na místní datum a čas v dané zóně (výchozí Europe/Prague): `{ date: "2026-10-08", time: "07:30" }`. |  |
| [`monthFundMinutes`](#monthfundminutes) | function | Fond pracovní doby za měsíc v minutách (pracovní dny × hodin denně × úvazek). |  |
| [`monthOf`](#monthof) | function |  |  |
| [`monthRange`](#monthrange) | function | První a poslední den měsíce `YYYY-MM`. |  |
| [`timeToMinutes`](#timetominutes) | function | „07:30“ → 450. |  |
| [`todayIso`](#todayiso) | function | Dnešní datum v dané zóně (výchozí Europe/Prague). |  |
| [`weekStartIso`](#weekstartiso) | function |  |  |
| [`workingDays`](#workingdays) | function | Pracovní dny v rozsahu včetně obou konců. |  |
| [`zonedToUtc`](#zonedtoutc) | function | Místní datum a čas v zóně → okamžik (UTC). Správně zvládá letní čas; neexistující hodinu (jarní skok) posune dopředu a nejednoznačnou (podzimní) bere jako první výskyt. |  |
| [`DEFAULT_WORK_DAYS`](#default_work_days) | const |  |  |

### addDaysIso

function · `packages/core/src/time/dates.ts`

_Bez popisu._

```ts
function addDaysIso(date: string, days: number): string
```

### addMonthsIso

function · `packages/core/src/time/dates.ts`

Posune datum o měsíce; den se při krátším měsíci zkrátí na jeho poslední (31. 1. + 1 měsíc = 28. 2.).

```ts
function addMonthsIso(date: string, months: number): string
```

### addWorkdays

function · `packages/core/src/time/dates.ts`

Datum po `n` pracovních dnech (n může být záporné); `n = 0` vrátí nejbližší pracovní den od data výše.

```ts
function addWorkdays(date: string, n: number, workDays: readonly number[] = DEFAULT_WORK_DAYS): string
```

### czechHolidays

function · `packages/core/src/time/dates.ts`

Státní svátky ČR v daném roce: `YYYY-MM-DD` → název.

```ts
function czechHolidays(year: number): ReadonlyMap<string, string>
```

### diffDaysIso

function · `packages/core/src/time/dates.ts`

Počet dní od `a` do `b` (b − a).

```ts
function diffDaysIso(a: string, b: string): number
```

### eachDayIso

function · `packages/core/src/time/dates.ts`

_Bez popisu._

```ts
function eachDayIso(from: string, to: string): string[]
```

### formatClock

function · `packages/core/src/time/dates.ts`

Okamžik jako čas „14:30“ v dané zóně (výchozí Europe/Prague), stejný na serveru i v prohlížeči.

```ts
function formatClock(value: string | number | Date | null | undefined, tz = "Europe/Prague"): string
```

### formatInstant

function · `packages/core/src/time/dates.ts`

Okamžik jako krátký český text v dané zóně (výchozí Europe/Prague): „8. 10. 14:30“, s `year` „8. 10. 2026 14:30“, s
`time: false` jen datum. Text se skládá z čísel, takže je stejný na serveru i v prohlížeči bez ohledu na časové pásmo
stroje i verzi ICU (jinak by se vykreslení liší a React hlásí chybu hydratace #418). Neplatná nebo prázdná hodnota
je pomlčka.

```ts
function formatInstant(value: string | number | Date | null | undefined, opts: { year?: boolean; time?: boolean; tz?: string } = {}): string
```

### formatMinutes

function · `packages/core/src/time/dates.ts`

450 → „7:30“.

```ts
function formatMinutes(min: number, withUnit = true): string
```

### holidayName

function · `packages/core/src/time/dates.ts`

_Bez popisu._

```ts
function holidayName(date: string): string | undefined
```

### isWorkday

function · `packages/core/src/time/dates.ts`

Pracovní den = den v pracovním týdnu, který není státní svátek.

```ts
function isWorkday(date: string, workDays: readonly number[] = DEFAULT_WORK_DAYS): boolean
```

### isoWeekday

function · `packages/core/src/time/dates.ts`

Den v týdnu podle ISO: pondělí = 1 … neděle = 7.

```ts
function isoWeekday(date: string): number
```

### localParts

function · `packages/core/src/time/dates.ts`

Rozloží okamžik na místní datum a čas v dané zóně (výchozí Europe/Prague): `{ date: "2026-10-08", time: "07:30" }`.

```ts
function localParts(at: Date, tz = "Europe/Prague"): { date: string; time: string }
```

### monthFundMinutes

function · `packages/core/src/time/dates.ts`

Fond pracovní doby za měsíc v minutách (pracovní dny × hodin denně × úvazek).

```ts
function monthFundMinutes(month: string, hoursPerDay: number, workDays: readonly number[] = DEFAULT_WORK_DAYS, workload = 1): number
```

### monthOf

function · `packages/core/src/time/dates.ts`

_Bez popisu._

```ts
function monthOf(date: string): string
```

### monthRange

function · `packages/core/src/time/dates.ts`

První a poslední den měsíce `YYYY-MM`.

```ts
function monthRange(month: string): { from: string; to: string }
```

### timeToMinutes

function · `packages/core/src/time/dates.ts`

„07:30“ → 450.

```ts
function timeToMinutes(t: string): number
```

### todayIso

function · `packages/core/src/time/dates.ts`

Dnešní datum v dané zóně (výchozí Europe/Prague).

```ts
function todayIso(tz = "Europe/Prague", now = new Date()): string
```

### weekStartIso

function · `packages/core/src/time/dates.ts`

_Bez popisu._

```ts
function weekStartIso(date: string): string
```

### workingDays

function · `packages/core/src/time/dates.ts`

Pracovní dny v rozsahu včetně obou konců.

```ts
function workingDays(from: string, to: string, workDays: readonly number[] = DEFAULT_WORK_DAYS): string[]
```

### zonedToUtc

function · `packages/core/src/time/dates.ts`

Místní datum a čas v zóně → okamžik (UTC). Správně zvládá letní čas; neexistující hodinu (jarní skok) posune dopředu
a nejednoznačnou (podzimní) bere jako první výskyt.

```ts
function zonedToUtc(date: string, time: string, tz = "Europe/Prague"): Date
```

### DEFAULT_WORK_DAYS

const · `packages/core/src/time/dates.ts`

_Bez popisu._

```ts
const DEFAULT_WORK_DAYS: readonly number[]
```
