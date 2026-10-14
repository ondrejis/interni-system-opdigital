# @rebar/dochazka/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/dochazka/schema` (soubor `packages/modules/dochazka/src/schema.ts`). Exportů: 2, z toho s popisem 2.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`timeEntry`](#timeentry) | const | Záznam docházky. Doba je v minutách. Zápis je buď ručně (od–do s přestávkou, nebo přímo hodiny), nebo z píchačky (`source = clock`): běžící záznam má `startedAt` a nemá `endedAt`. Zakázka a fáze jsou měkké odkazy (bez cizího klíče), aby docházka fungovala i bez modulů Zakázky a Realizace. `hourlyCostMinor` je snímek nákladu zaměstnance v době zápisu. |  |
| [`timeLock`](#timelock) | const | Uzavřený měsíc (podklad pro mzdy): v něm už se docházka nemění. |  |

### timeEntry

const · `packages/modules/dochazka/src/schema.ts`

Záznam docházky. Doba je v minutách. Zápis je buď ručně (od–do s přestávkou, nebo přímo hodiny), nebo z píchačky
(`source = clock`): běžící záznam má `startedAt` a nemá `endedAt`. Zakázka a fáze jsou měkké odkazy (bez cizího klíče),
aby docházka fungovala i bez modulů Zakázky a Realizace. `hourlyCostMinor` je snímek nákladu zaměstnance v době zápisu.

```ts
const timeEntry: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "time_entry"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "time_entry"; dataType: "date"; columnType: "PgTimestamp"; da…
```

### timeLock

const · `packages/modules/dochazka/src/schema.ts`

Uzavřený měsíc (podklad pro mzdy): v něm už se docházka nemění.

```ts
const timeLock: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "time_lock"; schema: undefined; columns: { month: import("drizzle-orm/pg-core").PgColumn<{ name: "month"; tableName: "time_lock"; dataType: "string"; columnType: "PgText"; data: stri…
```
