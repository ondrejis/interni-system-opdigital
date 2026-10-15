# @rebar/kalendar/schema

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kalendar/schema` (soubor `packages/modules/kalendar/src/schema.ts`). Exportů: 10, z toho s popisem 10.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`CALENDAR_ACCESS_ROLES`](#calendar_access_roles) | const | Oprávnění uživatele ke kalendáři v Googlu (`accessRole` z `calendarList`). |  |
| [`CALENDAR_ACCOUNT_STATUSES`](#calendar_account_statuses) | const | Stav propojení účtu s Googlem. |  |
| [`CALENDAR_EVENT_SOURCES`](#calendar_event_sources) | const | Kde událost vznikla: v Googlu, nebo v OPSYS (schůzka/hovor z úkolu zapsaný do Googlu). |  |
| [`CALENDAR_EVENT_VISIBILITIES`](#calendar_event_visibilities) | const | Viditelnost události v Googlu (`visibility`). `private` a `confidential` druhému uživateli ukážeme jen jako „Obsazeno“. |  |
| [`CALENDAR_PUSH_OPS`](#calendar_push_ops) | const | Operace fronty zápisu do Googlu. |  |
| [`calendar`](#calendar) | const | Kalendář z Google účtu: zobrazení v OPSYS, cíl zápisu nových schůzek, synchronizační token a kanál pro push. |  |
| [`calendarAccount`](#calendaraccount) | const | Propojený Google účet uživatele (jeden na uživatele). `tokens_enc` jsou přístupové a obnovovací tokeny zašifrované přes `cipher` (nikdy v otevřené podobě); `status = reauth` znamená, že je potřeba souhlas obnovit. |  |
| [`calendarEvent`](#calendarevent) | const | Zrcadlo události z Google Kalendáře (zdroj pravdy je Google; konflikt rozhodne novější změna). Vazby na úkol, obchod, organizaci a kontakt jsou měkké. Soukromou událost cizího uživatele ukazuje systém jen jako „Obsazeno“. |  |
| [`calendarPush`](#calendarpush) | const | Fronta zápisu do Googlu (outbox). Vzniká v transakci změny úkolu (`task.*` → handler) a zpracovává ji úloha `kalendar.push`; díky tomu zápis do Googlu nemůže předběhnout potvrzení změny a výpadek Googlu změnu neztratí. Na jeden úkol je nejvýš jeden nevyřízený řádek (další změny se slučují, `queued_at` se posune). U mazání nese `payload` identifikaci události (úkol už nemusí existovat). |  |
| [`CalendarAttendee`](#calendarattendee) | type | Účastník události z Google Kalendáře (zrcadlo odpovědi API, bez tajemství). |  |

### CALENDAR_ACCESS_ROLES

const · `packages/modules/kalendar/src/schema.ts`

Oprávnění uživatele ke kalendáři v Googlu (`accessRole` z `calendarList`).

```ts
const CALENDAR_ACCESS_ROLES: readonly ["owner", "writer", "reader", "freeBusyReader"]
```

### CALENDAR_ACCOUNT_STATUSES

const · `packages/modules/kalendar/src/schema.ts`

Stav propojení účtu s Googlem.

```ts
const CALENDAR_ACCOUNT_STATUSES: readonly ["ok", "reauth", "error"]
```

### CALENDAR_EVENT_SOURCES

const · `packages/modules/kalendar/src/schema.ts`

Kde událost vznikla: v Googlu, nebo v OPSYS (schůzka/hovor z úkolu zapsaný do Googlu).

```ts
const CALENDAR_EVENT_SOURCES: readonly ["google", "opsys"]
```

### CALENDAR_EVENT_VISIBILITIES

const · `packages/modules/kalendar/src/schema.ts`

Viditelnost události v Googlu (`visibility`). `private` a `confidential` druhému uživateli ukážeme jen jako „Obsazeno“.

```ts
const CALENDAR_EVENT_VISIBILITIES: readonly ["default", "public", "private", "confidential"]
```

### CALENDAR_PUSH_OPS

const · `packages/modules/kalendar/src/schema.ts`

Operace fronty zápisu do Googlu.

```ts
const CALENDAR_PUSH_OPS: readonly ["upsert", "delete"]
```

### calendar

const · `packages/modules/kalendar/src/schema.ts`

Kalendář z Google účtu: zobrazení v OPSYS, cíl zápisu nových schůzek, synchronizační token a kanál pro push.

```ts
const calendar: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "calendar"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "calendar"; dataType: "date"; columnType: "PgTimestamp"; data: …
```

### calendarAccount

const · `packages/modules/kalendar/src/schema.ts`

Propojený Google účet uživatele (jeden na uživatele). `tokens_enc` jsou přístupové a obnovovací tokeny zašifrované
přes `cipher` (nikdy v otevřené podobě); `status = reauth` znamená, že je potřeba souhlas obnovit.

```ts
const calendarAccount: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "calendar_account"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "calendar_account"; dataType: "date"; columnType: "PgTi…
```

### calendarEvent

const · `packages/modules/kalendar/src/schema.ts`

Zrcadlo události z Google Kalendáře (zdroj pravdy je Google; konflikt rozhodne novější změna). Vazby na úkol, obchod,
organizaci a kontakt jsou měkké. Soukromou událost cizího uživatele ukazuje systém jen jako „Obsazeno“.

```ts
const calendarEvent: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "calendar_event"; schema: undefined; columns: { createdAt: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "calendar_event"; dataType: "date"; columnType: "PgTimest…
```

### calendarPush

const · `packages/modules/kalendar/src/schema.ts`

Fronta zápisu do Googlu (outbox). Vzniká v transakci změny úkolu (`task.*` → handler) a zpracovává ji úloha
`kalendar.push`; díky tomu zápis do Googlu nemůže předběhnout potvrzení změny a výpadek Googlu změnu neztratí.
Na jeden úkol je nejvýš jeden nevyřízený řádek (další změny se slučují, `queued_at` se posune). U mazání nese
`payload` identifikaci události (úkol už nemusí existovat).

```ts
const calendarPush: import("drizzle-orm/pg-core").PgTableWithColumns<{ name: "calendar_push"; schema: undefined; columns: { id: import("drizzle-orm/pg-core").PgColumn<{ name: string; tableName: "calendar_push"; dataType: "string"; columnType: "PgUUID"; data: …
```

### CalendarAttendee

type · `packages/modules/kalendar/src/schema.ts`

Účastník události z Google Kalendáře (zrcadlo odpovědi API, bez tajemství).

```ts
type CalendarAttendee = {
  email: string;
  name?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  self?: boolean;
  organizer?: boolean;
};
```
