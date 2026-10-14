# @rebar/kalendar/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kalendar/server` (soubor `packages/modules/kalendar/src/server.ts`). Exportů: 33, z toho s popisem 22.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`buildIcs`](#buildics) | function | Sestaví kalendář (VCALENDAR) z událostí. Řádky končí CRLF. |  |
| [`expandEvent`](#expandevent) | function | Výskyty události, které zasahují do okna `[from, to]` (místní data včetně). Neopakovaná událost má nejvýš jeden výskyt. Celodenní událost trvá od místní půlnoci po místní půlnoc dne po posledním dni. |  |
| [`expandIcs`](#expandics) | function | Rozbalí jednoduchá pravidla opakování (DAILY, WEEKLY s BYDAY, MONTHLY, YEARLY; INTERVAL, COUNT, UNTIL, EXDATE) do výskytů, které zasahují do okna `[from, to]` (místní data). Složitější pravidla (např. „druhé úterý v měsíci“) se zjednoduší na opakování ve stejný den. |  |
| [`feedForToken`](#feedfortoken) | function | Kalendář uživatele ve formátu iCalendar podle tajného tokenu (bez přihlášení). Vrací `null`, když token neexistuje. Obsahuje události, které uživatel vlastní nebo na které je pozvaný; opakování jde jako pravidlo, ne jako výskyty. `extraEvents` doplní události jiných modulů (aktivity CRM) pro vlastníka odběru. |  |
| [`fetchCalendarText`](#fetchcalendartext) | function | Stáhne iCalendar z veřejné adresy: nejvýš tři přesměrování (každé znovu ověřené), 10 s, 5 MB. Chyby, které smí vidět uživatel, jsou `FetchBlockedError`; ostatní se mu ukážou jako obecné selhání. |  |
| [`hashToken`](#hashtoken) | function | Otisk tokenu odběru; v databázi je jen on, token zná jen uživatel. |  |
| [`isPrivateIp`](#isprivateip) | function | Zda je adresa interní, rezervovaná nebo jinak nesmí být cílem stahování. Neplatný zápis se bere jako zakázaný. |  |
| [`overlap`](#overlap) | function | Zda se dvě časová období (polootevřená) překrývají. |  |
| [`parseIcs`](#parseics) | function | Minimalistický parser VEVENT: stačí na „obsazeno“ z Google, iCloudu a Outlooku. |  |
| [`parsePublicUrl`](#parsepublicurl) | function | Ověří adresu kalendáře a vrátí ji jako `URL`. `webcal://` se bere jako `https://`. |  |
| [`regenerateFeedToken`](#regeneratefeedtoken) | function | Vytvoří (nebo nahradí) odkaz na odběr kalendáře uživatele a vrátí token, který se ukáže jen jednou. |  |
| [`safeLookup`](#safelookup) | function | `lookup` pro připojení: přeloží jméno a odmítne, pokud vede kamkoli do interní sítě. |  |
| [`sendEventReminders`](#sendeventreminders) | function | Připomene události, jejichž připomenutí už nastalo a začátek ještě ne. Každý výskyt (i opakované události) se ohlásí právě jednou: klíč připomenutí se zabere ve stejné transakci jako upozornění, takže při chybě se pokus bez ztráty zopakuje při dalším průchodu. Čas je parametr, aby šla testovat hranice dne a přechod letního času. |  |
| [`syncImport`](#syncimport) | function | Synchronizace jednoho importu: okno −30 až +180 dní, výskyty se uloží jako „obsazeno“. |  |
| [`FetchBlockedError`](#fetchblockederror) | class |  |  |
| [`MAX_OCCURRENCES`](#max_occurrences) | const | Nejvyšší počet výskytů, který se rozbalí najednou (ochrana před nekonečnou smyčkou). |  |
| [`RECURRENCES`](#recurrences) | const | Opakování událostí. Rozbaluje se v místním čase (Europe/Prague) po dnech, takže událost v 8:00 zůstane v 8:00 i po přechodu na letní čas. Bez databáze, aby šla ověřit testy. |  |
| [`RECURRENCE_VALUES`](#recurrence_values) | const |  |  |
| [`REMINDER_MINUTES`](#reminder_minutes) | const |  |  |
| [`calendarFeed`](schema.md#calendarfeed) | const | Osobní tajný odkaz na odběr kalendáře (iCalendar) pro Google, Apple, Outlook. V databázi je jen otisk (SHA-256) tokenu, takže únik databáze odkazy neprozradí; token se uživateli ukáže jen při vytvoření. | v `@rebar/kalendar/schema` |
| [`calendarImport`](schema.md#calendarimport) | const | Import cizího kalendáře (tajná adresa iCal z Googlu nebo iCloudu): v systému se ukáže jako „obsazeno“. | v `@rebar/kalendar/schema` |
| [`calendarResource`](schema.md#calendarresource) | const | Zdroj, který lze v kalendáři obsadit: zasedačka, projektor, školicí místnost… (stroje mají vlastní rezervace). | v `@rebar/kalendar/schema` |
| [`commands`](#commands) | const |  |  |
| [`entities`](#entities) | const |  |  |
| [`event`](schema.md#event) | const | Událost. Časy jsou okamžiky (UTC). U celodenní události je `startsAt` místní půlnoc prvního dne a `endsAt` místní půlnoc dne po posledním (jako v iCalendar). Opakování (`recurrence`) se rozbaluje v místním čase, takže se přes změnu letního času drží stejná hodina. Zakázka je měkký odkaz bez cizího klíče. | v `@rebar/kalendar/schema` |
| [`eventAttendee`](schema.md#eventattendee) | const | Další účastníci události (vlastník je v `event.ownerId`). | v `@rebar/kalendar/schema` |
| [`eventEntity`](#evententity) | const | Událost. Čas, opakování a účastníky mění jen kalendář (hlídá kolize zdrojů a posílá pozvánky), v seznamu jde upravit název, typ, místo a poznámku. Rozsah „jen moje“ = vlastník nebo účastník. |  |
| [`externalEvent`](schema.md#externalevent) | const |  | v `@rebar/kalendar/schema` |
| [`resourceEntity`](#resourceentity) | const |  |  |
| [`server`](#server) | const |  |  |
| [`EventTimes`](#eventtimes) | type |  |  |
| [`Occurrence`](#occurrence) | type |  |  |
| [`Recurrence`](#recurrence) | type |  |  |

### buildIcs

function · `packages/modules/kalendar/src/ics.ts`

Sestaví kalendář (VCALENDAR) z událostí. Řádky končí CRLF.

```ts
function buildIcs(events: readonly IcsExportEvent[], name: string): string
```

### expandEvent

function · `packages/modules/kalendar/src/recurrence.ts`

Výskyty události, které zasahují do okna `[from, to]` (místní data včetně). Neopakovaná událost má nejvýš jeden výskyt.
Celodenní událost trvá od místní půlnoci po místní půlnoc dne po posledním dni.

```ts
function expandEvent(ev: EventTimes, from: string, to: string): Occurrence[]
```

### expandIcs

function · `packages/modules/kalendar/src/ics.ts`

Rozbalí jednoduchá pravidla opakování (DAILY, WEEKLY s BYDAY, MONTHLY, YEARLY; INTERVAL, COUNT, UNTIL, EXDATE)
do výskytů, které zasahují do okna `[from, to]` (místní data). Složitější pravidla (např. „druhé úterý v měsíci“)
se zjednoduší na opakování ve stejný den.

```ts
function expandIcs(ev: IcsEvent, from: string, to: string): { start: Date; end: Date; uid: string }[]
```

### feedForToken

function · `packages/modules/kalendar/src/sync.ts`

Kalendář uživatele ve formátu iCalendar podle tajného tokenu (bez přihlášení). Vrací `null`, když token neexistuje.
Obsahuje události, které uživatel vlastní nebo na které je pozvaný; opakování jde jako pravidlo, ne jako výskyty.
`extraEvents` doplní události jiných modulů (aktivity CRM) pro vlastníka odběru.

```ts
async function feedForToken(db: Executor, token: string, host: string, calendarName = "Kalendář", extraEvents?: (userId: string) => Promise<IcsExportEvent[]>): Promise<string | null>
```

### fetchCalendarText

function · `packages/modules/kalendar/src/safe-fetch.ts`

Stáhne iCalendar z veřejné adresy: nejvýš tři přesměrování (každé znovu ověřené), 10 s, 5 MB.
Chyby, které smí vidět uživatel, jsou `FetchBlockedError`; ostatní se mu ukážou jako obecné selhání.

```ts
async function fetchCalendarText(raw: string, opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; transport?: Transport; } = {}): Promise<string>
```

### hashToken

function · `packages/modules/kalendar/src/sync.ts`

Otisk tokenu odběru; v databázi je jen on, token zná jen uživatel.

```ts
function hashToken(token: string): string
```

### isPrivateIp

function · `packages/modules/kalendar/src/safe-fetch.ts`

Zda je adresa interní, rezervovaná nebo jinak nesmí být cílem stahování. Neplatný zápis se bere jako zakázaný.

```ts
function isPrivateIp(ip: string): boolean
```

### overlap

function · `packages/modules/kalendar/src/recurrence.ts`

Zda se dvě časová období (polootevřená) překrývají.

```ts
function overlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean
```

### parseIcs

function · `packages/modules/kalendar/src/ics.ts`

Minimalistický parser VEVENT: stačí na „obsazeno“ z Google, iCloudu a Outlooku.

```ts
function parseIcs(text: string): IcsEvent[]
```

### parsePublicUrl

function · `packages/modules/kalendar/src/safe-fetch.ts`

Ověří adresu kalendáře a vrátí ji jako `URL`. `webcal://` se bere jako `https://`.

```ts
function parsePublicUrl(raw: string): URL
```

### regenerateFeedToken

function · `packages/modules/kalendar/src/sync.ts`

Vytvoří (nebo nahradí) odkaz na odběr kalendáře uživatele a vrátí token, který se ukáže jen jednou.

```ts
async function regenerateFeedToken(db: Executor, userId: string): Promise<string>
```

### safeLookup

function · `packages/modules/kalendar/src/safe-fetch.ts`

`lookup` pro připojení: přeloží jméno a odmítne, pokud vede kamkoli do interní sítě.

```ts
function safeLookup(hostname: string, options: { all?: boolean; family?: number } | number | undefined, cb: (err: Error | null, address?: string | LookupAddress[], family?: number) => void): void
```

### sendEventReminders

function · `packages/modules/kalendar/src/reminders.ts`

Připomene události, jejichž připomenutí už nastalo a začátek ještě ne. Každý výskyt (i opakované události) se
ohlásí právě jednou: klíč připomenutí se zabere ve stejné transakci jako upozornění, takže při chybě se pokus
bez ztráty zopakuje při dalším průchodu. Čas je parametr, aby šla testovat hranice dne a přechod letního času.

```ts
async function sendEventReminders(db: Db, now = new Date()): Promise<number>
```

### syncImport

function · `packages/modules/kalendar/src/sync.ts`

Synchronizace jednoho importu: okno −30 až +180 dní, výskyty se uloží jako „obsazeno“.

```ts
async function syncImport(db: Executor, cipher: Cipher, importId: string, transport?: Transport): Promise<{ ok: true; count: number } | { ok: false; error: string }>
```

### FetchBlockedError

class · `packages/modules/kalendar/src/safe-fetch.ts`

_Bez popisu._

```ts
class FetchBlockedError extends Error {

}
```

### MAX_OCCURRENCES

const · `packages/modules/kalendar/src/recurrence.ts`

Nejvyšší počet výskytů, který se rozbalí najednou (ochrana před nekonečnou smyčkou).

```ts
const MAX_OCCURRENCES: 1000
```

### RECURRENCES

const · `packages/modules/kalendar/src/recurrence.ts`

Opakování událostí. Rozbaluje se v místním čase (Europe/Prague) po dnech, takže událost v 8:00 zůstane v 8:00
i po přechodu na letní čas. Bez databáze, aby šla ověřit testy.

```ts
const RECURRENCES: readonly [{ readonly value: "daily"; readonly label: "Každý den"; }, { readonly value: "weekdays"; readonly label: "Každý pracovní den"; }, { readonly value: "weekly"; readonly label: "Každý týden"; }, { readonly value: "monthly"; readonly…
```

### RECURRENCE_VALUES

const · `packages/modules/kalendar/src/recurrence.ts`

_Bez popisu._

```ts
const RECURRENCE_VALUES: ["daily" | "weekly" | "monthly" | "weekdays", ...("daily" | "weekly" | "monthly" | "weekdays")[]]
```

### REMINDER_MINUTES

const · `packages/modules/kalendar/src/recurrence.ts`

_Bez popisu._

```ts
const REMINDER_MINUTES: readonly [15, 60, 1440]
```

### commands

const · `packages/modules/kalendar/src/commands.ts`

_Bez popisu._

```ts
const commands: (import("@rebar/core/module-server").CommandDef<z.ZodObject<{ from: z.ZodISODate; to: z.ZodISODate; who: z.ZodDefault<z.ZodEnum<{ all: "all"; me: "me"; }>>; layers: z.ZodOptional<z.ZodArray<z.ZodString>>; }, z.core.$strip>, { items: Calend…
```

### entities

const · `packages/modules/kalendar/src/entities.ts`

_Bez popisu._

```ts
const entities: import("@rebar/core/entities").EntityDef[]
```

### eventEntity

const · `packages/modules/kalendar/src/entities.ts`

Událost. Čas, opakování a účastníky mění jen kalendář (hlídá kolize zdrojů a posílá pozvánky),
v seznamu jde upravit název, typ, místo a poznámku. Rozsah „jen moje“ = vlastník nebo účastník.

```ts
const eventEntity: import("@rebar/core/entities").EntityDef
```

### resourceEntity

const · `packages/modules/kalendar/src/entities.ts`

_Bez popisu._

```ts
const resourceEntity: import("@rebar/core/entities").EntityDef
```

### server

const · `packages/modules/kalendar/src/server.ts`

_Bez popisu._

```ts
const server: { readonly entities: import("@rebar/core/entities").EntityDef[]; readonly commands: (import("@rebar/core/module-server").CommandDef<z.ZodObject<{ from: z.ZodISODate; to: z.ZodISODate; who: z.ZodDefault<z.ZodEnum<{ all: "all"; me: "me"; }>>…
```

### EventTimes

type · `packages/modules/kalendar/src/recurrence.ts`

_Bez popisu._

```ts
type EventTimes = {
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  recurrence: string | null;
  recurrenceUntil: string | null;
};
```

### Occurrence

type · `packages/modules/kalendar/src/recurrence.ts`

_Bez popisu._

```ts
type Occurrence = {
  start: Date;
  end: Date;
  /** Místní datum začátku a (u celodenní) posledního dne včetně. */
  date: string;
  endDate: string;
};
```

### Recurrence

type · `packages/modules/kalendar/src/recurrence.ts`

_Bez popisu._

```ts
type Recurrence = (typeof RECURRENCES)[number]["value"];
```
