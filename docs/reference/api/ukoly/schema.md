# @rebar/ukoly/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/ukoly/schema` (soubor `packages/modules/ukoly/src/schema.ts`). Exportů: 7, z toho s popisem 7.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ATTENDEE_KINDS`](api.md#attendee_kinds) | const | Druh účastníka úkolu/schůzky: uživatel systému, kontakt, nebo prosté e-mailové adresy. | v `@rebar/ukoly/api` |
| [`TASK_PRIORITIES`](api.md#task_priorities) | const | Priorita úkolu: Žádná, Nízká, Střední, Vysoká, Urgentní. | v `@rebar/ukoly/api` |
| [`TASK_STATUSES`](api.md#task_statuses) | const | Stav úkolu: K řešení, Probíhá, Hotovo, Zrušeno. | v `@rebar/ukoly/api` |
| [`note`](#note) | const | Poznámka s formátovaným textem (Tiptap JSON v `body_json`, prostý text v `body_text` pro hledání). Má nejvýše jednu vazbu (obchod, organizace, kontakt, zakázka), nebo je samostatná. Viditelnost: dědí od obchodu a zakázky, smí mít vlastní zámek (soukromá organizace a kontakt do poznámek nedědí, R-31). |  |
| [`task`](#task) | const | Úkol a aktivita (hovor, schůzka, e-mail, termín jsou typy úkolu). Popis je prostý text, podúkol má jednu úroveň (`parent_id`). Vazby na obchod, organizaci, kontakt, zakázku a její fázi jsou měkké (bez cizího klíče). Viditelnost: dědí od obchodu, zakázky a nadřazeného úkolu a smí mít i vlastní zámek. |  |
| [`taskAttendee`](#taskattendee) | const | Účastník úkolu nebo schůzky: uživatel (`ref` = id), kontakt (`ref` = id), nebo e-mail (`ref` = adresa). |  |
| [`taskType`](#tasktype) | const | Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…). Systémové typy se nemažou; `is_calendar_event` zobrazí úkol v kalendáři. |  |

### note

const · `packages/modules/ukoly/src/schema/notes.ts`

Poznámka s formátovaným textem (Tiptap JSON v `body_json`, prostý text v `body_text` pro hledání). Má nejvýše jednu
vazbu (obchod, organizace, kontakt, zakázka), nebo je samostatná. Viditelnost: dědí od obchodu a zakázky,
smí mít vlastní zámek (soukromá organizace a kontakt do poznámek nedědí, R-31).

```ts
const note: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "note"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "note"; dataType: "date"; columnType: "PgTimestamp"; data: Date; dr…
```

### task

const · `packages/modules/ukoly/src/schema.ts`

Úkol a aktivita (hovor, schůzka, e-mail, termín jsou typy úkolu). Popis je prostý text, podúkol má jednu úroveň
(`parent_id`). Vazby na obchod, organizaci, kontakt, zakázku a její fázi jsou měkké (bez cizího klíče). Viditelnost:
dědí od obchodu, zakázky a nadřazeného úkolu a smí mít i vlastní zámek.

```ts
const task: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "task"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "task"; dataType: "date"; columnType: "PgTimestamp"; data: Date; dr…
```

### taskAttendee

const · `packages/modules/ukoly/src/schema.ts`

Účastník úkolu nebo schůzky: uživatel (`ref` = id), kontakt (`ref` = id), nebo e-mail (`ref` = adresa).

```ts
const taskAttendee: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "task_attendee"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "task_attendee"; dataType: "date"; columnType: "PgTimestam…
```

### taskType

const · `packages/modules/ukoly/src/schema.ts`

Typ úkolu (Úkol, Hovor, Schůzka, E-mail, Termín…). Systémové typy se nemažou; `is_calendar_event` zobrazí úkol v kalendáři.

```ts
const taskType: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "task_type"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "task_type"; dataType: "date"; columnType: "PgTimestamp"; data…
```
