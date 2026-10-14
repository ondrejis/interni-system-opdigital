# @rebar/zakazky/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/zakazky/schema` (soubor `packages/modules/zakazky/src/schema.ts`). Exportů: 5, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`job`](#job) | const | Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení. |  |
| [`jobMember`](#jobmember) | const | Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“. |  |
| [`jobParticipant`](#jobparticipant) | const | Další lidé na zakázce kromě hlavní kontaktní osoby (investor, TDI, projektant…), s rolí na zakázce. |  |
| [`jobStageHistory`](#jobstagehistory) | const | Historie stavů zakázky: jeden řádek na pobyt ve stavu (`left_at` je prázdné u aktuálního). Zapisuje ji změna stavu (`lifecycle/history.ts`); z ní se počítají dny ve stavu (pás fází), konverze a rychlost obchodu. |  |
| [`jobTemplate`](#jobtemplate) | const | Šablona zakázky: úkoly, složky a role týmu v JSON (tvar určuje `templates` v modulu). |  |

### job

const · `packages/modules/zakazky/src/schema.ts`

Zakázka. Číslo se přiděluje z číselné řady `zakazky.cislo` ve stejné transakci jako založení.

```ts
const job: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job"; dataType: "date"; columnType: "PgTimestamp"; data: Date; driv…
```

### jobMember

const · `packages/modules/zakazky/src/schema.ts`

Tým zakázky. Člen týmu zakázku vidí i při oprávnění „jen moje“.

```ts
const jobMember: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_member"; schema: undefined; columns: { jobId: import("drizzle-orm/pg-core").PgColumn<{ name: "job_id"; tableName: "job_member"; dataType: "string"; columnType: "PgUUID"; data: s…
```

### jobParticipant

const · `packages/modules/zakazky/src/schema.ts`

Další lidé na zakázce kromě hlavní kontaktní osoby (investor, TDI, projektant…), s rolí na zakázce.

```ts
const jobParticipant: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_participant"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_participant"; dataType: "date"; columnType: "PgTime…
```

### jobStageHistory

const · `packages/modules/zakazky/src/schema.ts`

Historie stavů zakázky: jeden řádek na pobyt ve stavu (`left_at` je prázdné u aktuálního). Zapisuje ji změna stavu
(`lifecycle/history.ts`); z ní se počítají dny ve stavu (pás fází), konverze a rychlost obchodu.

```ts
const jobStageHistory: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_stage_history"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_stage_history"; dataType: "string"; columnType: "PgUUID"…
```

### jobTemplate

const · `packages/modules/zakazky/src/schema.ts`

Šablona zakázky: úkoly, složky a role týmu v JSON (tvar určuje `templates` v modulu).

```ts
const jobTemplate: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_template"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_template"; dataType: "date"; columnType: "PgTimestamp"…
```
