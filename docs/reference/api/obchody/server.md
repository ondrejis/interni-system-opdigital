# @rebar/obchody/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/obchody/server` (soubor `packages/modules/obchody/src/server.ts`). Exportů: 12, z toho s popisem 10.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`board`](#board) | function | Board (OBCH-05, 06, 07): sloupce = fáze výchozí pipeline, v nich otevřené obchody, které aktér smí vidět (rozsah „jen moje“ a soukromé záznamy řeší jádro), s počtem, součtem a váženým součtem (hodnota × pravděpodobnost fáze) a se zvýrazněním (bez další aktivity, hnití, neotevřený lead). V sloupci jsou nejdřív neotevřené leady, potom nejnovější. |  |
| [`createDealFromLead`](#createdealfromlead) | function | Založí obchod z Meta leadu (volá `reklama` z ingestu `leads`). Idempotentní podle `meta.leadgenId`: druhé volání vrátí existující obchod (`created=false`) a nic nezapíše, i při souběhu (unikátní index). Obchod padá do fáze z mapování formuláře (musí patřit do pipeline obchodů), má zdroj Meta, kampaň, sadu a reklamu a je „neotevřený“ (zvýrazněný na boardu, dokud ho někdo neotevře, R-42). Vlastníka a služby bere z mapování. |  |
| [`detail`](#detail) | function | Detail obchodu pro hlavičku, pás fází (s dny v každé fázi), blok „Další aktivita“ a časovou osu změn fází. Soukromý nebo cizí obchod (rozsah „jen moje“) se tváří jako neexistující. |  |
| [`DEAL_PIPELINE`](#deal_pipeline) | const | Entita a klíč výchozí pipeline obchodů (`pipeline.entity_type = "deal"`, `key = "default"`). |  |
| [`LOST_REASON_LOOKUP`](api.md#lost_reason_lookup) | const | Číselník důvodů prohry obchodu (seed v manifestu, upravitelný v Nastavení). | v `@rebar/obchody/api` |
| [`deal`](schema.md#deal) | const | Obchod (příležitost). Pipeline `deal/default`: `stage_id` je stav pipeline (atribut `status`), `result` říká, zda je obchod otevřený, vyhraný, nebo prohraný. Viditelnost: kořen s vlastním zámkem. Odkazy na organizaci a kontakt jsou měkké. `next_activity_at`, `last_activity_at` a `next_task_id` jsou systémová pole, která píše modul Úkoly (`writeSystemFields`); `meta_leadgen_id` je idempotenční klíč Meta leadu. | v `@rebar/obchody/schema` |
| [`dealEntity`](#dealentity) | const | Obchod (příležitost) v pipeline `deal/default` (kanban podle atributu `status`). Výsledek (`result`) určují příkazy `win`/`lose`/`reopen`; fáze se přesouvá `moveStage`. Systémová pole píše modul Úkoly, `first_opened_at` příkaz `markOpened`. |  |
| [`dealHooks`](#dealhooks) | const |  |  |
| [`dealParticipant`](schema.md#dealparticipant) | const | Další kontakty u obchodu (kromě hlavního kontaktu). Zdědí viditelnost obchodu. | v `@rebar/obchody/schema` |
| [`dealStageHistory`](schema.md#dealstagehistory) | const | Historie fází obchodu: jeden řádek na pobyt ve fázi (`left_at` je prázdné u aktuální). Jen přírůstky; z ní se počítá doba ve fázi, konverze a rychlost obchodu. | v `@rebar/obchody/schema` |
| [`entities`](#entities) | const |  |  |
| [`server`](#server) | const | Serverová část modulu „obchody“: společné entity a příkazy plus oblasti. |  |

### board

function · `packages/modules/obchody/src/deals/queries.ts`

Board (OBCH-05, 06, 07): sloupce = fáze výchozí pipeline, v nich otevřené obchody, které aktér smí vidět (rozsah „jen
moje“ a soukromé záznamy řeší jádro), s počtem, součtem a váženým součtem (hodnota × pravděpodobnost fáze) a se
zvýrazněním (bez další aktivity, hnití, neotevřený lead). V sloupci jsou nejdřív neotevřené leady, potom nejnovější.

```ts
async function board(ctx: Ctx, deps: ModuleDeps, input: BoardInput, now: Date = new Date()): Promise<BoardResult>
```

### createDealFromLead

function · `packages/modules/obchody/src/deals/lead.ts`

Založí obchod z Meta leadu (volá `reklama` z ingestu `leads`). Idempotentní podle `meta.leadgenId`: druhé volání
vrátí existující obchod (`created=false`) a nic nezapíše, i při souběhu (unikátní index). Obchod padá do fáze
z mapování formuláře (musí patřit do pipeline obchodů), má zdroj Meta, kampaň, sadu a reklamu a je „neotevřený“
(zvýrazněný na boardu, dokud ho někdo neotevře, R-42). Vlastníka a služby bere z mapování.

```ts
async function createDealFromLead(ctx: Ctx, deps: ModuleDeps, input: CreateDealFromLeadInput): Promise<{ dealId: string; created: boolean }>
```

### detail

function · `packages/modules/obchody/src/deals/queries.ts`

Detail obchodu pro hlavičku, pás fází (s dny v každé fázi), blok „Další aktivita“ a časovou osu změn fází.
Soukromý nebo cizí obchod (rozsah „jen moje“) se tváří jako neexistující.

```ts
async function detail(ctx: Ctx, deps: ModuleDeps, dealId: string, now: Date = new Date()): Promise<DealDetail>
```

### DEAL_PIPELINE

const · `packages/modules/obchody/src/shared.ts`

Entita a klíč výchozí pipeline obchodů (`pipeline.entity_type = "deal"`, `key = "default"`).

```ts
const DEAL_PIPELINE: { readonly entityType: "deal"; readonly key: "default"; }
```

### dealEntity

const · `packages/modules/obchody/src/entities.ts`

Obchod (příležitost) v pipeline `deal/default` (kanban podle atributu `status`). Výsledek (`result`) určují příkazy
`win`/`lose`/`reopen`; fáze se přesouvá `moveStage`. Systémová pole píše modul Úkoly, `first_opened_at` příkaz `markOpened`.

```ts
const dealEntity: import("@rebar/core/entities").EntityDef
```

### dealHooks

const · `packages/modules/obchody/src/deals/hooks.ts`

_Bez popisu._

```ts
const dealHooks: Hooks
```

### entities

const · `packages/modules/obchody/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### server

const · `packages/modules/obchody/src/server.ts`

Serverová část modulu „obchody“: společné entity a příkazy plus oblasti.

```ts
const server: import("@rebar/core/module-server").ModuleServer
```
