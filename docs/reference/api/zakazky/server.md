# @rebar/zakazky/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/server` (soubor `packages/modules/zakazky/src/server.ts`). Exportů: 12, z toho s popisem 6.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`JOB_PIPELINE`](#job_pipeline) | const |  |  |
| [`LOST_REASON_LOOKUP`](#lost_reason_lookup) | const | Číselník důvodů prohry (seed v manifestu). |  |
| [`SOURCE_LOOKUP`](#source_lookup) | const | Číselník zdrojů obchodu (odkud zakázka přišla; seed v manifestu). |  |
| [`commands`](#commands) | const |  |  |
| [`entities`](#entities) | const |  |  |
| [`job`](schema.md#job) | const | Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení. | v `@rebar/zakazky/schema` |
| [`jobEntity`](#jobentity) | const | Zakázka. Vedoucí a členové týmu ji vidí i při oprávnění „jen moje“. |  |
| [`jobMember`](schema.md#jobmember) | const | Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“. | v `@rebar/zakazky/schema` |
| [`server`](#server) | const | Základ modulu (zakázka, tým, legacy příkazy) a oblasti ADR 015, každá ve své složce se svým vlastníkem. |  |
| [`teamAdd`](#teamadd) | const |  |  |
| [`teamList`](#teamlist) | const |  |  |
| [`teamRemove`](#teamremove) | const |  |  |

### JOB_PIPELINE

const · `packages/modules/zakazky/src/lifecycle/transitions.ts`

_Bez popisu._

```ts
const JOB_PIPELINE: { readonly entityType: "job"; readonly key: "default"; }
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
