# @rebar/ukoly/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/ukoly/api` (soubor `packages/modules/ukoly/src/api.ts`). Exportů: 28, z toho s popisem 28.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`dueState`](#duestate) | function | Stav termínu: hotový/zrušený úkol je `done`, bez data `nodate`, den v minulosti `overdue`, dnes `today` (úkol s časem je po termínu, jakmile čas uplyne), jinak `future`. |  |
| [`formatDue`](#formatdue) | function | Termín česky: „Dnes 14:30“, „Zítra“, „Pá 9:00“, „12. 10.“ (bez času jen den). |  |
| [`formatDuration`](#formatduration) | function | Z minut „90“ → „1 h 30 min“. |  |
| [`isOverdue`](#isoverdue) | function | Je úkol (otevřený) po termínu? |  |
| [`normalizeTime`](#normalizetime) | function | Čas z databáze („10:00:00“) nebo formuláře → „HH:mm“; prázdné a neplatné je `null`. |  |
| [`parseQuickTask`](#parsequicktask) | function | Rozebere rychlé zadání. `now` je „teď“ (rozhoduje o „zítra“, „v pátek“, uplynulém času), `types` jsou typy úkolů z Nastavení (výchozí je pět systémových). Nikdy nevyhodí chybu: co nepozná, zůstane v názvu. |  |
| [`suggestNextDue`](#suggestnextdue) | function | Návrh termínu další aktivity po dokončení: nejbližší pracovní den po pozdějším z dneška a termínu dokončené aktivity, ve stejnou hodinu (bez času zůstane bez času). |  |
| [`taskEnd`](#taskend) | function | Konec úkolu s časem: začátek + délka (výchozí 30 minut); bez času nic. Vrací `{ date, time }` pražského času. |  |
| [`ATTENDEE_KINDS`](#attendee_kinds) | const | Druh účastníka úkolu/schůzky: uživatel systému, kontakt, nebo prosté e-mailové adresy. |  |
| [`CLOSED_STATUSES`](#closed_statuses) | const | Uzavřené stavy (hotovo nebo zrušeno). |  |
| [`OPEN_STATUSES`](#open_statuses) | const | Otevřené stavy (úkol se ještě řeší). |  |
| [`SYSTEM_TYPES`](#system_types) | const | Výchozí (seedované) typy aktivit: Úkol, Hovor, Schůzka, E-mail, Termín. |  |
| [`SYSTEM_TYPE_KEYS`](#system_type_keys) | const | Klíče systémových typů (seed). Systémový typ nejde smazat ani přejmenovat jeho klíč. |  |
| [`TASK_PRIORITIES`](#task_priorities) | const | Priorita úkolu: Žádná, Nízká, Střední, Vysoká, Urgentní. |  |
| [`TASK_PRIORITY_LABELS`](#task_priority_labels) | const | Popisky priorit úkolu. |  |
| [`TASK_STATUSES`](#task_statuses) | const | Stav úkolu: K řešení, Probíhá, Hotovo, Zrušeno. |  |
| [`TASK_STATUS_LABELS`](#task_status_labels) | const | Popisky stavů úkolu. |  |
| [`TASK_VIEWS`](#task_views) | const | Pohledy „Moje úkoly“ (UKO-04). |  |
| [`TASK_VIEW_LABELS`](#task_view_labels) | const | Popisky pohledů. |  |
| [`AttendeeKind`](#attendeekind) | type | Druh účastníka. |  |
| [`DueState`](#duestate) | type | Stav termínu úkolu vůči „teď“. |  |
| [`QuickTaskParse`](#quicktaskparse) | type | Výsledek rozboru rychlého zadání. |  |
| [`QuickTaskToken`](#quicktasktoken) | type | Jedna rozpoznaná část textu (pro náhled „co systém rozpoznal“). |  |
| [`QuickTaskType`](#quicktasktype) | type | Typ úkolu, jak ho parser potřebuje znát (klíč a název z Nastavení). |  |
| [`SystemTypeKey`](#systemtypekey) | type | Klíč systémového typu. |  |
| [`TaskPriority`](#taskpriority) | type | Priorita úkolu. |  |
| [`TaskStatus`](#taskstatus) | type | Stav úkolu. |  |
| [`TaskView`](#taskview) | type | Pohled „Moje úkoly“: Dnes (vč. po termínu), Nadcházejících 7 dní, Bez termínu, Delegované, Hotové, Vše. |  |

### dueState

function · `packages/modules/ukoly/src/tasks/logic/due.ts`

Stav termínu: hotový/zrušený úkol je `done`, bez data `nodate`, den v minulosti `overdue`, dnes `today`
(úkol s časem je po termínu, jakmile čas uplyne), jinak `future`.

```ts
function dueState(t: { status: TaskStatus | string; dueDate: string | null | undefined; dueTime?: string | null | undefined; }, now: Date = new Date()): DueState
```

### formatDue

function · `packages/modules/ukoly/src/tasks/logic/due.ts`

Termín česky: „Dnes 14:30“, „Zítra“, „Pá 9:00“, „12. 10.“ (bez času jen den).

```ts
function formatDue(dueDate: string | null | undefined, dueTime: string | null | undefined, now: Date = new Date()): string
```

### formatDuration

function · `packages/modules/ukoly/src/tasks/logic/due.ts`

Z minut „90“ → „1 h 30 min“.

```ts
function formatDuration(min: number | null | undefined): string
```

### isOverdue

function · `packages/modules/ukoly/src/tasks/logic/due.ts`

Je úkol (otevřený) po termínu?

```ts
function isOverdue(t: Parameters<typeof dueState>[0], now: Date = new Date()): boolean
```

### normalizeTime

function · `packages/modules/ukoly/src/tasks/logic/due.ts`

Čas z databáze („10:00:00“) nebo formuláře → „HH:mm“; prázdné a neplatné je `null`.

```ts
function normalizeTime(v: string | null | undefined): string | null
```

### parseQuickTask

function · `packages/modules/ukoly/src/tasks/logic/quick-parse.ts`

Rozebere rychlé zadání. `now` je „teď“ (rozhoduje o „zítra“, „v pátek“, uplynulém času), `types` jsou typy úkolů
z Nastavení (výchozí je pět systémových). Nikdy nevyhodí chybu: co nepozná, zůstane v názvu.

```ts
function parseQuickTask(text: string, now: Date = new Date(), types: readonly QuickTaskType[] = DEFAULT_TYPES): QuickTaskParse
```

### suggestNextDue

function · `packages/modules/ukoly/src/tasks/logic/due.ts`

Návrh termínu další aktivity po dokončení: nejbližší pracovní den po pozdějším z dneška a termínu dokončené
aktivity, ve stejnou hodinu (bez času zůstane bez času).

```ts
function suggestNextDue(prev: { dueDate: string | null | undefined; dueTime?: string | null | undefined }, now: Date = new Date()): { dueDate: string; dueTime: string | null }
```

### taskEnd

function · `packages/modules/ukoly/src/tasks/logic/due.ts`

Konec úkolu s časem: začátek + délka (výchozí 30 minut); bez času nic. Vrací `{ date, time }` pražského času.

```ts
function taskEnd(t: { dueDate: string; dueTime: string | null; durationMin: number | null; }): { date: string; time: string } | null
```

### ATTENDEE_KINDS

const · `packages/modules/ukoly/src/tasks/constants.ts`

Druh účastníka úkolu/schůzky: uživatel systému, kontakt, nebo prosté e-mailové adresy.

```ts
const ATTENDEE_KINDS: readonly ["user", "person", "email"]
```

### CLOSED_STATUSES

const · `packages/modules/ukoly/src/tasks/constants.ts`

Uzavřené stavy (hotovo nebo zrušeno).

```ts
const CLOSED_STATUSES: readonly ["done", "canceled"]
```

### OPEN_STATUSES

const · `packages/modules/ukoly/src/tasks/constants.ts`

Otevřené stavy (úkol se ještě řeší).

```ts
const OPEN_STATUSES: readonly ["todo", "in_progress"]
```

### SYSTEM_TYPES

const · `packages/modules/ukoly/src/tasks/constants.ts`

Výchozí (seedované) typy aktivit: Úkol, Hovor, Schůzka, E-mail, Termín.

```ts
const SYSTEM_TYPES: readonly { key: SystemTypeKey; name: string; icon: string; color: string; isCalendarEvent: boolean; position: number; }[]
```

### SYSTEM_TYPE_KEYS

const · `packages/modules/ukoly/src/tasks/constants.ts`

Klíče systémových typů (seed). Systémový typ nejde smazat ani přejmenovat jeho klíč.

```ts
const SYSTEM_TYPE_KEYS: readonly ["task", "call", "meeting", "email", "deadline"]
```

### TASK_PRIORITIES

const · `packages/modules/ukoly/src/tasks/constants.ts`

Priorita úkolu: Žádná, Nízká, Střední, Vysoká, Urgentní.

```ts
const TASK_PRIORITIES: readonly ["none", "low", "medium", "high", "urgent"]
```

### TASK_PRIORITY_LABELS

const · `packages/modules/ukoly/src/tasks/constants.ts`

Popisky priorit úkolu.

```ts
const TASK_PRIORITY_LABELS: Record<TaskPriority, string>
```

### TASK_STATUSES

const · `packages/modules/ukoly/src/tasks/constants.ts`

Stav úkolu: K řešení, Probíhá, Hotovo, Zrušeno.

```ts
const TASK_STATUSES: readonly ["todo", "in_progress", "done", "canceled"]
```

### TASK_STATUS_LABELS

const · `packages/modules/ukoly/src/tasks/constants.ts`

Popisky stavů úkolu.

```ts
const TASK_STATUS_LABELS: Record<TaskStatus, string>
```

### TASK_VIEWS

const · `packages/modules/ukoly/src/tasks/constants.ts`

Pohledy „Moje úkoly“ (UKO-04).

```ts
const TASK_VIEWS: readonly ["today", "next7", "nodate", "delegated", "done", "all"]
```

### TASK_VIEW_LABELS

const · `packages/modules/ukoly/src/tasks/constants.ts`

Popisky pohledů.

```ts
const TASK_VIEW_LABELS: Record<TaskView, string>
```

### AttendeeKind

type · `packages/modules/ukoly/src/tasks/constants.ts`

Druh účastníka.

```ts
type AttendeeKind = (typeof ATTENDEE_KINDS)[number];
```

### DueState

type · `packages/modules/ukoly/src/tasks/logic/due.ts`

Stav termínu úkolu vůči „teď“.

```ts
type DueState = "done" | "overdue" | "today" | "future" | "nodate";
```

### QuickTaskParse

type · `packages/modules/ukoly/src/tasks/logic/quick-parse.ts`

Výsledek rozboru rychlého zadání.

```ts
type QuickTaskParse = {
  /** Název bez rozpoznaných částí, s velkým počátečním písmenem; prázdný, když zbylo jen datum a čas. */
  title: string;
  typeKey: string;
  dueDate: string | null;
  dueTime: string | null;
  durationMin: number | null;
  priority: TaskPriority;
  recognized: QuickTaskToken[];
};
```

### QuickTaskToken

type · `packages/modules/ukoly/src/tasks/logic/quick-parse.ts`

Jedna rozpoznaná část textu (pro náhled „co systém rozpoznal“).

```ts
type QuickTaskToken = {
  kind: "type" | "date" | "time" | "duration" | "priority";
  /** Co uživatel napsal. */
  text: string;
  /** Jak tomu systém rozumí („Hovor“, „zítra (čt 15. 10.)“, „10:00“). */
  label: string;
};
```

### QuickTaskType

type · `packages/modules/ukoly/src/tasks/logic/quick-parse.ts`

Typ úkolu, jak ho parser potřebuje znát (klíč a název z Nastavení).

```ts
type QuickTaskType = { key: string; name: string };
```

### SystemTypeKey

type · `packages/modules/ukoly/src/tasks/constants.ts`

Klíč systémového typu.

```ts
type SystemTypeKey = (typeof SYSTEM_TYPE_KEYS)[number];
```

### TaskPriority

type · `packages/modules/ukoly/src/tasks/constants.ts`

Priorita úkolu.

```ts
type TaskPriority = (typeof TASK_PRIORITIES)[number];
```

### TaskStatus

type · `packages/modules/ukoly/src/tasks/constants.ts`

Stav úkolu.

```ts
type TaskStatus = (typeof TASK_STATUSES)[number];
```

### TaskView

type · `packages/modules/ukoly/src/tasks/constants.ts`

Pohled „Moje úkoly“: Dnes (vč. po termínu), Nadcházejících 7 dní, Bez termínu, Delegované, Hotové, Vše.

```ts
type TaskView = (typeof TASK_VIEWS)[number];
```
