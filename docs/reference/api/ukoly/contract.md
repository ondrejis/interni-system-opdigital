# @rebar/ukoly/contract

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/ukoly/contract` (soubor `packages/modules/ukoly/src/contract.ts`). Exportů: 61, z toho s popisem 61.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ATTENDEE_KINDS`](api.md#attendee_kinds) | const | Druh účastníka úkolu/schůzky: uživatel systému, kontakt, nebo prosté e-mailové adresy. | v `@rebar/ukoly/api` |
| [`CLOSED_STATUSES`](api.md#closed_statuses) | const | Uzavřené stavy (hotovo nebo zrušeno). | v `@rebar/ukoly/api` |
| [`OPEN_STATUSES`](api.md#open_statuses) | const | Otevřené stavy (úkol se ještě řeší). | v `@rebar/ukoly/api` |
| [`SYSTEM_TYPES`](api.md#system_types) | const | Výchozí (seedované) typy aktivit: Úkol, Hovor, Schůzka, E-mail, Termín. | v `@rebar/ukoly/api` |
| [`SYSTEM_TYPE_KEYS`](api.md#system_type_keys) | const | Klíče systémových typů (seed). Systémový typ nejde smazat ani přejmenovat jeho klíč. | v `@rebar/ukoly/api` |
| [`TASK_PRIORITIES`](api.md#task_priorities) | const | Priorita úkolu: Žádná, Nízká, Střední, Vysoká, Urgentní. | v `@rebar/ukoly/api` |
| [`TASK_PRIORITY_LABELS`](api.md#task_priority_labels) | const | Popisky priorit úkolu. | v `@rebar/ukoly/api` |
| [`TASK_SORTS`](#task_sorts) | const | Třídění seznamu úkolů. |  |
| [`TASK_STATUSES`](api.md#task_statuses) | const | Stav úkolu: K řešení, Probíhá, Hotovo, Zrušeno. | v `@rebar/ukoly/api` |
| [`TASK_STATUS_LABELS`](api.md#task_status_labels) | const | Popisky stavů úkolu. | v `@rebar/ukoly/api` |
| [`TASK_VIEWS`](api.md#task_views) | const | Pohledy „Moje úkoly“ (UKO-04). | v `@rebar/ukoly/api` |
| [`TASK_VIEW_LABELS`](api.md#task_view_labels) | const | Popisky pohledů. | v `@rebar/ukoly/api` |
| [`assignTaskInput`](#assigntaskinput) | const | `ukoly.assign`: přiřazení řešitele (soukromý úkol nejde přiřadit uživateli bez práva na soukromé). |  |
| [`attendeeSchema`](#attendeeschema) | const | Účastník úkolu nebo schůzky: uživatel (`ref` = id), kontakt (`ref` = id), nebo e-mail (`ref` = adresa). |  |
| [`completeTaskInput`](#completetaskinput) | const | `ukoly.complete`: dokončení; volitelně výsledek a rovnou naplánovaná další aktivita. Nic dalšího se nevytváří samo (UKO-07). |  |
| [`countsInput`](#countsinput) | const | `ukoly.counts`: počty pro záložky „Moje úkoly“. |  |
| [`createTaskInput`](#createtaskinput) | const | `ukoly.create`: nový úkol nebo aktivita. |  |
| [`deleteTaskInput`](#deletetaskinput) | const | `ukoly.delete` (do koše). |  |
| [`deleteTypeInput`](#deletetypeinput) | const | `ukoly.type.delete`: smaže vlastní typ, který žádný úkol nepoužívá. |  |
| [`getTaskInput`](#gettaskinput) | const | `ukoly.get`. |  |
| [`listTasksInput`](#listtasksinput) | const | `ukoly.list`: seznam „Moje úkoly“ (UKO-04) a obecný výpis. Seskupení dělá UI nad vrácenými řádky. |  |
| [`listTypesInput`](#listtypesinput) | const | `ukoly.type.list`: typy pro výběr (a správu v Nastavení). |  |
| [`parseTaskInput`](#parsetaskinput) | const | `ukoly.parse`: náhled rozpoznání rychlého zadání (bez uložení). |  |
| [`publishAndAssignInput`](#publishandassigninput) | const | `ukoly.publishAndAssign` (VID-06): „Zveřejnit a přiřadit“, jen vlastník soukromých záznamů. |  |
| [`quickAddInput`](#quickaddinput) | const | `ukoly.quickAdd`: rychlé přidání z jednoho řádku; pole zadaná výslovně přebijí rozpoznaná. |  |
| [`reorderTypesInput`](#reordertypesinput) | const | `ukoly.type.reorder`: pořadí typů v nabídkách. |  |
| [`rescheduleTaskInput`](#rescheduletaskinput) | const | `ukoly.reschedule`: nový termín (datum a čas), nebo odložení o dny od dneška. |  |
| [`saveTypeInput`](#savetypeinput) | const | Typ úkolu: vstup `ukoly.type.save` (klíč se po založení nemění). |  |
| [`setAttendeesInput`](#setattendeesinput) | const | `ukoly.attendees.set`: nahradí účastníky úkolu/schůzky. |  |
| [`setStatusInput`](#setstatusinput) | const | `ukoly.setStatus`: změna stavu bez nabídky výsledku (K řešení, Probíhá, Zrušeno, znovuotevření). |  |
| [`taskFieldsShape`](#taskfieldsshape) | const | Pole úkolu při zakládání a úpravě (UKO-03). |  |
| [`taskLinksShape`](#tasklinksshape) | const | Vazby úkolu (měkké odkazy): obchod, organizace, kontakt, zakázka a její fáze. |  |
| [`tasksForRecordInput`](#tasksforrecordinput) | const | `ukoly.forRecord`: úkoly u obchodu, organizace, kontaktu nebo zakázky (záložka „Úkoly a aktivity“). |  |
| [`updateTaskInput`](#updatetaskinput) | const | `ukoly.update`: změna jen zadaných polí (`null` hodnotu nebo vazbu odebere). Stav a řešitel mají vlastní příkazy. |  |
| [`AttendeeKind`](api.md#attendeekind) | type | Druh účastníka. | v `@rebar/ukoly/api` |
| [`CompleteTaskResult`](#completetaskresult) | type | Odpověď `ukoly.complete`: dokončený úkol, nabídka (výsledek a další aktivita, jen u hovoru a schůzky) a případně založená další. |  |
| [`CreateTaskInput`](#createtaskinput) | type | Vstup `ukoly.create`. |  |
| [`DueState`](api.md#duestate) | type | Stav termínu úkolu vůči „teď“. | v `@rebar/ukoly/api` |
| [`ListTasksInput`](#listtasksinput) | type | Vstup `ukoly.list`. |  |
| [`ListTasksResult`](#listtasksresult) | type | Stránka seznamu úkolů s celkovým počtem. |  |
| [`NextTaskSuggestion`](#nexttasksuggestion) | type | Návrh další aktivity po dokončení hovoru nebo schůzky (UKO-07): stejný typ a vazby, předvyplněný termín. Nic se nevytvoří. |  |
| [`ParsedQuickTask`](#parsedquicktask) | type | Náhled `ukoly.parse`: rozpoznané části a typ ze systému (ikona, název). |  |
| [`QuickAddInput`](#quickaddinput) | type | Vstup `ukoly.quickAdd`. |  |
| [`QuickAddResult`](#quickaddresult) | type | Odpověď `ukoly.quickAdd`. |  |
| [`QuickTaskParse`](api.md#quicktaskparse) | type | Výsledek rozboru rychlého zadání. | v `@rebar/ukoly/api` |
| [`QuickTaskToken`](api.md#quicktasktoken) | type | Jedna rozpoznaná část textu (pro náhled „co systém rozpoznal“). | v `@rebar/ukoly/api` |
| [`QuickTaskType`](api.md#quicktasktype) | type | Typ úkolu, jak ho parser potřebuje znát (klíč a název z Nastavení). | v `@rebar/ukoly/api` |
| [`RecordTasksResult`](#recordtasksresult) | type | Odpověď `ukoly.forRecord`. |  |
| [`SystemTypeKey`](api.md#systemtypekey) | type | Klíč systémového typu. | v `@rebar/ukoly/api` |
| [`TaskAttendee`](#taskattendee) | type | Účastník úkolu. |  |
| [`TaskCounts`](#taskcounts) | type | Odpověď `ukoly.counts`. |  |
| [`TaskDetailDto`](#taskdetaildto) | type | Úkol s podúkoly a účastníky (detail). |  |
| [`TaskDto`](#taskdto) | type | Úkol tak, jak ho dostane UI. |  |
| [`TaskLinkDto`](#tasklinkdto) | type | Odkaz na jiný záznam s názvem (jen z toho, co aktér smí vidět; soukromý nebo cizí záznam má `title: null`). |  |
| [`TaskPriority`](api.md#taskpriority) | type | Priorita úkolu. | v `@rebar/ukoly/api` |
| [`TaskSort`](#tasksort) | type | Třídění seznamu úkolů. |  |
| [`TaskStatus`](api.md#taskstatus) | type | Stav úkolu. | v `@rebar/ukoly/api` |
| [`TaskTypeDto`](#tasktypedto) | type | Typ úkolu pro UI (ikona a barva z Nastavení). |  |
| [`TaskView`](api.md#taskview) | type | Pohled „Moje úkoly“: Dnes (vč. po termínu), Nadcházejících 7 dní, Bez termínu, Delegované, Hotové, Vše. | v `@rebar/ukoly/api` |
| [`TaskViewCount`](#taskviewcount) | type | Nabídka pohledů pro UI (kód pohledu → počet). |  |
| [`UpdateTaskInput`](#updatetaskinput) | type | Vstup `ukoly.update`. |  |

### TASK_SORTS

const · `packages/modules/ukoly/src/contract.ts`

Třídění seznamu úkolů.

```ts
const TASK_SORTS: readonly ["due", "priority", "created", "title", "updated"]
```

### assignTaskInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.assign`: přiřazení řešitele (soukromý úkol nejde přiřadit uživateli bez práva na soukromé).

```ts
const assignTaskInput: z.ZodObject<{ id: z.ZodUUID; assigneeId: z.ZodNullable<z.ZodUUID>; }, z.core.$strip>
```

### attendeeSchema

const · `packages/modules/ukoly/src/contract.ts`

Účastník úkolu nebo schůzky: uživatel (`ref` = id), kontakt (`ref` = id), nebo e-mail (`ref` = adresa).

```ts
const attendeeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{ kind: z.ZodLiteral<"user">; ref: z.ZodUUID; }, z.core.$strip>, z.ZodObject<{ kind: z.ZodLiteral<"person">; ref: z.ZodUUID; }, z.core.$strip>, z.ZodObject<{ kind: z.ZodLiteral<"email">; ref: z.ZodEmail…
```

### completeTaskInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.complete`: dokončení; volitelně výsledek a rovnou naplánovaná další aktivita. Nic dalšího se nevytváří samo (UKO-07).

```ts
const completeTaskInput: z.ZodObject<{ id: z.ZodUUID; outcome: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null | undefined, string | null | undefined>>; next: z.ZodOptional<z.ZodNullable<z.ZodObject<{ outcome: z.ZodPipe<z.ZodOptio…
```

### countsInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.counts`: počty pro záložky „Moje úkoly“.

```ts
const countsInput: z.ZodObject<{}, z.core.$strip>
```

### createTaskInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.create`: nový úkol nebo aktivita.

```ts
const createTaskInput: z.ZodObject<{ outcome: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null | undefined, string | null | undefined>>; done: z.ZodOptional<z.ZodBoolean>; tags: z.ZodOptional<z.ZodArray<z.ZodString>>; attendees: …
```

### deleteTaskInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.delete` (do koše).

```ts
const deleteTaskInput: z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>
```

### deleteTypeInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.type.delete`: smaže vlastní typ, který žádný úkol nepoužívá.

```ts
const deleteTypeInput: z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>
```

### getTaskInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.get`.

```ts
const getTaskInput: z.ZodObject<{ id: z.ZodUUID; }, z.core.$strip>
```

### listTasksInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.list`: seznam „Moje úkoly“ (UKO-04) a obecný výpis. Seskupení dělá UI nad vrácenými řádky.

```ts
const listTasksInput: z.ZodObject<{ view: z.ZodOptional<z.ZodEnum<{ all: "all"; today: "today"; done: "done"; next7: "next7"; nodate: "nodate"; delegated: "delegated"; }>>; scope: z.ZodOptional<z.ZodEnum<{ all: "all"; mine: "mine"; }>>; assigneeId: z.ZodOptiona…
```

### listTypesInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.type.list`: typy pro výběr (a správu v Nastavení).

```ts
const listTypesInput: z.ZodObject<{}, z.core.$strip>
```

### parseTaskInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.parse`: náhled rozpoznání rychlého zadání (bez uložení).

```ts
const parseTaskInput: z.ZodObject<{ text: z.ZodString; }, z.core.$strip>
```

### publishAndAssignInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.publishAndAssign` (VID-06): „Zveřejnit a přiřadit“, jen vlastník soukromých záznamů.

```ts
const publishAndAssignInput: z.ZodObject<{ id: z.ZodUUID; assigneeId: z.ZodUUID; }, z.core.$strip>
```

### quickAddInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.quickAdd`: rychlé přidání z jednoho řádku; pole zadaná výslovně přebijí rozpoznaná.

```ts
const quickAddInput: z.ZodObject<{ parentId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; dealId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; companyId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; personId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; jobId: z.ZodOptional<z…
```

### reorderTypesInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.type.reorder`: pořadí typů v nabídkách.

```ts
const reorderTypesInput: z.ZodObject<{ ids: z.ZodArray<z.ZodUUID>; }, z.core.$strip>
```

### rescheduleTaskInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.reschedule`: nový termín (datum a čas), nebo odložení o dny od dneška.

```ts
const rescheduleTaskInput: z.ZodObject<{ id: z.ZodUUID; dueDate: z.ZodOptional<z.ZodISODate>; dueTime: z.ZodOptional<z.ZodNullable<z.ZodString>>; durationMin: z.ZodOptional<z.ZodNullable<z.ZodNumber>>; allDay: z.ZodOptional<z.ZodBoolean>; days: z.ZodOptional<z.ZodNu…
```

### saveTypeInput

const · `packages/modules/ukoly/src/contract.ts`

Typ úkolu: vstup `ukoly.type.save` (klíč se po založení nemění).

```ts
const saveTypeInput: z.ZodObject<{ id: z.ZodOptional<z.ZodUUID>; key: z.ZodString; name: z.ZodString; icon: z.ZodOptional<z.ZodNullable<z.ZodString>>; color: z.ZodOptional<z.ZodNullable<z.ZodString>>; isCalendarEvent: z.ZodOptional<z.ZodBoolean>; position: z.Z…
```

### setAttendeesInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.attendees.set`: nahradí účastníky úkolu/schůzky.

```ts
const setAttendeesInput: z.ZodObject<{ id: z.ZodUUID; attendees: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{ kind: z.ZodLiteral<"user">; ref: z.ZodUUID; }, z.core.$strip>, z.ZodObject<{ kind: z.ZodLiteral<"person">; ref: z.ZodUUID; }, z.core.$strip>, z.ZodOb…
```

### setStatusInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.setStatus`: změna stavu bez nabídky výsledku (K řešení, Probíhá, Zrušeno, znovuotevření).

```ts
const setStatusInput: z.ZodObject<{ id: z.ZodUUID; status: z.ZodEnum<{ done: "done"; canceled: "canceled"; todo: "todo"; in_progress: "in_progress"; }>; }, z.core.$strip>
```

### taskFieldsShape

const · `packages/modules/ukoly/src/contract.ts`

Pole úkolu při zakládání a úpravě (UKO-03).

```ts
const taskFieldsShape: { tags: z.ZodOptional<z.ZodArray<z.ZodString>>; attendees: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{ kind: z.ZodLiteral<"user">; ref: z.ZodUUID; }, z.core.$strip>, z.ZodObject<{ kind: z.ZodLiteral<"person">; ref: z.Zo…
```

### taskLinksShape

const · `packages/modules/ukoly/src/contract.ts`

Vazby úkolu (měkké odkazy): obchod, organizace, kontakt, zakázka a její fáze.

```ts
const taskLinksShape: { dealId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; companyId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; personId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; jobId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; jobPhaseId: z.ZodOptional<z.ZodNullab…
```

### tasksForRecordInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.forRecord`: úkoly u obchodu, organizace, kontaktu nebo zakázky (záložka „Úkoly a aktivity“).

```ts
const tasksForRecordInput: z.ZodObject<{ dealId: z.ZodOptional<z.ZodUUID>; companyId: z.ZodOptional<z.ZodUUID>; personId: z.ZodOptional<z.ZodUUID>; jobId: z.ZodOptional<z.ZodUUID>; include: z.ZodOptional<z.ZodEnum<{ all: "all"; open: "open"; done: "done"; }>>; limit…
```

### updateTaskInput

const · `packages/modules/ukoly/src/contract.ts`

`ukoly.update`: změna jen zadaných polí (`null` hodnotu nebo vazbu odebere). Stav a řešitel mají vlastní příkazy.

```ts
const updateTaskInput: z.ZodObject<{ title: z.ZodOptional<z.ZodString>; description: z.ZodOptional<z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null | undefined, string | null | undefined>>>; outcome: z.ZodOptional<z.ZodPipe<z.Zod…
```

### CompleteTaskResult

type · `packages/modules/ukoly/src/contract.ts`

Odpověď `ukoly.complete`: dokončený úkol, nabídka (výsledek a další aktivita, jen u hovoru a schůzky) a případně založená další.

```ts
type CompleteTaskResult = {
  task: TaskDto;
  offer: { outcome: boolean; next: NextTaskSuggestion | null };
  next: TaskDto | null;
};
```

### CreateTaskInput

type · `packages/modules/ukoly/src/contract.ts`

Vstup `ukoly.create`.

```ts
type CreateTaskInput = z.input<typeof createTaskInput>;
```

### ListTasksInput

type · `packages/modules/ukoly/src/contract.ts`

Vstup `ukoly.list`.

```ts
type ListTasksInput = z.input<typeof listTasksInput>;
```

### ListTasksResult

type · `packages/modules/ukoly/src/contract.ts`

Stránka seznamu úkolů s celkovým počtem.

```ts
type ListTasksResult = { rows: TaskDto[]; total: number };
```

### NextTaskSuggestion

type · `packages/modules/ukoly/src/contract.ts`

Návrh další aktivity po dokončení hovoru nebo schůzky (UKO-07): stejný typ a vazby, předvyplněný termín. Nic se nevytvoří.

```ts
type NextTaskSuggestion = {
  typeKey: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  durationMin: number | null;
  priority: TaskPriority;
  assigneeId: string | null;
  dealId: string | null;
  companyId: string | null;
  personId: string | null;
  jobId: string | null;
  jobPhaseId: string | null;
};
```

### ParsedQuickTask

type · `packages/modules/ukoly/src/contract.ts`

Náhled `ukoly.parse`: rozpoznané části a typ ze systému (ikona, název).

```ts
type ParsedQuickTask = QuickTaskParse & {
  type: {
    key: string;
    name: string;
    icon: string | null;
    color: string | null;
    isCalendarEvent: boolean;
  };
  /** Název prázdný: po odstranění data a času nezbylo, co se má udělat. */
  needsTitle: boolean;
};
```

### QuickAddInput

type · `packages/modules/ukoly/src/contract.ts`

Vstup `ukoly.quickAdd`.

```ts
type QuickAddInput = z.input<typeof quickAddInput>;
```

### QuickAddResult

type · `packages/modules/ukoly/src/contract.ts`

Odpověď `ukoly.quickAdd`.

```ts
type QuickAddResult = { task: TaskDto; parsed: QuickTaskParse };
```

### RecordTasksResult

type · `packages/modules/ukoly/src/contract.ts`

Odpověď `ukoly.forRecord`.

```ts
type RecordTasksResult = {
  open: TaskDto[];
  done: TaskDto[];
  counts: { open: number; overdue: number; done: number };
};
```

### TaskAttendee

type · `packages/modules/ukoly/src/contract.ts`

Účastník úkolu.

```ts
type TaskAttendee = z.infer<typeof attendeeSchema>;
```

### TaskCounts

type · `packages/modules/ukoly/src/contract.ts`

Odpověď `ukoly.counts`.

```ts
type TaskCounts = {
  /** Dnes včetně po termínu (otevřené, přidělené mně). */
  today: number;
  overdue: number;
  next7: number;
  nodate: number;
  /** Zadal jsem, řeší jiný (otevřené). */
  delegated: number;
};
```

### TaskDetailDto

type · `packages/modules/ukoly/src/contract.ts`

Úkol s podúkoly a účastníky (detail).

```ts
type TaskDetailDto = TaskDto & {
  subtaskList: TaskDto[];
  attendees: (TaskAttendee & { label: string | null })[];
};
```

### TaskDto

type · `packages/modules/ukoly/src/contract.ts`

Úkol tak, jak ho dostane UI.

```ts
type TaskDto = {
  id: string;
  title: string;
  description: string | null;
  typeKey: string;
  typeName: string;
  typeIcon: string | null;
  typeColor: string | null;
  isCalendarEvent: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  createdByName: string | null;
  dueDate: string | null;
  /** „HH:mm“ pražského času, nebo `null` (termín jen dnem). */
  dueTime: string | null;
  durationMin: number | null;
  allDay: boolean;
  place: string | null;
  estimateMin: number | null;
  outcome: string | null;
  /** ISO okamžik dokončení (hotovo nebo zrušeno). */
  completedAt: string | null;
  parentId: string | null;
  /** Název nadřazeného úkolu (podúkol v plochém seznamu), je-li vidět. */
  parentTitle: string | null;
  /** Podúkoly (jen u nadřazeného úkolu): kolik jich je a kolik z nich je hotových. */
  subtasks: { total: number; done: number };
  deal: TaskLinkDto | null;
  company: TaskLinkDto | null;
  person: TaskLinkDto | null;
  job: TaskLinkDto | null;
  /** Číslo zakázky (`Z-2026-001`), je-li zakázka vidět. */
  jobNumber: string | null;
  jobPhaseId: string | null;
  /** Název fáze zakázky; `null` = úkol je ve skupině „Bez fáze“ (UKO-08). */
  jobPhaseName: string | null;
  tags: string[];
// … (zkráceno, celá deklarace je ve zdroji)
```

### TaskLinkDto

type · `packages/modules/ukoly/src/contract.ts`

Odkaz na jiný záznam s názvem (jen z toho, co aktér smí vidět; soukromý nebo cizí záznam má `title: null`).

```ts
type TaskLinkDto = { id: string; title: string | null };
```

### TaskSort

type · `packages/modules/ukoly/src/contract.ts`

Třídění seznamu úkolů.

```ts
type TaskSort = (typeof TASK_SORTS)[number];
```

### TaskTypeDto

type · `packages/modules/ukoly/src/contract.ts`

Typ úkolu pro UI (ikona a barva z Nastavení).

```ts
type TaskTypeDto = {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  color: string | null;
  isCalendarEvent: boolean;
  isSystem: boolean;
  position: number;
  /** Kolik úkolů typ používá (u správy typů). */
  usage?: number;
};
```

### TaskViewCount

type · `packages/modules/ukoly/src/contract.ts`

Nabídka pohledů pro UI (kód pohledu → počet).

```ts
type TaskViewCount = { view: TaskView; count: number };
```

### UpdateTaskInput

type · `packages/modules/ukoly/src/contract.ts`

Vstup `ukoly.update`.

```ts
type UpdateTaskInput = z.input<typeof updateTaskInput>;
```
