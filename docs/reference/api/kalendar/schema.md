# @rebar/kalendar/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kalendar/schema` (soubor `packages/modules/kalendar/src/schema.ts`). Exportů: 6, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`calendarFeed`](#calendarfeed) | const | Osobní tajný odkaz na odběr kalendáře (iCalendar) pro Google, Apple, Outlook. V databázi je jen otisk (SHA-256) tokenu, takže únik databáze odkazy neprozradí; token se uživateli ukáže jen při vytvoření. |  |
| [`calendarImport`](#calendarimport) | const | Import cizího kalendáře (tajná adresa iCal z Googlu nebo iCloudu): v systému se ukáže jako „obsazeno“. |  |
| [`calendarResource`](#calendarresource) | const | Zdroj, který lze v kalendáři obsadit: zasedačka, projektor, školicí místnost… (stroje mají vlastní rezervace). |  |
| [`event`](#event) | const | Událost. Časy jsou okamžiky (UTC). U celodenní události je `startsAt` místní půlnoc prvního dne a `endsAt` místní půlnoc dne po posledním (jako v iCalendar). Opakování (`recurrence`) se rozbaluje v místním čase, takže se přes změnu letního času drží stejná hodina. Zakázka je měkký odkaz bez cizího klíče. |  |
| [`eventAttendee`](#eventattendee) | const | Další účastníci události (vlastník je v `event.ownerId`). |  |
| [`externalEvent`](#externalevent) | const |  |  |

### calendarFeed

const · `packages/modules/kalendar/src/schema.ts`

Osobní tajný odkaz na odběr kalendáře (iCalendar) pro Google, Apple, Outlook. V databázi je jen otisk (SHA-256)
tokenu, takže únik databáze odkazy neprozradí; token se uživateli ukáže jen při vytvoření.

```ts
const calendarFeed: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "calendar_feed"; schema: undefined; columns: { userId: import("drizzle-orm/pg-core").PgColumn<{ name: "user_id"; tableName: "calendar_feed"; dataType: "string"; columnType: "PgUUID";…
```

### calendarImport

const · `packages/modules/kalendar/src/schema.ts`

Import cizího kalendáře (tajná adresa iCal z Googlu nebo iCloudu): v systému se ukáže jako „obsazeno“.

```ts
const calendarImport: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "calendar_import"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "calendar_import"; dataType: "string"; columnType: "PgUUID"; da…
```

### calendarResource

const · `packages/modules/kalendar/src/schema.ts`

Zdroj, který lze v kalendáři obsadit: zasedačka, projektor, školicí místnost… (stroje mají vlastní rezervace).

```ts
const calendarResource: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "calendar_resource"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "calendar_resource"; dataType: "date"; columnType: "Pg…
```

### event

const · `packages/modules/kalendar/src/schema.ts`

Událost. Časy jsou okamžiky (UTC). U celodenní události je `startsAt` místní půlnoc prvního dne a `endsAt` místní půlnoc
dne po posledním (jako v iCalendar). Opakování (`recurrence`) se rozbaluje v místním čase, takže se přes změnu letního času
drží stejná hodina. Zakázka je měkký odkaz bez cizího klíče.

```ts
const event: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "event"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "event"; dataType: "date"; columnType: "PgTimestamp"; data: Date; …
```

### eventAttendee

const · `packages/modules/kalendar/src/schema.ts`

Další účastníci události (vlastník je v `event.ownerId`).

```ts
const eventAttendee: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "event_attendee"; schema: undefined; columns: { eventId: import("drizzle-orm/pg-core").PgColumn<{ name: "event_id"; tableName: "event_attendee"; dataType: "string"; columnType: "PgUU…
```

### externalEvent

const · `packages/modules/kalendar/src/schema.ts`

_Bez popisu._

```ts
const externalEvent: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "external_event"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "external_event"; dataType: "string"; columnType: "PgUUID"; data…
```
