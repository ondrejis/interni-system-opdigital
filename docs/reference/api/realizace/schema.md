# @rebar/realizace/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/realizace/schema` (soubor `packages/modules/realizace/src/schema.ts`). Exportů: 5, z toho s popisem 4.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`defect`](#defect) | const | Vada nebo reklamace na zakázce. Stav je pipeline (kanban), takže jde spravovat jako ostatní záznamy. |  |
| [`handoverItem`](#handoveritem) | const |  |  |
| [`handoverProtocol`](#handoverprotocol) | const | Předávací protokol zakázky (i částečné předání). Podpis zákazníka je soubor připojený k zakázce. |  |
| [`jobPhase`](#jobphase) | const | Fáze harmonogramu zakázky. Termíny jsou data (pracovní dny řeší výpočty); `baseline*` je výchozí plán, `actual*` skutečnost. Stav plyne z průběhu (0 % plánováno, 1–99 % probíhá, 100 % hotovo). |  |
| [`siteDiary`](#sitediary) | const | Stavební deník: jeden zápis na zakázku a den. |  |

### defect

const · `packages/modules/realizace/src/schema.ts`

Vada nebo reklamace na zakázce. Stav je pipeline (kanban), takže jde spravovat jako ostatní záznamy.

```ts
const defect: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "defect"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "defect"; dataType: "date"; columnType: "PgTimestamp"; data: Date…
```

### handoverItem

const · `packages/modules/realizace/src/schema.ts`

_Bez popisu._

```ts
const handoverItem: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "handover_item"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "handover_item"; dataType: "string"; columnType: "PgUUID"; data: …
```

### handoverProtocol

const · `packages/modules/realizace/src/schema.ts`

Předávací protokol zakázky (i částečné předání). Podpis zákazníka je soubor připojený k zakázce.

```ts
const handoverProtocol: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "handover_protocol"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "handover_protocol"; dataType: "date"; columnType: "Pg…
```

### jobPhase

const · `packages/modules/realizace/src/schema.ts`

Fáze harmonogramu zakázky. Termíny jsou data (pracovní dny řeší výpočty); `baseline*` je výchozí plán,
`actual*` skutečnost. Stav plyne z průběhu (0 % plánováno, 1–99 % probíhá, 100 % hotovo).

```ts
const jobPhase: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "job_phase"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "job_phase"; dataType: "date"; columnType: "PgTimestamp"; data…
```

### siteDiary

const · `packages/modules/realizace/src/schema.ts`

Stavební deník: jeden zápis na zakázku a den.

```ts
const siteDiary: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "site_diary"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "site_diary"; dataType: "date"; columnType: "PgTimestamp"; da…
```
