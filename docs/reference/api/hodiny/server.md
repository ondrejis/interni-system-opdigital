# @rebar/hodiny/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/hodiny/server` (soubor `packages/modules/hodiny/src/server.ts`). Exportů: 4, z toho s popisem 3.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`entities`](#entities) | const |  |  |
| [`server`](#server) | const | Serverová část modulu „hodiny“: entita záznamu, příkazy a metriky nástěnek. |  |
| [`timeEntry`](schema.md#timeentry) | const | Odpracovaný čas: kdo, na které zakázce, případně u kterého úkolu, v který den a kolik minut (&gt; 0). Zakázka a úkol jsou měkké odkazy. Viditelnost se dědí od zakázky a úkolu (hodiny soukromé zakázky jsou soukromé), bez vlastního zámku. | v `@rebar/hodiny/schema` |
| [`timeEntryEntity`](#timeentryentity) | const | Záznam odpracovaného času. Rozsah „jen moje“: vlastní záznamy. Viditelnost se dědí od zakázky a úkolu (soukromá zakázka = soukromé hodiny), vlastní zámek nemá. |  |

### entities

const · `packages/modules/hodiny/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### server

const · `packages/modules/hodiny/src/server.ts`

Serverová část modulu „hodiny“: entita záznamu, příkazy a metriky nástěnek.

```ts
const server: { readonly entities: import("@rebar/core/entities").EntityDef[]; readonly commands: readonly import("@rebar/core/module-server").CommandDef[]; readonly dashboardMetrics: import("@rebar/core/module-server").DashboardMetricDef[]; readonly pr…
```

### timeEntryEntity

const · `packages/modules/hodiny/src/entities.ts`

Záznam odpracovaného času. Rozsah „jen moje“: vlastní záznamy. Viditelnost se dědí od zakázky a úkolu (soukromá
zakázka = soukromé hodiny), vlastní zámek nemá.

```ts
const timeEntryEntity: import("@rebar/core/entities").EntityDef
```
