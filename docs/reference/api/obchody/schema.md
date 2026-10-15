# @rebar/obchody/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/obchody/schema` (soubor `packages/modules/obchody/src/schema.ts`). Exportů: 5, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`DEAL_RESULTS`](api.md#deal_results) | const | Výsledek obchodu: otevřený, vyhraný, prohraný (fáze pipeline jsou jen `open`, výsledek je tady). | v `@rebar/obchody/api` |
| [`DEAL_SOURCES`](api.md#deal_sources) | const | Zdroj obchodu. | v `@rebar/obchody/api` |
| [`deal`](#deal) | const | Obchod (příležitost). Pipeline `deal/default`: `stage_id` je stav pipeline (atribut `status`), `result` říká, zda je obchod otevřený, vyhraný, nebo prohraný. Viditelnost: kořen s vlastním zámkem. Odkazy na organizaci a kontakt jsou měkké. `next_activity_at`, `last_activity_at` a `next_task_id` jsou systémová pole, která píše modul Úkoly (`writeSystemFields`); `meta_leadgen_id` je idempotenční klíč Meta leadu. |  |
| [`dealParticipant`](#dealparticipant) | const | Další kontakty u obchodu (kromě hlavního kontaktu). Zdědí viditelnost obchodu. |  |
| [`dealStageHistory`](#dealstagehistory) | const | Historie fází obchodu: jeden řádek na pobyt ve fázi (`left_at` je prázdné u aktuální). Jen přírůstky; z ní se počítá doba ve fázi, konverze a rychlost obchodu. |  |

### deal

const · `packages/modules/obchody/src/schema.ts`

Obchod (příležitost). Pipeline `deal/default`: `stage_id` je stav pipeline (atribut `status`), `result` říká, zda je
obchod otevřený, vyhraný, nebo prohraný. Viditelnost: kořen s vlastním zámkem. Odkazy na organizaci a kontakt jsou
měkké. `next_activity_at`, `last_activity_at` a `next_task_id` jsou systémová pole, která píše modul Úkoly
(`writeSystemFields`); `meta_leadgen_id` je idempotenční klíč Meta leadu.

```ts
const deal: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "deal"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "deal"; dataType: "date"; columnType: "PgTimestamp"; data: Date; dr…
```

### dealParticipant

const · `packages/modules/obchody/src/schema.ts`

Další kontakty u obchodu (kromě hlavního kontaktu). Zdědí viditelnost obchodu.

```ts
const dealParticipant: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "deal_participant"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "deal_participant"; dataType: "date"; columnType: "PgTi…
```

### dealStageHistory

const · `packages/modules/obchody/src/schema.ts`

Historie fází obchodu: jeden řádek na pobyt ve fázi (`left_at` je prázdné u aktuální). Jen přírůstky; z ní se počítá
doba ve fázi, konverze a rychlost obchodu.

```ts
const dealStageHistory: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "deal_stage_history"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "deal_stage_history"; dataType: "string"; columnType: "PgUUI…
```
