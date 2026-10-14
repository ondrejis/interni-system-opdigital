# @rebar/core/terminal

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/terminal` (soubor `packages/core/src/terminal/index.ts`). Exportů: 35, z toho s popisem 25.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`bottomTiles`](#bottomtiles) | function |  |  |
| [`collectTerminalWidgets`](#collectterminalwidgets) | function | Všechny dlaždice dostupné v sestavě: platforma a zapnuté moduly (v pořadí modulů). |  |
| [`isTerminalOnlyRole`](#isterminalonlyrole) | function | Role, které používají jen terminál. Vypnutý terminál žádnou roli nezamyká. |  |
| [`listTerminalRoleChoices`](#listterminalrolechoices) | function | Role k výběru v Nastavení terminálu. Vyžaduje `settings.manage`. |  |
| [`loadEffectiveTerminalConfig`](#loadeffectiveterminalconfig) | function | Konfigurace, která platí: výchozí z `config.ts` přepsané nastavením správce. |  |
| [`loadTerminalSettings`](#loadterminalsettings) | function | Nastavení správce převedené na aktuální verzi (poškozené položky se zahodí, terminál kvůli tomu nespadne). |  |
| [`mergeTerminalConfig`](#mergeterminalconfig) | function | Výsledná konfigurace: nastavení správce má přednost před konfigurací klienta, `null` znamená výchozí. |  |
| [`migrateTerminalSettings`](#migrateterminalsettings) | function | Převede uložené nastavení na aktuální verzi. Neznámé nebo poškozené hodnoty nesmí terminál shodit: vrátí se výchozí (`null` u všeho) a `problems` řekne, co se zahodilo. Starší tvary: - bez `version` (ručně vložené nebo před verzováním): `hidden: string[]` (skryté dlaždice) a `order: string[]` (pořadí) se převedou na `tiles`; `tiles` jako pole řetězců také. |  |
| [`purgeTerminalOps`](#purgeterminalops) | function | Smaže řádky starší než doba uchování (jen vlastní aplikace, neovlivní žádný zápis). |  |
| [`resolveTerminalTiles`](#resolveterminaltiles) | function | Seřadí dlaždice podle konfigurace: nejdřív ty, které konfigurace uvádí (v jejím pořadí), pak ostatní dostupné dlaždice v pořadí modulů. Neznámý klíč v konfiguraci (modul není zapnutý) se přeskočí. Oprávnění se tu neposuzují. |  |
| [`runTerminalOp`](#runterminalop) | function | Provede zápis z terminálu nejvýš jednou. `opId` vytváří zařízení při zápisu a při opakování posílá stejné. V jedné transakci se zapíše řádek `terminal_op` a provede se `run`: - poprvé: `run` proběhne, výsledek se uloží a vrátí s `duplicate: false`; - podruhé (opakování po výpadku, dvojí ťuknutí, souběh): `run` se nespustí a vrátí se původní výsledek s `duplicate: true`; - selže-li `run`, transakce se vrátí i s řádkem a zápis jde bezpečně zkusit znovu. Souběžné odeslání téhož `opId` počká na první transakci (jedinečný klíč), takže vznikne nejvýš jeden zápis. Cizí `opId` (jiného uživatele) nebo jiný příkaz pod stejným `opId` se odmítne. |  |
| [`saveTerminalSettings`](#saveterminalsettings) | function | Uloží nastavení správce. Vyžaduje `settings.manage`. Role jen pro terminál nesmí být systémová ani smět spravovat systém (zamkly by správce mimo Nastavení); klíče rolí se ověřují proti existujícím rolím. |  |
| [`submitTerminalCommand`](#submitterminalcommand) | function | Přijme zápis z terminálu (z offline fronty). Příkaz musí patřit dlaždici, kterou uživatel v terminálu vidí (zapnutý modul, oprávnění role, dlaždice nevypnutá správcem); jinak se odmítne bez ohledu na to, co zobrazuje UI. Pak platí oprávnění příkazu a validace vstupu a zápis se provede nejvýš jednou podle `opId` (`runTerminalOp`). |  |
| [`terminalCommandAllowed`](#terminalcommandallowed) | function | Smí tento příkaz přijít z terminálu? Jen když ho deklaruje některá z viditelných dlaždic. |  |
| [`validateTerminalSetup`](#validateterminalsetup) | function | Kontroly sestavy při startu: neznámé klíče dlaždic, předpony, příkazy a oprávnění. Prázdné pole = v pořádku. |  |
| [`visibleTerminalTiles`](#visibleterminaltiles) | function | Dlaždice, které smí aktér vidět: zapnuté a s oprávněním (UI i server používají tutéž funkci). |  |
| [`BOTTOM_TILE_LIMIT`](#bottom_tile_limit) | const | Spodní lišta: Dnes, až tři dlaždice s vlastní obrazovkou (v pořadí dlaždic) a Více. Dohromady nejvýš pět položek. |  |
| [`CORE_TERMINAL_WIDGETS`](#core_terminal_widgets) | const | Dlaždice platformy (nepatří žádnému modulu). Jejich příkazy zajišťuje jádro (`core.*`, viz `commands.ts`). |  |
| [`DEFAULT_TERMINAL_SETTINGS`](#default_terminal_settings) | const |  |  |
| [`TERMINAL_OP_RETENTION_DAYS`](#terminal_op_retention_days) | const | Jak dlouho se pamatují odeslané zápisy pro ochranu proti dvojímu odeslání (fronta nedrží zápis déle než pár dní). |  |
| [`TERMINAL_SETTING_VERSION`](#terminal_setting_version) | const | Nastavení uložené v databázi (Nastavení → Terminál řemeslníka). `null` u položky znamená „použij výchozí z konfigurace klienta“, takže změna `config.ts` se projeví všude, kde správce nic nepřepsal. |  |
| [`TERMINAL_WIDGET_KEY`](#terminal_widget_key) | const | Klíč dlaždice: `<modul>.<název>` (např. `dochazka.clock`, `core.tasks`). |  |
| [`coreTerminalCommands`](#coreterminalcommands) | const | Příkazy platformy pro terminál. Aplikace je přidá k příkazům zapnutých modulů. |  |
| [`terminalConfigSchema`](#terminalconfigschema) | const | Konfigurace mobilního terminálu řemeslníka v `clients/<slug>/config.ts`. Jsou to výchozí hodnoty; správce je v Nastavení → Terminál řemeslníka může přepsat (uloženo v databázi, viz `TerminalSettings`). |  |
| [`terminalSettingDef`](#terminalsettingdef) | const | Nastavení terminálu v tabulce `setting` (klíč `terminal`). Tvar hlídá `terminalSettingsSchema` a převod starších verzí `migrateTerminalSettings`; samotná definice je volná, aby si čtení mohlo poradit i se starším tvarem. |  |
| [`terminalSettingsSchema`](#terminalsettingsschema) | const |  |  |
| [`terminalTileSchema`](#terminaltileschema) | const | Jedna dlaždice v seznamu klienta: pořadí je pořadí v poli, `enabled: false` ji vypne, `label` přejmenuje. |  |
| [`ResolvedTile`](#resolvedtile) | type | Stav jedné dlaždice po složení konfigurace (pro Nastavení i pro terminál). |  |
| [`TerminalConfig`](#terminalconfig) | type |  |  |
| [`TerminalConfigInput`](#terminalconfiginput) | type |  |  |
| [`TerminalOpOutcome`](#terminalopoutcome) | type |  |  |
| [`TerminalRoleChoice`](#terminalrolechoice) | type |  |  |
| [`TerminalSettings`](#terminalsettings) | type |  |  |
| [`TerminalSubmitEnv`](#terminalsubmitenv) | type |  |  |
| [`TerminalTile`](#terminaltile) | type |  |  |

### bottomTiles

function · `packages/core/src/terminal/resolve.ts`

_Bez popisu._

```ts
function bottomTiles(tiles: readonly ResolvedTile[]): ResolvedTile[]
```

### collectTerminalWidgets

function · `packages/core/src/terminal/resolve.ts`

Všechny dlaždice dostupné v sestavě: platforma a zapnuté moduly (v pořadí modulů).

```ts
function collectTerminalWidgets(modules: readonly Pick<ModuleManifest, "terminalWidgets">[]): TerminalWidgetDef[]
```

### isTerminalOnlyRole

function · `packages/core/src/terminal/resolve.ts`

Role, které používají jen terminál. Vypnutý terminál žádnou roli nezamyká.

```ts
function isTerminalOnlyRole(config: Pick<TerminalConfig, "enabled" | "roles">, roleKey: string | null): boolean
```

### listTerminalRoleChoices

function · `packages/core/src/terminal/settings.ts`

Role k výběru v Nastavení terminálu. Vyžaduje `settings.manage`.

```ts
async function listTerminalRoleChoices(ctx: Ctx): Promise<TerminalRoleChoice[]>
```

### loadEffectiveTerminalConfig

function · `packages/core/src/terminal/settings.ts`

Konfigurace, která platí: výchozí z `config.ts` přepsané nastavením správce.

```ts
async function loadEffectiveTerminalConfig(settings: SettingsService, db: Executor, base: TerminalConfig): Promise<TerminalConfig>
```

### loadTerminalSettings

function · `packages/core/src/terminal/settings.ts`

Nastavení správce převedené na aktuální verzi (poškozené položky se zahodí, terminál kvůli tomu nespadne).

```ts
async function loadTerminalSettings(settings: SettingsService, db: Executor): Promise<{ value: TerminalSettings; problems: string[] }>
```

### mergeTerminalConfig

function · `packages/core/src/terminal/config.ts`

Výsledná konfigurace: nastavení správce má přednost před konfigurací klienta, `null` znamená výchozí.

```ts
function mergeTerminalConfig(base: TerminalConfig, stored: TerminalSettings): TerminalConfig
```

### migrateTerminalSettings

function · `packages/core/src/terminal/config.ts`

Převede uložené nastavení na aktuální verzi. Neznámé nebo poškozené hodnoty nesmí terminál shodit: vrátí se výchozí
(`null` u všeho) a `problems` řekne, co se zahodilo. Starší tvary:
- bez `version` (ručně vložené nebo před verzováním): `hidden: string[]` (skryté dlaždice) a `order: string[]` (pořadí)
  se převedou na `tiles`; `tiles` jako pole řetězců také.

```ts
function migrateTerminalSettings(raw: unknown): { value: TerminalSettings; problems: string[]; }
```

### purgeTerminalOps

function · `packages/core/src/terminal/ops.ts`

Smaže řádky starší než doba uchování (jen vlastní aplikace, neovlivní žádný zápis).

```ts
async function purgeTerminalOps(ctx: Ctx, now = new Date()): Promise<void>
```

### resolveTerminalTiles

function · `packages/core/src/terminal/resolve.ts`

Seřadí dlaždice podle konfigurace: nejdřív ty, které konfigurace uvádí (v jejím pořadí), pak ostatní dostupné dlaždice
v pořadí modulů. Neznámý klíč v konfiguraci (modul není zapnutý) se přeskočí. Oprávnění se tu neposuzují.

```ts
function resolveTerminalTiles(defs: readonly TerminalWidgetDef[], config: Pick<TerminalConfig, "tiles">): ResolvedTile[]
```

### runTerminalOp

function · `packages/core/src/terminal/ops.ts`

Provede zápis z terminálu nejvýš jednou. `opId` vytváří zařízení při zápisu a při opakování posílá stejné.
V jedné transakci se zapíše řádek `terminal_op` a provede se `run`:
- poprvé: `run` proběhne, výsledek se uloží a vrátí s `duplicate: false`;
- podruhé (opakování po výpadku, dvojí ťuknutí, souběh): `run` se nespustí a vrátí se původní výsledek s `duplicate: true`;
- selže-li `run`, transakce se vrátí i s řádkem a zápis jde bezpečně zkusit znovu.
Souběžné odeslání téhož `opId` počká na první transakci (jedinečný klíč), takže vznikne nejvýš jeden zápis.
Cizí `opId` (jiného uživatele) nebo jiný příkaz pod stejným `opId` se odmítne.

```ts
async function runTerminalOp<T>(ctx: Ctx, op: { opId: string; command: string }, run: (ctx: Ctx) => Promise<T>): Promise<TerminalOpOutcome<T>>
```

### saveTerminalSettings

function · `packages/core/src/terminal/settings.ts`

Uloží nastavení správce. Vyžaduje `settings.manage`. Role jen pro terminál nesmí být systémová ani smět spravovat
systém (zamkly by správce mimo Nastavení); klíče rolí se ověřují proti existujícím rolím.

```ts
async function saveTerminalSettings(ctx: Ctx, settings: SettingsService, input: unknown): Promise<TerminalSettings>
```

### submitTerminalCommand

function · `packages/core/src/terminal/submit.ts`

Přijme zápis z terminálu (z offline fronty). Příkaz musí patřit dlaždici, kterou uživatel v terminálu vidí (zapnutý
modul, oprávnění role, dlaždice nevypnutá správcem); jinak se odmítne bez ohledu na to, co zobrazuje UI. Pak platí
oprávnění příkazu a validace vstupu a zápis se provede nejvýš jednou podle `opId` (`runTerminalOp`).

```ts
async function submitTerminalCommand(ctx: Ctx, op: { opId: string; command: string; input: unknown }, env: TerminalSubmitEnv): Promise<TerminalOpOutcome<unknown>>
```

### terminalCommandAllowed

function · `packages/core/src/terminal/resolve.ts`

Smí tento příkaz přijít z terminálu? Jen když ho deklaruje některá z viditelných dlaždic.

```ts
function terminalCommandAllowed(tiles: readonly ResolvedTile[], command: string): boolean
```

### validateTerminalSetup

function · `packages/core/src/terminal/resolve.ts`

Kontroly sestavy při startu: neznámé klíče dlaždic, předpony, příkazy a oprávnění. Prázdné pole = v pořádku.

```ts
function validateTerminalSetup(config: Pick<TerminalConfig, "tiles">, allModules: readonly ModuleManifest[], knownPermissions: ReadonlySet<string>): string[]
```

### visibleTerminalTiles

function · `packages/core/src/terminal/resolve.ts`

Dlaždice, které smí aktér vidět: zapnuté a s oprávněním (UI i server používají tutéž funkci).

```ts
function visibleTerminalTiles(defs: readonly TerminalWidgetDef[], config: Pick<TerminalConfig, "tiles">, can: (permission: string) => boolean): ResolvedTile[]
```

### BOTTOM_TILE_LIMIT

const · `packages/core/src/terminal/resolve.ts`

Spodní lišta: Dnes, až tři dlaždice s vlastní obrazovkou (v pořadí dlaždic) a Více. Dohromady nejvýš pět položek.

```ts
const BOTTOM_TILE_LIMIT: 3
```

### CORE_TERMINAL_WIDGETS

const · `packages/core/src/terminal/resolve.ts`

Dlaždice platformy (nepatří žádnému modulu). Jejich příkazy zajišťuje jádro (`core.*`, viz `commands.ts`).

```ts
const CORE_TERMINAL_WIDGETS: readonly TerminalWidgetDef[]
```

### DEFAULT_TERMINAL_SETTINGS

const · `packages/core/src/terminal/config.ts`

_Bez popisu._

```ts
const DEFAULT_TERMINAL_SETTINGS: TerminalSettings
```

### TERMINAL_OP_RETENTION_DAYS

const · `packages/core/src/terminal/ops.ts`

Jak dlouho se pamatují odeslané zápisy pro ochranu proti dvojímu odeslání (fronta nedrží zápis déle než pár dní).

```ts
const TERMINAL_OP_RETENTION_DAYS: 60
```

### TERMINAL_SETTING_VERSION

const · `packages/core/src/terminal/config.ts`

Nastavení uložené v databázi (Nastavení → Terminál řemeslníka). `null` u položky znamená „použij výchozí z konfigurace
klienta“, takže změna `config.ts` se projeví všude, kde správce nic nepřepsal.

```ts
const TERMINAL_SETTING_VERSION: 1
```

### TERMINAL_WIDGET_KEY

const · `packages/core/src/terminal/config.ts`

Klíč dlaždice: `<modul>.<název>` (např. `dochazka.clock`, `core.tasks`).

```ts
const TERMINAL_WIDGET_KEY: RegExp
```

### coreTerminalCommands

const · `packages/core/src/terminal/commands.ts`

Příkazy platformy pro terminál. Aplikace je přidá k příkazům zapnutých modulů.

```ts
const coreTerminalCommands: readonly CommandDef[]
```

### terminalConfigSchema

const · `packages/core/src/terminal/config.ts`

Konfigurace mobilního terminálu řemeslníka v `clients/<slug>/config.ts`. Jsou to výchozí hodnoty; správce je v Nastavení
→ Terminál řemeslníka může přepsat (uloženo v databázi, viz `TerminalSettings`).

```ts
const terminalConfigSchema: z.ZodObject<{ enabled: z.ZodDefault<z.ZodBoolean>; roles: z.ZodDefault<z.ZodArray<z.ZodString>>; tiles: z.ZodDefault<z.ZodArray<z.ZodObject<{ widget: z.ZodString; enabled: z.ZodDefault<z.ZodBoolean>; label: z.ZodOptional<z.ZodString>; }, z…
```

### terminalSettingDef

const · `packages/core/src/terminal/settings.ts`

Nastavení terminálu v tabulce `setting` (klíč `terminal`). Tvar hlídá `terminalSettingsSchema` a převod starších verzí
`migrateTerminalSettings`; samotná definice je volná, aby si čtení mohlo poradit i se starším tvarem.

```ts
const terminalSettingDef: import("../settings").SettingDef<Record<string, unknown>>
```

### terminalSettingsSchema

const · `packages/core/src/terminal/config.ts`

_Bez popisu._

```ts
const terminalSettingsSchema: z.ZodObject<{ version: z.ZodLiteral<1>; roles: z.ZodNullable<z.ZodArray<z.ZodString>>; tiles: z.ZodNullable<z.ZodArray<z.ZodObject<{ widget: z.ZodString; enabled: z.ZodDefault<z.ZodBoolean>; label: z.ZodOptional<z.ZodString>; }, z.core.$st…
```

### terminalTileSchema

const · `packages/core/src/terminal/config.ts`

Jedna dlaždice v seznamu klienta: pořadí je pořadí v poli, `enabled: false` ji vypne, `label` přejmenuje.

```ts
const terminalTileSchema: z.ZodObject<{ widget: z.ZodString; enabled: z.ZodDefault<z.ZodBoolean>; label: z.ZodOptional<z.ZodString>; }, z.core.$strict>
```

### ResolvedTile

type · `packages/core/src/terminal/resolve.ts`

Stav jedné dlaždice po složení konfigurace (pro Nastavení i pro terminál).

```ts
type ResolvedTile = {
  key: string;
  /** Název, jak ho uvidí řemeslník (přejmenování správcem, jinak výchozí název dlaždice). */
  label: string;
  defaultLabel: string;
  description: string;
  icon: string;
  enabled: boolean;
  page: boolean;
  commands: readonly string[];
  permission: string | readonly string[] | undefined;
};
```

### TerminalConfig

type · `packages/core/src/terminal/config.ts`

_Bez popisu._

```ts
type TerminalConfig = z.output<typeof terminalConfigSchema>;
```

### TerminalConfigInput

type · `packages/core/src/terminal/config.ts`

_Bez popisu._

```ts
type TerminalConfigInput = z.input<typeof terminalConfigSchema>;
```

### TerminalOpOutcome

type · `packages/core/src/terminal/ops.ts`

_Bez popisu._

```ts
type TerminalOpOutcome<T> = { duplicate: boolean; result: T };
```

### TerminalRoleChoice

type · `packages/core/src/terminal/settings.ts`

_Bez popisu._

```ts
type TerminalRoleChoice = {
  key: string;
  name: string;
  /** Roli nelze omezit jen na terminál (systémová, nebo spravuje systém). */
  locked: boolean;
};
```

### TerminalSettings

type · `packages/core/src/terminal/config.ts`

_Bez popisu._

```ts
type TerminalSettings = z.output<typeof terminalSettingsSchema>;
```

### TerminalSubmitEnv

type · `packages/core/src/terminal/submit.ts`

_Bez popisu._

```ts
type TerminalSubmitEnv = {
  /** Dlaždice, které tento uživatel v terminálu smí (`visibleTerminalTiles`). */
  tiles: readonly ResolvedTile[];
  /** Příkazy zapnutých modulů a platformy. */
  commands: ReadonlyMap<string, Pick<CommandDef, "permission" | "input" | "handler">>;
  deps: ModuleDeps;
};
```

### TerminalTile

type · `packages/core/src/terminal/config.ts`

_Bez popisu._

```ts
type TerminalTile = z.output<typeof terminalTileSchema>;
```
