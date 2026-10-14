# @rebar/zakazky/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/server` (soubor `packages/modules/zakazky/src/server.ts`). Exportů: 22, z toho s popisem 11.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`changeLabel`](#changelabel) | function |  |  |
| [`lineTotalMinor`](#linetotalminor) | function | Cena řádku v haléřích: množství (desetinný řetězec, 3 místa) × jednotková cena, zaokrouhleno půl od nuly. |  |
| [`notifyJobTeam`](#notifyjobteam) | function | Upozorní tým zakázky událostí z katalogu. K parametrům doplní `number` (číslo zakázky), záznamem události je zakázka (příjemce bez práva na zakázku upozornění nedostane). Odkaz se skládá ze šablony události; `urlSuffix` ho zakončí (např. `?tab=fakturace`), `url` ho přepíše celý. |  |
| [`CHANGE_STATUSES`](#change_statuses) | const |  |  |
| [`COST_CATEGORIES`](#cost_categories) | const | Kategorie nákladů zakázky. Moduly (sklad, stroje, docházka) dodávají náklady pod těmito klíči. |  |
| [`COST_CATEGORY_KEYS`](#cost_category_keys) | const |  |  |
| [`JOB_PIPELINE`](#job_pipeline) | const |  |  |
| [`JOB_TEAM_AUDIENCES`](#job_team_audiences) | const | Skupiny příjemců pro události, které jdou přes `notifyJobTeam` (viz `team.ts`): vedoucí a členové týmu zakázky (bez toho, kdo změnu udělal) a další zainteresovaní, které volající doplní (odpovědný za vadu…). |  |
| [`LOST_REASON_LOOKUP`](#lost_reason_lookup) | const | Číselník důvodů prohry (seed v manifestu). |  |
| [`SOURCE_LOOKUP`](#source_lookup) | const | Číselník zdrojů obchodu (odkud zakázka přišla; seed v manifestu). |  |
| [`commands`](#commands) | const |  |  |
| [`entities`](#entities) | const |  |  |
| [`job`](schema.md#job) | const | Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení. | v `@rebar/zakazky/schema` |
| [`jobEntity`](#jobentity) | const | Zakázka. Vedoucí a členové týmu ji vidí i při oprávnění „jen moje“. |  |
| [`jobMember`](schema.md#jobmember) | const | Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“. | v `@rebar/zakazky/schema` |
| [`orderEntity`](#orderentity) | const | Objednávka dodavateli na zakázku. Zakládá se příkazem na zakázce; po schválení je zamčená. |  |
| [`server`](#server) | const | Základ modulu (zakázka, tým, legacy příkazy) a oblasti ADR 015, každá ve své složce se svým vlastníkem. |  |
| [`teamAdd`](#teamadd) | const |  |  |
| [`teamList`](#teamlist) | const |  |  |
| [`teamRemove`](#teamremove) | const |  |  |
| [`ChangeStatus`](#changestatus) | type |  |  |
| [`CostCategory`](#costcategory) | type |  |  |

### changeLabel

function · `packages/modules/zakazky/src/economics.ts`

_Bez popisu._

```ts
function changeLabel(n: number, amountMinor: number): string
```

### lineTotalMinor

function · `packages/modules/zakazky/src/economics.ts`

Cena řádku v haléřích: množství (desetinný řetězec, 3 místa) × jednotková cena, zaokrouhleno půl od nuly.

```ts
function lineTotalMinor(quantity: string | number, unitMinor: number): number
```

### notifyJobTeam

function · `packages/modules/zakazky/src/team.ts`

Upozorní tým zakázky událostí z katalogu. K parametrům doplní `number` (číslo zakázky), záznamem události je
zakázka (příjemce bez práva na zakázku upozornění nedostane). Odkaz se skládá ze šablony události; `urlSuffix`
ho zakončí (např. `?tab=fakturace`), `url` ho přepíše celý.

```ts
async function notifyJobTeam<D extends AnyEventDef>(db: Executor, jobId: string, actorId: string | null, event: D, params: Omit<NotifyInput<D>["params"], "number">, opts: { extraUserIds?: readonly (string | null | undefined)[]; urlSuffix?: string; url?: string; dedupe?: string; } = {}): Promise<NotifyResult | null>
```

### CHANGE_STATUSES

const · `packages/modules/zakazky/src/economics.ts`

_Bez popisu._

```ts
const CHANGE_STATUSES: readonly ["draft", "sent", "approved", "rejected"]
```

### COST_CATEGORIES

const · `packages/modules/zakazky/src/economics.ts`

Kategorie nákladů zakázky. Moduly (sklad, stroje, docházka) dodávají náklady pod těmito klíči.

```ts
const COST_CATEGORIES: readonly [{ readonly key: "labour"; readonly label: "Práce"; readonly hint: "z docházky × hodinový náklad zaměstnance"; }, { readonly key: "material"; readonly label: "Materiál"; readonly hint: "výdejky ze skladu minus vratky, ruční nákupy…
```

### COST_CATEGORY_KEYS

const · `packages/modules/zakazky/src/economics.ts`

_Bez popisu._

```ts
const COST_CATEGORY_KEYS: ["other" | "machines" | "material" | "labour" | "subcontract", ...("other" | "machines" | "material" | "labour" | "subcontract")[]]
```

### JOB_PIPELINE

const · `packages/modules/zakazky/src/lifecycle/transitions.ts`

_Bez popisu._

```ts
const JOB_PIPELINE: { readonly entityType: "job"; readonly key: "default"; }
```

### JOB_TEAM_AUDIENCES

const · `packages/modules/zakazky/src/notifications.ts`

Skupiny příjemců pro události, které jdou přes `notifyJobTeam` (viz `team.ts`): vedoucí a členové týmu zakázky
(bez toho, kdo změnu udělal) a další zainteresovaní, které volající doplní (odpovědný za vadu…).

```ts
const JOB_TEAM_AUDIENCES: { readonly team: "Vedoucí a tým zakázky"; readonly extra: "Další zainteresovaní (odpovědný, fakturace…)"; }
```

### LOST_REASON_LOOKUP

const · `packages/modules/zakazky/src/server.ts`

Číselník důvodů prohry (seed v manifestu).

```ts
const LOST_REASON_LOOKUP: "job.lost_reason"
```

### SOURCE_LOOKUP

const · `packages/modules/zakazky/src/server.ts`

Číselník zdrojů obchodu (odkud zakázka přišla; seed v manifestu).

```ts
const SOURCE_LOOKUP: "job.source"
```

### commands

const · `packages/modules/zakazky/src/commands.ts`

_Bez popisu._

```ts
const commands: (import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; }, z.core.$strip>, { managerId: string | null; members: { userId: string; role: string | null; name: string; }[]; }> | import("@rebar/core/module-server").Comm…
```

### entities

const · `packages/modules/zakazky/src/server.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### jobEntity

const · `packages/modules/zakazky/src/server.ts`

Zakázka. Vedoucí a členové týmu ji vidí i při oprávnění „jen moje“.

```ts
const jobEntity: import("@rebar/core/entities").EntityDef
```

### orderEntity

const · `packages/modules/zakazky/src/orders/entity.ts`

Objednávka dodavateli na zakázku. Zakládá se příkazem na zakázce; po schválení je zamčená.

```ts
const orderEntity: import("@rebar/core/entities").EntityDef
```

### server

const · `packages/modules/zakazky/src/server.ts`

Základ modulu (zakázka, tým, legacy příkazy) a oblasti ADR 015, každá ve své složce se svým vlastníkem.

```ts
const server: import("@rebar/core/module-server").ModuleServer
```

### teamAdd

const · `packages/modules/zakazky/src/commands.ts`

_Bez popisu._

```ts
const teamAdd: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; userId: z.ZodUUID; role: z.ZodOptional<z.ZodNullable<z.ZodString>>; }, z.core.$strip>, void>
```

### teamList

const · `packages/modules/zakazky/src/commands.ts`

_Bez popisu._

```ts
const teamList: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; }, z.core.$strip>, { managerId: string | null; members: { userId: string; role: string | null; name: string; }[]; }>
```

### teamRemove

const · `packages/modules/zakazky/src/commands.ts`

_Bez popisu._

```ts
const teamRemove: import("@rebar/core/module-server").CommandDef<z.ZodObject<{ jobId: z.ZodUUID; userId: z.ZodUUID; }, z.core.$strip>, void>
```

### ChangeStatus

type · `packages/modules/zakazky/src/economics.ts`

_Bez popisu._

```ts
type ChangeStatus = (typeof CHANGE_STATUSES)[number];
```

### CostCategory

type · `packages/modules/zakazky/src/economics.ts`

_Bez popisu._

```ts
type CostCategory = (typeof COST_CATEGORIES)[number]["key"];
```
