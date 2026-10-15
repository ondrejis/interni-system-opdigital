# @rebar/ukoly/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/ukoly/ui` (soubor `packages/modules/ukoly/src/ui.tsx`). Exportů: 12, z toho s popisem 12.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`LogComposer`](#logcomposer) | function | Rychlý zápis proběhlé aktivity (hovor, e-mail, schůzka…): rovnou hotová, s výsledkem. |  |
| [`MyTasksPage`](#mytaskspage) | function | Stránka „Moje úkoly“ (`/ukoly`). |  |
| [`NewTaskDialog`](#newtaskdialog) | function | Dialog „Nový úkol“. |  |
| [`NewTaskForm`](#newtaskform) | function | Formulář „Nový úkol“ s předvyplněnými vazbami (karta klienta, obchodu, zakázky, kontaktu); obsah dialogu. |  |
| [`PlanComposer`](#plancomposer) | function | Naplánování další aktivity (typ, název, termín, délka, řešitel) k záznamu. |  |
| [`QuickAdd`](#quickadd) | function | Rychlé přidání s živým náhledem rozpoznaného. `links` předá vazby (karta klienta, obchodu, zakázky, kontaktu). |  |
| [`RecordTasksCard`](#recordtaskscard) | function | Karta „Úkoly“ na přehledu záznamu: nejbližší otevřené kroky a odkaz na celou záložku. |  |
| [`RecordTasksPanel`](#recordtaskspanel) | function | Obsah záložky „Úkoly a aktivity“. |  |
| [`TaskDialog`](#taskdialog) | function | Dialog detailu úkolu; `onSwitch` přepne na jiný úkol (nadřazený). |  |
| [`TaskTimeline`](#tasktimeline) | function | Časová osa proběhlých aktivit od nejnovější: typ, název, kdy, kdo, výsledek. |  |
| [`TaskTypesPage`](#tasktypespage) | function | Stránka Nastavení → Typy aktivit. |  |
| [`ui`](#ui) | const | UI modulu „ukoly“ složené z oblastí. |  |

### LogComposer

function · `packages/modules/ukoly/src/ui/record-tab.tsx`

Rychlý zápis proběhlé aktivity (hovor, e-mail, schůzka…): rovnou hotová, s výsledkem.

```ts
function LogComposer({ links, onDone }: { links: ActivityLinks; onDone?: () => void }): import("react").JSX.Element
```

### MyTasksPage

function · `packages/modules/ukoly/src/ui/my-tasks.tsx`

Stránka „Moje úkoly“ (`/ukoly`).

```ts
function MyTasksPage({ query }: { query?: Record<string, string> }): import("react").JSX.Element
```

### NewTaskDialog

function · `packages/modules/ukoly/src/ui/task-dialog.tsx`

Dialog „Nový úkol“.

```ts
function NewTaskDialog({ links, typeKey, title = "Nový úkol", onClose, }: { links?: ActivityLinks; typeKey?: string; title?: string; onClose: () => void; }): import("react").JSX.Element
```

### NewTaskForm

function · `packages/modules/ukoly/src/ui/task-dialog.tsx`

Formulář „Nový úkol“ s předvyplněnými vazbami (karta klienta, obchodu, zakázky, kontaktu); obsah dialogu.

```ts
function NewTaskForm({ links, typeKey, onClose, onCreated, }: { links?: ActivityLinks; typeKey?: string; onClose: () => void; onCreated?: () => void; }): import("react").JSX.Element
```

### PlanComposer

function · `packages/modules/ukoly/src/ui/record-tab.tsx`

Naplánování další aktivity (typ, název, termín, délka, řešitel) k záznamu.

```ts
function PlanComposer({ links, onDone }: { links: ActivityLinks; onDone?: () => void }): import("react").JSX.Element
```

### QuickAdd

function · `packages/modules/ukoly/src/ui/quick-add.tsx`

Rychlé přidání s živým náhledem rozpoznaného. `links` předá vazby (karta klienta, obchodu, zakázky, kontaktu).

```ts
function QuickAdd({ links, inputRef, autoFocus, onAdded, placeholder = "Přidat úkol… např. „zavolat Novákovi zítra 10:00“", }: { links?: ActivityLinks; inputRef?: Ref<HTMLInputElement>; autoFocus?: boolean; onAdded?: () => void; placeholder?: string; }): import("react").JSX.Element
```

### RecordTasksCard

function · `packages/modules/ukoly/src/ui/record-tab.tsx`

Karta „Úkoly“ na přehledu záznamu: nejbližší otevřené kroky a odkaz na celou záložku.

```ts
function RecordTasksCard({ target, openTab, }: { target: RecordTarget; openTab: (tab: string) => void; }): import("react").JSX.Element
```

### RecordTasksPanel

function · `packages/modules/ukoly/src/ui/record-tab.tsx`

Obsah záložky „Úkoly a aktivity“.

```ts
function RecordTasksPanel({ target }: { target: RecordTarget }): import("react").JSX.Element
```

### TaskDialog

function · `packages/modules/ukoly/src/ui/task-dialog.tsx`

Dialog detailu úkolu; `onSwitch` přepne na jiný úkol (nadřazený).

```ts
function TaskDialog({ taskId, onClose, onSwitch, }: { taskId: string; onClose: () => void; onSwitch?: (id: string) => void; }): import("react").JSX.Element
```

### TaskTimeline

function · `packages/modules/ukoly/src/ui/record-tab.tsx`

Časová osa proběhlých aktivit od nejnovější: typ, název, kdy, kdo, výsledek.

```ts
function TaskTimeline({ done, onOpen }: { done: TaskDto[]; onOpen: (id: string) => void }): import("react").JSX.Element
```

### TaskTypesPage

function · `packages/modules/ukoly/src/ui/types-page.tsx`

Stránka Nastavení → Typy aktivit.

```ts
function TaskTypesPage(): import("react").JSX.Element
```

### ui

const · `packages/modules/ukoly/src/ui.tsx`

UI modulu „ukoly“ složené z oblastí.

```ts
const ui: ModuleUi
```
