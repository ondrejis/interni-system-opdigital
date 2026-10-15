# @rebar/hodiny/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/hodiny/schema` (soubor `packages/modules/hodiny/src/schema.ts`). Exportů: 1, z toho s popisem 1.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`timeEntry`](#timeentry) | const | Odpracovaný čas: kdo, na které zakázce, případně u kterého úkolu, v který den a kolik minut (&gt; 0). Zakázka a úkol jsou měkké odkazy. Viditelnost se dědí od zakázky a úkolu (hodiny soukromé zakázky jsou soukromé), bez vlastního zámku. |  |

### timeEntry

const · `packages/modules/hodiny/src/schema.ts`

Odpracovaný čas: kdo, na které zakázce, případně u kterého úkolu, v který den a kolik minut (&gt; 0). Zakázka a úkol
jsou měkké odkazy. Viditelnost se dědí od zakázky a úkolu (hodiny soukromé zakázky jsou soukromé), bez vlastního zámku.

```ts
const timeEntry: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "time_entry"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "time_entry"; dataType: "date"; columnType: "PgTimestamp"; da…
```
