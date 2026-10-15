# @rebar/zakazky/ui

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/ui` (soubor `packages/modules/zakazky/src/ui.tsx`). Exportů: 10, z toho s popisem 10.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`CreateJobDialog`](#createjobdialog) | function | Dialog „Nová zakázka“ (klávesa C na seznamu): název, klient, typ, šablona, vlastník, členové, začátek a termín; u marketingu volba modelu fakturace (úvodní fáze → retainer / rovnou retainer), cena a rozdělení plateb (slot Financí). |  |
| [`JobsFromDealDialog`](#jobsfromdealdialog) | function | Dialog „Založit zakázky“ po výhře obchodu (D §2.4): řádek za každou službu obchodu (typ, šablona, název, start, vlastník, členové, rozdělení), řádky jdou upravit, odebrat a přidat; marketing nabízí „Úvodní fáze → retainer“ nebo „Rovnou retainer“. „Přeskočit“ zakázky nezaloží. Potvrzení zavolá `obchody.win` s řádky (nebo vlastní `onSubmit`, kterým volající výhru provede sám); po dokončení `onDone`. |  |
| [`JobsPage`](#jobspage) | function | Stránka Zakázky: Seznam (kód, název, klient, typ, stav, fáze, vlastník, členové, termín, hodnota, Disk, varování), board podle stavu, board podle fází jednoho typu a plná tabulka jádra (filtry, uložené pohledy, export). Klávesa C nebo tlačítko založí novou zakázku. |  |
| [`TemplateEditorPage`](#templateeditorpage) | function | Editor jedné šablony: fáze, úkoly s termínem a odhadem, plánované platby, výchozí šablona, duplikace, archivace. |  |
| [`TemplatesPage`](#templatespage) | function | Stránka Nastavení → Šablony zakázek: šablony po typech, výchozí, duplikace, archivace, nová šablona a zakázka ze šablony. |  |
| [`JOB_TAB_ORDER`](#job_tab_order) | const | Pořadí záložek detailu zakázky v liště (spec: Úkoly, Finance, Hodiny, Poznámky, Obchod, Reklama, Historie). Záložky jiných modulů (`recordTabs.job`) mají použít tato čísla v `order`, aby lišta měla stejné pořadí bez ohledu na moduly. |  |
| [`ui`](#ui) | const | UI modulu „zakazky“ (ZAK-B): hlavička detailu s pásem fází, záložky Úkoly a Historie, karty Přehledu, akce a paleta. Stránky `/zakazky`, `/zakazky/faze`, `/zakazky/sablony` jsou trasy aplikace; `JobsFromDealDialog` používá modul Obchody. |  |
| [`CreateJobPreset`](#createjobpreset) | type | Předvolby dialogu Nová zakázka (z palety, ze šablony nebo z karty klienta). |  |
| [`JobsFromDealResult`](#jobsfromdealresult) | type | Výsledek dialogu „Založit zakázky z obchodu“. |  |
| [`JobsView`](#jobsview) | type | Zobrazení stránky zakázek. |  |

### CreateJobDialog

function · `packages/modules/zakazky/src/ui/create-job.tsx`

Dialog „Nová zakázka“ (klávesa C na seznamu): název, klient, typ, šablona, vlastník, členové, začátek a termín;
u marketingu volba modelu fakturace (úvodní fáze → retainer / rovnou retainer), cena a rozdělení plateb (slot Financí).

```ts
function CreateJobDialog({ open, onOpenChange, preset, onCreated, }: { open: boolean; onOpenChange: (open: boolean) => void; preset?: CreateJobPreset; onCreated?: (job: { id: string; number: string }) => void; }): import("react").JSX.Element
```

### JobsFromDealDialog

function · `packages/modules/zakazky/src/ui/create-job.tsx`

Dialog „Založit zakázky“ po výhře obchodu (D §2.4): řádek za každou službu obchodu (typ, šablona, název, start, vlastník,
členové, rozdělení), řádky jdou upravit, odebrat a přidat; marketing nabízí „Úvodní fáze → retainer“ nebo „Rovnou retainer“.
„Přeskočit“ zakázky nezaloží. Potvrzení zavolá `obchody.win` s řádky (nebo vlastní `onSubmit`, kterým volající výhru provede
sám); po dokončení `onDone`.

```ts
function JobsFromDealDialog({ dealId, companyId, services, value, ownerId, open = true, onSubmit, onDone, }: { dealId: string; companyId: string; services: readonly ServiceType[]; /** Hodnota obchodu v haléřích (předvyplní cenu u jediné služby, R-39). */ value?: number | null; ownerId?: string | null; open?: boolean; /** Vlastní provedení výhry s řádky (prázdné pole = Přeskočit); bez něj se zavolá `obchody.win`. */ onSubmit?: (rows: JobFromDealRow[]) => Promise<{ jobs?: CreatedJob[] } | void>; onDone: (r: JobsFromDealResult) => void; }): import("react").JSX.Element
```

### JobsPage

function · `packages/modules/zakazky/src/ui/jobs-page.tsx`

Stránka Zakázky: Seznam (kód, název, klient, typ, stav, fáze, vlastník, členové, termín, hodnota, Disk, varování),
board podle stavu, board podle fází jednoho typu a plná tabulka jádra (filtry, uložené pohledy, export). Klávesa C
nebo tlačítko založí novou zakázku.

```ts
function JobsPage({ view, type = "web", openCreate, }: { view: JobsView; type?: ServiceType; openCreate?: boolean; }): import("react").JSX.Element
```

### TemplateEditorPage

function · `packages/modules/zakazky/src/ui/templates.tsx`

Editor jedné šablony: fáze, úkoly s termínem a odhadem, plánované platby, výchozí šablona, duplikace, archivace.

```ts
function TemplateEditorPage({ id }: { id: string }): import("react").JSX.Element
```

### TemplatesPage

function · `packages/modules/zakazky/src/ui/templates.tsx`

Stránka Nastavení → Šablony zakázek: šablony po typech, výchozí, duplikace, archivace, nová šablona a zakázka ze šablony.

```ts
function TemplatesPage(): import("react").JSX.Element
```

### JOB_TAB_ORDER

const · `packages/modules/zakazky/src/ui/tab-order.ts`

Pořadí záložek detailu zakázky v liště (spec: Úkoly, Finance, Hodiny, Poznámky, Obchod, Reklama, Historie). Záložky
jiných modulů (`recordTabs.job`) mají použít tato čísla v `order`, aby lišta měla stejné pořadí bez ohledu na moduly.

```ts
const JOB_TAB_ORDER: { readonly ukoly: 10; readonly finance: 20; readonly hodiny: 30; readonly poznamky: 40; readonly obchod: 50; readonly reklama: 60; readonly historie: 700; }
```

### ui

const · `packages/modules/zakazky/src/ui.tsx`

UI modulu „zakazky“ (ZAK-B): hlavička detailu s pásem fází, záložky Úkoly a Historie, karty Přehledu, akce a paleta.
Stránky `/zakazky`, `/zakazky/faze`, `/zakazky/sablony` jsou trasy aplikace; `JobsFromDealDialog` používá modul Obchody.

```ts
const ui: ModuleUi
```

### CreateJobPreset

type · `packages/modules/zakazky/src/ui/create-job.tsx`

Předvolby dialogu Nová zakázka (z palety, ze šablony nebo z karty klienta).

```ts
type CreateJobPreset = {
  type?: ServiceType;
  templateId?: string;
  companyId?: string;
  companyName?: string;
};
```

### JobsFromDealResult

type · `packages/modules/zakazky/src/ui/create-job.tsx`

Výsledek dialogu „Založit zakázky z obchodu“.

```ts
type JobsFromDealResult = {
  skipped: boolean;
  created: { id: string; number: string; type: ServiceType }[];
};
```

### JobsView

type · `packages/modules/zakazky/src/ui/jobs-page.tsx`

Zobrazení stránky zakázek.

```ts
type JobsView = "seznam" | "stav" | "faze" | "tabulka";
```
