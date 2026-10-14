# @rebar/stroje/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/stroje/server` (soubor `packages/modules/stroje/src/server.ts`). Exportů: 48, z toho s popisem 22.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`checkFuel`](#checkfuel) | function | Kontrola tankování: stroj tankuje, litry sedí na nádrž a je zadaný stav tachometru. |  |
| [`checkLog`](#checklog) | function | Zkontroluje zápis do knihy jízd / provozu a vrátí ujeté km nebo odpracované motohodiny. |  |
| [`consumption`](#consumption) | function | Spotřeba mezi plnými nádržemi: litry od předchozí plné (bez ní) až po tuto plnou děleno ujetou vzdáleností. Vrací spotřebu u každého tankování, které je plné a má předchozí plné (l/100 km, u strojů l/mth), a průměr. Průměr je vážený ujetou vzdáleností (všechny litry děleno všemi kilometry), ne aritmetický průměr jednotlivých spotřeb: krátký úsek s vysokou spotřebou by jinak zkreslil celek stejně jako dlouhý. |  |
| [`consumptionUnit`](#consumptionunit) | function |  |  |
| [`deadlineReminders`](#deadlinereminders) | function | Které připomínky mají dnes u stroje vzniknout: termíny STK, ručení a známky (30 dní předem, 7 dní, po termínu) a servisní intervaly (blíží se / překročeno). Čistá funkce. |  |
| [`deadlineState`](#deadlinestate) | function | Stav termínu (STK, pojištění…): po termínu / do 30 dní / v pořádku. |  |
| [`deadlinesFor`](#deadlinesfor) | function | Termíny, které se u daného druhu hlídají. |  |
| [`formatMeter`](#formatmeter) | function |  |  |
| [`hasRegistration`](#hasregistration) | function | Má SPZ → hlídá se STK a povinné ručení (u přívěsu bez dálniční známky). |  |
| [`intervalDue`](#intervaldue) | function | Kdy je servisní interval na řadě: podle stavu tachometru nebo data, co nastane dřív. |  |
| [`intervalText`](#intervaltext) | function | „zbývá 320 km“, „překročeno o 40 mth“, „za 12 dní“: to, co je u intervalu naléhavější. |  |
| [`kindLabel`](#kindlabel) | function |  |  |
| [`meterUnit`](#meterunit) | function |  |  |
| [`netOfVat`](#netofvat) | function | Cena paliva bez DPH z částky na účtence (v haléřích). |  |
| [`sendDeadlineReminders`](#senddeadlinereminders) | function | Denní kontrola termínů a servisních intervalů. Příjemci: odpovědná osoba stroje a správci vozového parku (podle pravidel události). Zabrání klíče a upozornění běží v jedné transakci, takže se připomínka neztratí. |  |
| [`sendReservationReminders`](#sendreservationreminders) | function | Odpoledne před začátkem rezervace: obsluha dostane připomínku (jednou na rezervaci a datum začátku). |  |
| [`stageOf`](#stageof) | function | Stupeň upozornění na termín: do 30 dní, do 7 dní, po termínu; každý se pošle jen jednou. |  |
| [`worstTone`](#worsttone) | function | Nejhorší tón ze seznamu (pro odznak na kartě). |  |
| [`FleetError`](#fleeterror) | class | Čistá logika vozového parku bez databáze: číselníky, termíny, servisní intervaly, spotřeba a kontrola zápisů. Stavy tachometru jsou čísla (jedno desetinné místo); datum je vždy `YYYY-MM-DD` a „dnes“ se předává zvenku. |  |
| [`ASSET_KINDS`](#asset_kinds) | const |  |  |
| [`ASSET_KIND_VALUES`](#asset_kind_values) | const |  |  |
| [`ASSET_STATUSES`](#asset_statuses) | const |  |  |
| [`DEADLINES`](#deadlines) | const |  |  |
| [`FUELS`](#fuels) | const |  |  |
| [`FUEL_VALUES`](#fuel_values) | const |  |  |
| [`SERVICE_KINDS`](#service_kinds) | const |  |  |
| [`SERVICE_KIND_VALUES`](#service_kind_values) | const |  |  |
| [`asset`](schema.md#asset) | const | Vozidlo nebo stroj. Měří se v km (auta) nebo motohodinách (stroje); `meterValue` je poslední známý stav. `internalRateMinor` je interní sazba za km nebo motohodinu, kterou se stroj počítá do nákladů zakázky. Zakázka (v knize jízd, tankování, rezervaci) je měkký odkaz bez cizího klíče, aby modul fungoval i bez Zakázek. | v `@rebar/stroje/schema` |
| [`assetDefect`](schema.md#assetdefect) | const | Závada nahlášená z terénu. Blokující závada stroj odstaví (`asset.status = service`), dokud není vyřešena. | v `@rebar/stroje/schema` |
| [`assetEntity`](#assetentity) | const |  |  |
| [`assetFuel`](schema.md#assetfuel) | const |  | v `@rebar/stroje/schema` |
| [`assetInterval`](schema.md#assetinterval) | const | Servisní interval: každých X km/mth nebo Y měsíců (co nastane dřív). | v `@rebar/stroje/schema` |
| [`assetLog`](schema.md#assetlog) | const | Kniha jízd (km) i provoz strojů (motohodiny) v jedné tabulce. | v `@rebar/stroje/schema` |
| [`assetReservation`](schema.md#assetreservation) | const |  | v `@rebar/stroje/schema` |
| [`assetService`](schema.md#assetservice) | const |  | v `@rebar/stroje/schema` |
| [`commands`](#commands) | const |  |  |
| [`defectEntity`](#defectentity) | const |  |  |
| [`entities`](#entities) | const |  |  |
| [`server`](#server) | const |  |  |
| [`AssetKind`](#assetkind) | type |  |  |
| [`DeadlineKey`](#deadlinekey) | type |  |  |
| [`DeadlineReminder`](#deadlinereminder) | type | Jedna připomínka k odeslání. `token` je klíč idempotence: stroj + termín + datum + stupeň. |  |
| [`IntervalDue`](#intervaldue) | type |  |  |
| [`IntervalInput`](#intervalinput) | type |  |  |
| [`LogInput`](#loginput) | type |  |  |
| [`ReminderAsset`](#reminderasset) | type | Stroj tak, jak ho potřebuje rozhodování o připomínkách. |  |
| [`ReminderInterval`](#reminderinterval) | type | Servisní interval stroje. |  |
| [`Tone`](#tone) | type |  |  |

### checkFuel

function · `packages/modules/stroje/src/fleet.ts`

Kontrola tankování: stroj tankuje, litry sedí na nádrž a je zadaný stav tachometru.

```ts
function checkFuel(i: { fuel: string; meter: string; tankLiters: number | null; liters: number; meterValue: number | null; /** Datum tankování, „dnes“ a poslední známý stav stroje; bez nich se pořadí stavů nekontroluje. */ date?: string; today?: string; currentMeter?: number; }): void
```

### checkLog

function · `packages/modules/stroje/src/fleet.ts`

Zkontroluje zápis do knihy jízd / provozu a vrátí ujeté km nebo odpracované motohodiny.

```ts
function checkLog(i: LogInput): number
```

### consumption

function · `packages/modules/stroje/src/fleet.ts`

Spotřeba mezi plnými nádržemi: litry od předchozí plné (bez ní) až po tuto plnou děleno ujetou vzdáleností.
Vrací spotřebu u každého tankování, které je plné a má předchozí plné (l/100 km, u strojů l/mth), a průměr.
Průměr je vážený ujetou vzdáleností (všechny litry děleno všemi kilometry), ne aritmetický průměr jednotlivých
spotřeb: krátký úsek s vysokou spotřebou by jinak zkreslil celek stejně jako dlouhý.

```ts
function consumption<T extends { id: string; liters: number; meterValue: number | null; fullTank: boolean }>(fuel: readonly T[], meter: string): { perFuel: Map<string, number>; avg: number | null }
```

### consumptionUnit

function · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
function consumptionUnit(meter: string): "l/100 km" | "l/mth"
```

### deadlineReminders

function · `packages/modules/stroje/src/notices.ts`

Které připomínky mají dnes u stroje vzniknout: termíny STK, ručení a známky (30 dní předem, 7 dní, po termínu)
a servisní intervaly (blíží se / překročeno). Čistá funkce.

```ts
function deadlineReminders(a: ReminderAsset, intervals: readonly ReminderInterval[], today: string): DeadlineReminder[]
```

### deadlineState

function · `packages/modules/stroje/src/fleet.ts`

Stav termínu (STK, pojištění…): po termínu / do 30 dní / v pořádku.

```ts
function deadlineState(date: string | null | undefined, today: string): { tone: Tone; days: number | null; text: string }
```

### deadlinesFor

function · `packages/modules/stroje/src/fleet.ts`

Termíny, které se u daného druhu hlídají.

```ts
function deadlinesFor(kind: string): ({ readonly key: "stkDate"; readonly label: "STK a emise"; readonly skipTrailer: false; } | { readonly key: "insuranceDate"; readonly label: "Povinné ručení"; readonly skipTrailer: false; } | { readonly key: "vignetteDate"; readonly label:…
```

### formatMeter

function · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
function formatMeter(value: number | string | null | undefined, meter: string): string
```

### hasRegistration

function · `packages/modules/stroje/src/fleet.ts`

Má SPZ → hlídá se STK a povinné ručení (u přívěsu bez dálniční známky).

```ts
function hasRegistration(kind: string): boolean
```

### intervalDue

function · `packages/modules/stroje/src/fleet.ts`

Kdy je servisní interval na řadě: podle stavu tachometru nebo data, co nastane dřív.

```ts
function intervalDue(iv: IntervalInput, meterValue: number, today: string): IntervalDue
```

### intervalText

function · `packages/modules/stroje/src/fleet.ts`

„zbývá 320 km“, „překročeno o 40 mth“, „za 12 dní“: to, co je u intervalu naléhavější.

```ts
function intervalText(due: IntervalDue, meter: string): string
```

### kindLabel

function · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
function kindLabel(v: string): string
```

### meterUnit

function · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
function meterUnit(meter: string): "km" | "mth"
```

### netOfVat

function · `packages/modules/stroje/src/fleet.ts`

Cena paliva bez DPH z částky na účtence (v haléřích).

```ts
function netOfVat(grossMinor: number, vatRate: number): number
```

### sendDeadlineReminders

function · `packages/modules/stroje/src/notices.ts`

Denní kontrola termínů a servisních intervalů. Příjemci: odpovědná osoba stroje a správci vozového parku
(podle pravidel události). Zabrání klíče a upozornění běží v jedné transakci, takže se připomínka neztratí.

```ts
async function sendDeadlineReminders(db: Executor, now = new Date()): Promise<{ sent: number }>
```

### sendReservationReminders

function · `packages/modules/stroje/src/notices.ts`

Odpoledne před začátkem rezervace: obsluha dostane připomínku (jednou na rezervaci a datum začátku).

```ts
async function sendReservationReminders(db: Executor, now = new Date()): Promise<{ sent: number }>
```

### stageOf

function · `packages/modules/stroje/src/notices.ts`

Stupeň upozornění na termín: do 30 dní, do 7 dní, po termínu; každý se pošle jen jednou.

```ts
function stageOf(days: number | null): "overdue" | "7" | "30" | null
```

### worstTone

function · `packages/modules/stroje/src/fleet.ts`

Nejhorší tón ze seznamu (pro odznak na kartě).

```ts
function worstTone(tones: readonly Tone[]): Tone
```

### FleetError

class · `packages/modules/stroje/src/fleet.ts`

Čistá logika vozového parku bez databáze: číselníky, termíny, servisní intervaly, spotřeba a kontrola zápisů.
Stavy tachometru jsou čísla (jedno desetinné místo); datum je vždy `YYYY-MM-DD` a „dnes“ se předává zvenku.

```ts
class FleetError extends Error {

}
```

### ASSET_KINDS

const · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
const ASSET_KINDS: readonly [{ readonly value: "car"; readonly label: "Osobní auto"; readonly meter: "km"; }, { readonly value: "van"; readonly label: "Dodávka"; readonly meter: "km"; }, { readonly value: "truck"; readonly label: "Nákladní auto"; readonly me…
```

### ASSET_KIND_VALUES

const · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
const ASSET_KIND_VALUES: ["small" | "truck" | "van" | "car" | "trailer" | "excavator" | "loader" | "roller", ...("small" | "truck" | "van" | "car" | "trailer" | "excavator" | "loader" | "roller")[]]
```

### ASSET_STATUSES

const · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
const ASSET_STATUSES: readonly [{ readonly value: "active"; readonly label: "V provozu"; readonly color: "green"; }, { readonly value: "service"; readonly label: "V servisu"; readonly color: "orange"; }, { readonly value: "retired"; readonly label: "Vyřazeno"; …
```

### DEADLINES

const · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
const DEADLINES: readonly [{ readonly key: "stkDate"; readonly label: "STK a emise"; readonly skipTrailer: false; }, { readonly key: "insuranceDate"; readonly label: "Povinné ručení"; readonly skipTrailer: false; }, { readonly key: "vignetteDate"; readonly…
```

### FUELS

const · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
const FUELS: readonly [{ readonly value: "diesel"; readonly label: "Nafta"; }, { readonly value: "petrol"; readonly label: "Benzín"; }, { readonly value: "lpg"; readonly label: "LPG"; }, { readonly value: "electric"; readonly label: "Elektro"; }, { rea…
```

### FUEL_VALUES

const · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
const FUEL_VALUES: [string, ...string[]]
```

### SERVICE_KINDS

const · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
const SERVICE_KINDS: readonly [{ readonly value: "service"; readonly label: "Pravidelný servis"; }, { readonly value: "repair"; readonly label: "Oprava"; }, { readonly value: "tires"; readonly label: "Pneumatiky"; }, { readonly value: "inspection"; readonly la…
```

### SERVICE_KIND_VALUES

const · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
const SERVICE_KIND_VALUES: [string, ...string[]]
```

### assetEntity

const · `packages/modules/stroje/src/entities.ts`

_Bez popisu._

```ts
const assetEntity: import("@rebar/core/entities").EntityDef
```

### commands

const · `packages/modules/stroje/src/commands.ts`

_Bez popisu._

```ts
const commands: (import("@rebar/core/module-server").CommandDef<z.ZodObject<{ includeRetired: z.ZodOptional<z.ZodBoolean>; }, z.core.$strip>, { today: string; assets: { deadlines: { tone: Tone; days: number | null; text: string; key: "stkDate" | "insuranc…
```

### defectEntity

const · `packages/modules/stroje/src/entities.ts`

_Bez popisu._

```ts
const defectEntity: import("@rebar/core/entities").EntityDef
```

### entities

const · `packages/modules/stroje/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### server

const · `packages/modules/stroje/src/server.ts`

_Bez popisu._

```ts
const server: { readonly entities: import("@rebar/core/entities").EntityDef[]; readonly commands: (import("@rebar/core/module-server").CommandDef<z.ZodObject<{ includeRetired: z.ZodOptional<z.ZodBoolean>; }, z.core.$strip>, { today: string; assets: { de…
```

### AssetKind

type · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
type AssetKind = (typeof ASSET_KINDS)[number]["value"];
```

### DeadlineKey

type · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
type DeadlineKey = (typeof DEADLINES)[number]["key"];
```

### DeadlineReminder

type · `packages/modules/stroje/src/notices.ts`

Jedna připomínka k odeslání. `token` je klíč idempotence: stroj + termín + datum + stupeň.

```ts
type DeadlineReminder = {
  assetId: string;
  assetName: string;
  /** Naléhavé: do 7 dní, po termínu, překročený interval. */
  urgent: boolean;
  what: string;
  detail: string;
  token: string;
};
```

### IntervalDue

type · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
type IntervalDue = {
  meterLeft: number | null;
  daysLeft: number | null;
  dueDate: string | null;
  tone: "overdue" | "soon" | "ok";
};
```

### IntervalInput

type · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
type IntervalInput = {
  everyMeter: number | null;
  everyMonths: number | null;
  lastDate: string | null;
  lastMeter: number | null;
};
```

### LogInput

type · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
type LogInput = {
  meter: string;
  date: string;
  today: string;
  currentMeter: number;
  meterStart: number | null;
  meterEnd: number | null;
  amount: number | null;
  private: boolean;
  purpose: string | null;
  jobId: string | null;
};
```

### ReminderAsset

type · `packages/modules/stroje/src/notices.ts`

Stroj tak, jak ho potřebuje rozhodování o připomínkách.

```ts
type ReminderAsset = {
  id: string;
  name: string;
  kind: string;
  plate: string | null;
  meter: string;
  meterValue: string | number;
  stkDate: string | null;
  insuranceDate: string | null;
  vignetteDate: string | null;
};
```

### ReminderInterval

type · `packages/modules/stroje/src/notices.ts`

Servisní interval stroje.

```ts
type ReminderInterval = {
  id: string;
  assetId: string;
  title: string;
  everyMeter: number | null;
  everyMonths: number | null;
  lastDate: string | null;
  lastMeter: string | number | null;
};
```

### Tone

type · `packages/modules/stroje/src/fleet.ts`

_Bez popisu._

```ts
type Tone = "none" | "overdue" | "soon" | "ok";
```
