# @rebar/core

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core` (soubor `packages/core/src/index.ts`). Exportů: 28, z toho s popisem 12.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`collectNav`](#collectnav) | function |  |  |
| [`collectPermissions`](#collectpermissions) | function | Katalog všech oprávnění dostupných v dané sestavě (platforma + zapnuté moduly). |  |
| [`defineClientConfig`](#defineclientconfig) | function | Ověří konfiguraci klienta. Neplatná konfigurace = výjimka se srozumitelným výpisem všech chyb (aplikace při startu nenastartuje). |  |
| [`defineExtension`](#defineextension) | function |  |  |
| [`defineModule`](manifest.md#definemodule) | function |  | v `@rebar/core/manifest` |
| [`defineNotificationEvent`](manifest.md#definenotificationevent) | function |  | v `@rebar/core/manifest` |
| [`resolveModules`](#resolvemodules) | function | Z dostupných manifestů vybere zapnuté moduly a seřadí je tak, aby závislosti šly vždy před modulem, který je potřebuje. Vypnutý modul se nikde neobjeví. |  |
| [`ClientConfigError`](#clientconfigerror) | class |  |  |
| [`ModuleResolutionError`](#moduleresolutionerror) | class |  |  |
| [`CORE_PERMISSIONS`](manifest.md#core_permissions) | const | Oprávnění, která patří platformě, ne modulu. | v `@rebar/core/manifest` |
| [`INTERNAL_NAME`](#internal_name) | const | Interní pracovní název jádra. Nesmí se dostat do nic, co vidí klient. |  |
| [`MODULE_IDS`](manifest.md#module_ids) | const | Identifikátory modulů. Jediný zdroj pravdy — konfigurace klienta se validuje proti tomuto seznamu. | v `@rebar/core/manifest` |
| [`clientConfigSchema`](#clientconfigschema) | const |  |  |
| [`notificationsConfigSchema`](notifications.md#notificationsconfigschema) | const | Sekce `notifications` v konfiguraci klienta. | v `@rebar/core/notifications` |
| [`EventMap`](#eventmap) | interface | Události, na které se dá z rozšíření klienta reagovat. Seznam roste s moduly (fáze 4); rozšíření se k jádru připojuje jen přes tyto události a sloty. |  |
| [`AnyEventDef`](manifest.md#anyeventdef) | type | Zkratka pro libovolnou definici (pole, mapy). | v `@rebar/core/manifest` |
| [`ClientConfig`](#clientconfig) | type |  |  |
| [`ClientConfigInput`](#clientconfiginput) | type |  |  |
| [`ClientExtension`](#clientextension) | type |  |  |
| [`EventName`](#eventname) | type |  |  |
| [`ModuleId`](manifest.md#moduleid) | type |  | v `@rebar/core/manifest` |
| [`ModuleManifest`](manifest.md#modulemanifest) | type |  | v `@rebar/core/manifest` |
| [`ModuleSeed`](manifest.md#moduleseed) | type | Výchozí data modulu (pipeline, číselníky, číselné řady). Doplní se při seedu klienta, jen když modul běží. | v `@rebar/core/manifest` |
| [`NavItem`](manifest.md#navitem) | type |  | v `@rebar/core/manifest` |
| [`NotificationEventDef`](manifest.md#notificationeventdef) | type |  | v `@rebar/core/manifest` |
| [`PageDef`](manifest.md#pagedef) | type | Stránka modulu mimo seznamy entit; adresa i oprávnění jsou v manifestu, vykreslení v UI modulu. | v `@rebar/core/manifest` |
| [`PermissionDef`](manifest.md#permissiondef) | type |  | v `@rebar/core/manifest` |
| [`TerminalWidgetDef`](manifest.md#terminalwidgetdef) | type | Dlaždice (widget) mobilního terminálu řemeslníka, kterou modul nabízí. Jádro konkrétní moduly nezná: dlaždice, které uživatel uvidí, se skládají ze zapnutých modulů, oprávnění role a nastavení klienta (viz `docs/TERMINAL.md`). Vykreslení dlaždice je v UI části modulu (`terminalWidgets`), tady je jen popis. | v `@rebar/core/manifest` |

### collectNav

function · `packages/core/src/modules/registry.ts`

_Bez popisu._

```ts
function collectNav(modules: readonly ModuleManifest[]): NavItem[]
```

### collectPermissions

function · `packages/core/src/modules/registry.ts`

Katalog všech oprávnění dostupných v dané sestavě (platforma + zapnuté moduly).

```ts
function collectPermissions(modules: readonly ModuleManifest[]): PermissionDef[]
```

### defineClientConfig

function · `packages/core/src/config/define.ts`

Ověří konfiguraci klienta. Neplatná konfigurace = výjimka se srozumitelným
výpisem všech chyb (aplikace při startu nenastartuje).

```ts
function defineClientConfig(input: ClientConfigInput): ClientConfig
```

### defineExtension

function · `packages/core/src/extensions/types.ts`

_Bez popisu._

```ts
function defineExtension(ext: ClientExtension): ClientExtension
```

### resolveModules

function · `packages/core/src/modules/registry.ts`

Z dostupných manifestů vybere zapnuté moduly a seřadí je tak, aby závislosti
šly vždy před modulem, který je potřebuje. Vypnutý modul se nikde neobjeví.

```ts
function resolveModules(enabled: readonly ModuleId[], available: readonly ModuleManifest[]): ModuleManifest[]
```

### ClientConfigError

class · `packages/core/src/config/define.ts`

_Bez popisu._

```ts
class ClientConfigError extends Error {
  constructor(public readonly slug: string, public readonly issues: string[]);
}
```

### ModuleResolutionError

class · `packages/core/src/modules/registry.ts`

_Bez popisu._

```ts
class ModuleResolutionError extends Error {
  constructor(public readonly problems: string[]);
}
```

### INTERNAL_NAME

const · `packages/core/src/config/schema.ts`

Interní pracovní název jádra. Nesmí se dostat do nic, co vidí klient.

```ts
const INTERNAL_NAME: "rebar"
```

### clientConfigSchema

const · `packages/core/src/config/schema.ts`

_Bez popisu._

```ts
const clientConfigSchema: z.ZodObject<{ slug: z.ZodString; branding: z.ZodObject<{ name: z.ZodString; shortName: z.ZodString; accentColor: z.ZodString; logo: z.ZodOptional<z.ZodString>; supportEmail: z.ZodOptional<z.ZodEmail>; }, z.core.$strict>; locale: z.ZodPrefa…
```

### EventMap

interface · `packages/core/src/extensions/types.ts`

Události, na které se dá z rozšíření klienta reagovat. Seznam roste s moduly
(fáze 4); rozšíření se k jádru připojuje jen přes tyto události a sloty.

```ts
interface EventMap {
  "zakazky.created": { id: string };
  /** Poptávka byla převedena na zakázku. */
  "poptavky.converted": { id: string; jobId: string };
}
```

### ClientConfig

type · `packages/core/src/config/schema.ts`

_Bez popisu._

```ts
type ClientConfig = z.output<typeof clientConfigSchema>;
```

### ClientConfigInput

type · `packages/core/src/config/schema.ts`

_Bez popisu._

```ts
type ClientConfigInput = z.input<typeof clientConfigSchema>;
```

### ClientExtension

type · `packages/core/src/extensions/types.ts`

_Bez popisu._

```ts
type ClientExtension = {
  /** Unikátní id rozšíření (kebab-case). */
  id: string;
  /** Reakce na události jádra. */
  on?: { [K in EventName]?: (payload: EventMap[K]) => void | Promise<void> };
};
```

### EventName

type · `packages/core/src/extensions/types.ts`

_Bez popisu._

```ts
type EventName = keyof EventMap;
```
