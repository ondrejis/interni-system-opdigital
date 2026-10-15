# @rebar/core/manifest

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/manifest` (soubor `packages/core/src/modules/public.ts`). Exportů: 12, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`defineModule`](#definemodule) | function |  |  |
| [`defineNotificationEvent`](#definenotificationevent) | function |  |  |
| [`CORE_PERMISSIONS`](#core_permissions) | const | Oprávnění, která patří platformě, ne modulu. |  |
| [`MODULE_IDS`](#module_ids) | const | Identifikátory modulů. Jediný zdroj pravdy — konfigurace klienta se validuje proti tomuto seznamu. Pořadí = pořadí závislostí = pořadí migrací (hard závislost vždy dřív než její konzument); hlídá ho test. |  |
| [`AnyEventDef`](#anyeventdef) | type | Zkratka pro libovolnou definici (pole, mapy). |  |
| [`ModuleId`](#moduleid) | type |  |  |
| [`ModuleManifest`](#modulemanifest) | type |  |  |
| [`ModuleSeed`](#moduleseed) | type | Výchozí data modulu (pipeline, číselníky, číselné řady). Doplní se při seedu klienta, jen když modul běží. |  |
| [`NavItem`](#navitem) | type |  |  |
| [`NotificationEventDef`](#notificationeventdef) | type |  |  |
| [`PageDef`](#pagedef) | type | Stránka modulu mimo seznamy entit; adresa i oprávnění jsou v manifestu, vykreslení v UI modulu. |  |
| [`PermissionDef`](#permissiondef) | type |  |  |

### defineModule

function · `packages/core/src/modules/manifest.ts`

_Bez popisu._

```ts
function defineModule<const M extends ModuleManifest>(manifest: M): M
```

### defineNotificationEvent

function · `packages/core/src/notifications/types.ts`

_Bez popisu._

```ts
function defineNotificationEvent<const K extends string, const P extends string, const A extends string>(def: NotificationEventDef<K, P, A>): NotificationEventDef<K, P, A>
```

### CORE_PERMISSIONS

const · `packages/core/src/modules/manifest.ts`

Oprávnění, která patří platformě, ne modulu.

```ts
const CORE_PERMISSIONS: readonly PermissionDef[]
```

### MODULE_IDS

const · `packages/core/src/modules/ids.ts`

Identifikátory modulů. Jediný zdroj pravdy — konfigurace klienta se validuje proti tomuto seznamu.
Pořadí = pořadí závislostí = pořadí migrací (hard závislost vždy dřív než její konzument); hlídá ho test.

```ts
const MODULE_IDS: readonly ["kontakty", "klienti", "disk", "zakazky", "obchody", "ukoly", "kalendar", "hodiny", "finance", "reklama", "sablony-emailu", "muj-prostor", "prehled"]
```

### AnyEventDef

type · `packages/core/src/notifications/types.ts`

Zkratka pro libovolnou definici (pole, mapy).

```ts
type AnyEventDef = NotificationEventDef<string, string, string>;
```

### ModuleId

type · `packages/core/src/modules/ids.ts`

_Bez popisu._

```ts
type ModuleId = (typeof MODULE_IDS)[number];
```

### ModuleManifest

type · `packages/core/src/modules/manifest.ts`

_Bez popisu._

```ts
type ModuleManifest = {
  id: ModuleId;
  name: string;
  description: string;
  icon: string;
  /** Moduly, bez kterých tento nefunguje (musí být zapnuté). */
  dependsOn?: readonly ModuleId[];
  nav: readonly NavItem[];
  /** Stránky modulu (kromě seznamů a detailů entit, které vznikají z registru). */
  pages?: readonly PageDef[];
  permissions: readonly PermissionDef[];
  /** Klíče entit modulu v registru entit (fáze 3). */
  entities?: readonly string[];
  /** Události upozornění modulu (katalog, ze kterého čerpá nastavení klienta i předvolby uživatelů). */
  notifications?: readonly AnyEventDef[];
  seed?: ModuleSeed;
};
```

### ModuleSeed

type · `packages/core/src/modules/manifest.ts`

Výchozí data modulu (pipeline, číselníky, číselné řady). Doplní se při seedu klienta, jen když modul běží.

```ts
type ModuleSeed = {
  pipelines?: readonly PipelineDef[];
  lookups?: readonly LookupDef[];
  series?: readonly SeriesDef[];
  /** Výchozí sdílené pohledy entit (zakládají se, až existuje první uživatel). */
  views?: readonly SeedViewDef[];
};
```

### NavItem

type · `packages/core/src/modules/manifest.ts`

_Bez popisu._

```ts
type NavItem = {
  label: string;
  href: string;
  /** Název ikony z lucide (např. "briefcase"); mapuje ji `packages/ui`. */
  icon: string;
  /** Položka se zobrazí uživateli, který má kterékoli z uvedených oprávnění. */
  permission?: string | readonly string[];
  /** Nadpis sekce v postranním panelu (např. „Obchod“, „Provoz“); bez ní patří položka do sekce „Moduly“. */
  group?: string;
  /** Adresa nadřazené položky: tato se zobrazí pod ní jako podpoložka (modul má v panelu jedno místo). */
  parent?: string;
  /** Položka je kandidátem na spodní lištu mobilní navigace (zobrazí se první tři, které uživatel smí vidět). */
  bottom?: boolean;
  /** Pořadí v sekci (nižší dřív); bez něj 100. Při shodě rozhoduje pořadí modulů v `MODULE_IDS`. */
  order?: number;
};
```

### NotificationEventDef

type · `packages/core/src/notifications/types.ts`

_Bez popisu._

```ts
type NotificationEventDef<
  K extends string = string,
  P extends string = string,
  A extends string = string,
> = {
  /** Stabilní klíč, např. `comment.mention`, `stroje.deadline`. Na klíč se odkazují nastavení klienta i předvolby uživatelů. */
  key: K;
  /** Krátký název do nastavení: „Přidělen úkol“. */
  label: string;
  /** Kdy a komu upozornění přijde (česky, jednou větou). */
  description: string;
  /** Skupina v nastavení: „Úkoly“, „Zakázky“, „Stroje“… */
  group: string;
  severity: Severity;
  /** Výchozí kanály (klient i uživatel je mohou změnit). */
  channels: Partial<ChannelFlags>;
  /** Pojmenované skupiny příjemců, které při vyvolání události dodá volající (např. `assignee`, `team`). */
  audiences: Record<A, string>;
  /**
   * Výchozí příjemci: názvy skupin z `audiences`, `perm:<oprávnění>` (všichni s oprávněním) nebo `role:<klíč role>`.
   * Správce klienta je v Nastavení může změnit.
   */
  recipients: readonly string[];
  params: Record<P, ParamDef>;
  template: NotificationTemplate;
  /**
   * Typ záznamu, kterého se událost týká (`job`, `invoice`…). Příjemce, který záznam nesmí číst, upozornění nedostane.
   * Volající může typ upřesnit (komentář k libovolnému záznamu).
   */
  entity?: string;
  /** Oprávnění, které musí příjemce mít (kterékoli z nich), když událost nemá záznam s politikou přístupu. */
  access?: string | readonly string[];
  dedupe?: DedupeMode;
  /**
   * Slučování: nepřečtené upozornění téže události a záznamu se po tuto dobu aktualizuje místo přidání dalšího
   * (20 změn harmonogramu = 1 upozornění „… (20×)“). Bez hodnoty se neslučuje.
   */
  mergeWindowSeconds?: number;
  /** Zdržení push zprávy, aby se bouřka změn stihla sloučit. */
  debounceSeconds?: number;
// … (zkráceno, celá deklarace je ve zdroji)
```

### PageDef

type · `packages/core/src/modules/manifest.ts`

Stránka modulu mimo seznamy entit; adresa i oprávnění jsou v manifestu, vykreslení v UI modulu.

```ts
type PageDef = {
  /** Např. `/dochazka`; stránka dostane i podadresy (`/dochazka/schvalovani`). */
  path: string;
  title: string;
  permission?: string | readonly string[];
};
```

### PermissionDef

type · `packages/core/src/modules/manifest.ts`

_Bez popisu._

```ts
type PermissionDef = {
  /** `<modul>.<akce>`, např. `zakazky.write`. Prefix musí odpovídat id modulu. */
  key: string;
  label: string;
  description?: string;
};
```
