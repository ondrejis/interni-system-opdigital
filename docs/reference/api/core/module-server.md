# @rebar/core/module-server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/module-server` (soubor `packages/core/src/modules/server.ts`). Exportů: 23, z toho s popisem 14.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createEventEmitter`](#createeventemitter) | function | Vyrobí oznamovač událostí pro rozšíření klienta. Rozšíření se volají postupně v pořadí, v jakém jsou v `extensions/index.ts`; chyba rozšíření se zachytí (`onError`) a akci, která událost vyvolala, nikdy nezruší. |  |
| [`defineCommand`](#definecommand) | function |  |  |
| [`defineDashboardMetric`](#definedashboardmetric) | function |  |  |
| [`defineModuleJob`](#definemodulejob) | function | Úloha modulu na pozadí: stejná jako `defineJob`, jen s typovanými službami workeru. |  |
| [`defineModuleServer`](#definemoduleserver) | function |  |  |
| [`emitEvent`](#emitevent) | function | Oznámí událost rozšířením klienta. Pro kód, který nemá `ModuleDeps` (hooky entit, např. `afterCreate`); příkazy modulů používají `deps.emit`. Běží v transakci akce, která událost vyvolala. |  |
| [`mergeServers`](#mergeservers) | function | Složí serverovou část modulu z oblastí (každá oblast je samostatná složka s vlastním vlastníkem, ADR 015): seznamy se spojí v daném pořadí. |  |
| [`setEventEmitter`](#seteventemitter) | function | Aplikace tu při startu zaregistruje oznamovač rozšíření klienta (web). Bez něj (worker, testy) se události zahazují. |  |
| [`AttentionItem`](#attentionitem) | type | Položka „Vyžaduje pozornost“ na přehledu. |  |
| [`AttentionProvider`](#attentionprovider) | type |  |  |
| [`CalendarItem`](#calendaritem) | type | Položka kalendářní vrstvy (fáze, rezervace, termíny, splatnosti…). |  |
| [`CalendarLayerProvider`](#calendarlayerprovider) | type |  |  |
| [`CommandDef`](#commanddef) | type | Příkaz modulu: pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`). Oprávnění a validaci vstupu hlídá jednotný vstupní bod; handler je čistá funkce nad `ctx`. |  |
| [`DashboardMetricDef`](#dashboardmetricdef) | type | Pojmenovaná metrika nástěnky: výpočet, který nejde složit z jedné entity (marže zakázek, nevyfakturováno, využití strojů…). Modul ji deklaruje ve své serverové části (`dashboardMetrics`). Metrika **nikdy nevidí víc než aktér**: jádro ji nevyhodnotí bez všech `permissions` a výpočet musí čerpat data přes entity a datovou vrstvu (rozsah „jen moje“). |  |
| [`DashboardMetricInput`](#dashboardmetricinput) | type | Vstup výpočtu pojmenované metriky nástěnky (období a filtry z hlavičky nástěnky, parametry z widgetu). |  |
| [`DashboardMetricResult`](#dashboardmetricresult) | type |  |  |
| [`EventEmitter`](#eventemitter) | type |  |  |
| [`ModuleDeps`](#moduledeps) | type | Služby, které aplikace předává modulům (příkazy, poskytovatelé, úlohy). Moduly je dostávají jako parametr; nikdy neimportují jeden druhého kvůli službám (vypnutý modul nesmí zanechat stopu). |  |
| [`ModuleJob`](#modulejob) | type |  |  |
| [`ModuleJobDeps`](#modulejobdeps) | type | Úloha modulu na pozadí (připomínky, uzávěrky…); běží ve workeru s právy systému. |  |
| [`ModuleServer`](#moduleserver) | type | Co modul nabízí běžícímu systému na serveru. Žádný modul tohle nečte z jiného modulu přímo — jen přes registry v aplikaci. |  |
| [`WidgetData`](#widgetdata) | type | Dlaždice přehledu: modul dodá data, UI dlaždici vykreslí podle `kind`. |  |
| [`WidgetProvider`](#widgetprovider) | type |  |  |

### createEventEmitter

function · `packages/core/src/extensions/events.ts`

Vyrobí oznamovač událostí pro rozšíření klienta. Rozšíření se volají postupně v pořadí, v jakém jsou v `extensions/index.ts`;
chyba rozšíření se zachytí (`onError`) a akci, která událost vyvolala, nikdy nezruší.

```ts
function createEventEmitter(extensions: readonly ClientExtension[], onError: (err: unknown, where: string) => void): EventEmitter
```

### defineCommand

function · `packages/core/src/modules/server.ts`

_Bez popisu._

```ts
function defineCommand<S extends ZodType, R>(def: CommandDef<S, R>): CommandDef<S, R>
```

### defineDashboardMetric

function · `packages/core/src/modules/server.ts`

_Bez popisu._

```ts
function defineDashboardMetric(def: DashboardMetricDef): DashboardMetricDef
```

### defineModuleJob

function · `packages/core/src/modules/server.ts`

Úloha modulu na pozadí: stejná jako `defineJob`, jen s typovanými službami workeru.

```ts
function defineModuleJob<S extends ZodType>(def: JobDef<S, ModuleJobDeps>): ModuleJob
```

### defineModuleServer

function · `packages/core/src/modules/server.ts`

_Bez popisu._

```ts
function defineModuleServer<const M extends ModuleServer>(m: M): M
```

### emitEvent

function · `packages/core/src/extensions/events.ts`

Oznámí událost rozšířením klienta. Pro kód, který nemá `ModuleDeps` (hooky entit, např. `afterCreate`);
příkazy modulů používají `deps.emit`. Běží v transakci akce, která událost vyvolala.

```ts
async function emitEvent(name, payload): Promise<void>
```

### mergeServers

function · `packages/core/src/modules/server.ts`

Složí serverovou část modulu z oblastí (každá oblast je samostatná složka s vlastním vlastníkem, ADR 015):
seznamy se spojí v daném pořadí.

```ts
function mergeServers(...parts: readonly ModuleServer[]): ModuleServer
```

### setEventEmitter

function · `packages/core/src/extensions/events.ts`

Aplikace tu při startu zaregistruje oznamovač rozšíření klienta (web). Bez něj (worker, testy) se události zahazují.

```ts
function setEventEmitter(emitter: EventEmitter | undefined): void
```

### AttentionItem

type · `packages/core/src/modules/server.ts`

Položka „Vyžaduje pozornost“ na přehledu.

```ts
type AttentionItem = {
  id: string;
  /** Modul původu. */
  module: string;
  severity: "info" | "warning" | "danger";
  title: string;
  detail?: string;
  href: string;
};
```

### AttentionProvider

type · `packages/core/src/modules/server.ts`

_Bez popisu._

```ts
type AttentionProvider = (ctx: Ctx, deps: ModuleDeps) => Promise<AttentionItem[]>;
```

### CalendarItem

type · `packages/core/src/modules/server.ts`

Položka kalendářní vrstvy (fáze, rezervace, termíny, splatnosti…).

```ts
type CalendarItem = {
  id: string;
  layer: string;
  title: string;
  /** ISO datum (`YYYY-MM-DD`) nebo čas (`YYYY-MM-DDTHH:mm`). */
  start: string;
  end?: string;
  allDay: boolean;
  color?: string;
  href?: string;
};
```

### CalendarLayerProvider

type · `packages/core/src/modules/server.ts`

_Bez popisu._

```ts
type CalendarLayerProvider = {
  key: string;
  label: string;
  color: string;
  items: (
    ctx: Ctx,
    range: { from: string; to: string },
    deps: ModuleDeps,
  ) => Promise<CalendarItem[]>;
};
```

### CommandDef

type · `packages/core/src/modules/server.ts`

Příkaz modulu: pojmenovaná akce nebo dotaz volaný z UI (`api.command(name, input)`).
Oprávnění a validaci vstupu hlídá jednotný vstupní bod; handler je čistá funkce nad `ctx`.

```ts
type CommandDef<S extends ZodType = ZodType, R = unknown> = {
  /** `<modul>.<akce>`. */
  name: string;
  /** Stačí kterékoli z uvedených oprávnění; bez něj stačí přihlášení (oprávnění pak řeší data). */
  permission?: string | readonly string[];
  input: S;
  handler: (ctx: Ctx, input: z.output<S>, deps: ModuleDeps) => Promise<R>;
};
```

### DashboardMetricDef

type · `packages/core/src/modules/server.ts`

Pojmenovaná metrika nástěnky: výpočet, který nejde složit z jedné entity (marže zakázek, nevyfakturováno, využití
strojů…). Modul ji deklaruje ve své serverové části (`dashboardMetrics`). Metrika **nikdy nevidí víc než aktér**:
jádro ji nevyhodnotí bez všech `permissions` a výpočet musí čerpat data přes entity a datovou vrstvu (rozsah „jen moje“).

```ts
type DashboardMetricDef = {
  /** `<modul>.<metrika>`; prefix musí odpovídat modulu. */
  key: string;
  label: string;
  description?: string;
  format: ValueFormat;
  /** `scalar` = jedno číslo (KPI, měřidlo, srovnání období); `series` = kategorie × řady (grafy, tabulka). */
  shape: "scalar" | "series";
  /** Aktér musí mít VŠECHNA uvedená oprávnění; jinak metrika pro něj neexistuje (ani v nabídce, ani při vyhodnocení). */
  permissions: readonly string[];
  supports?: { period?: boolean; job?: boolean; person?: boolean; bucket?: boolean };
  params?: readonly {
    key: string;
    label: string;
    type: "select" | "number" | "boolean";
    choices?: readonly { value: string; label: string }[];
    default?: string | number | boolean;
  }[];
  compute: (
    ctx: Ctx,
    input: DashboardMetricInput,
    deps: ModuleDeps,
  ) => Promise<DashboardMetricResult>;
};
```

### DashboardMetricInput

type · `packages/core/src/modules/server.ts`

Vstup výpočtu pojmenované metriky nástěnky (období a filtry z hlavičky nástěnky, parametry z widgetu).

```ts
type DashboardMetricInput = {
  /** Období (včetně obou konců); `null` = bez omezení. Metrika bez `supports.period` ho dostane vždy `null`. */
  from: string | null;
  to: string | null;
  jobId: string | null;
  userId: string | null;
  bucket: Bucket | null;
  /** Nejvíc řádků / skupin, které widget ukáže. */
  limit: number;
  params: Record<string, string | number | boolean>;
  /** Dnešní datum v české zóně. */
  today: string;
};
```

### DashboardMetricResult

type · `packages/core/src/modules/server.ts`

_Bez popisu._

```ts
type DashboardMetricResult =
  | { kind: "scalar"; value: number | null }
  | {
      kind: "series";
      categories: ChartCategory[];
      series: ChartSeriesData[];
    };
```

### EventEmitter

type · `packages/core/src/extensions/events.ts`

_Bez popisu._

```ts
type EventEmitter = <K extends EventName>(name: K, payload: EventMap[K]) => Promise<void>;
```

### ModuleDeps

type · `packages/core/src/modules/server.ts`

Služby, které aplikace předává modulům (příkazy, poskytovatelé, úlohy). Moduly je dostávají jako parametr;
nikdy neimportují jeden druhého kvůli službám (vypnutý modul nesmí zanechat stopu).

```ts
type ModuleDeps = {
  registry: EntityRegistry;
  queue: Pick<QueueClient, "send">;
  storage: StorageDriver;
  settings: SettingsService;
  /** Šifrování tajemství v DB (adresy cizích kalendářů…). */
  cipher: Cipher;
  /** Adresa aplikace (odkazy v e-mailech a upozorněních). */
  baseURL: string;
  /** Oznámí událost rozšířením klienta (chyba rozšíření nesmí zrušit akci). */
  emit: <K extends EventName>(name: K, payload: EventMap[K]) => Promise<void>;
  /** Poskytovatelé zapnutých modulů (kalendářní vrstvy). */
  calendarLayers: readonly CalendarLayerProvider[];
};
```

### ModuleJob

type · `packages/core/src/modules/server.ts`

_Bez popisu._

```ts
type ModuleJob = JobDef<ZodType, ModuleJobDeps>;
```

### ModuleJobDeps

type · `packages/core/src/modules/server.ts`

Úloha modulu na pozadí (připomínky, uzávěrky…); běží ve workeru s právy systému.

```ts
type ModuleJobDeps = {
  db: Db;
  registry: EntityRegistry;
  queue: Pick<QueueClient, "send">;
  settings: SettingsService;
  cipher: Cipher;
  baseURL: string;
};
```

### ModuleServer

type · `packages/core/src/modules/server.ts`

Co modul nabízí běžícímu systému na serveru. Žádný modul tohle nečte z jiného modulu přímo — jen přes registry v aplikaci.

```ts
type ModuleServer = {
  entities?: readonly EntityDef[];
  commands?: readonly CommandDef[];
  attention?: readonly AttentionProvider[];
  widgets?: readonly WidgetProvider[];
  /** Pojmenované metriky pro vlastní nástěnky (viz `DashboardMetricDef`). */
  dashboardMetrics?: readonly DashboardMetricDef[];
  calendarLayers?: readonly CalendarLayerProvider[];
  jobs?: readonly ModuleJob[];
  /** Hooky přechodu fáze záznamu (zakázky): kontroly a automatické akce, které zná tento modul. */
  phaseHooks?: readonly PhaseTransitionHook[];
  /** Blokace smazání: záznamy tohoto modulu, které odkazují na firmu, osobu nebo zakázku (viz `DeleteBlocker`). */
  deleteBlockers?: readonly DeleteBlocker[];
  /**
   * Idempotentní doplnění dat modulu do existující databáze (`db:seed`, `demo:seed`): výchozí stavy, typy aktivit,
   * úprava dat po změně výchozí sady. Běží po `runSeed`; nesmí přepisovat to, co správce změnil v administraci.
   */
  ensure?: readonly ((db: Executor) => Promise<unknown>)[];
};
```

### WidgetData

type · `packages/core/src/modules/server.ts`

Dlaždice přehledu: modul dodá data, UI dlaždici vykreslí podle `kind`.

```ts
type WidgetData = {
  id: string;
  module: string;
  title: string;
  /** Hlavní číslo nebo text dlaždice. */
  value: string;
  hint?: string;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
  /** Pořadí na přehledu (nižší dřív). */
  order?: number;
};
```

### WidgetProvider

type · `packages/core/src/modules/server.ts`

_Bez popisu._

```ts
type WidgetProvider = (ctx: Ctx, deps: ModuleDeps) => Promise<WidgetData[]>;
```
