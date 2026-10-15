# @rebar/kalendar/contract

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kalendar/contract` (soubor `packages/modules/kalendar/src/contract.ts`). Exportů: 50, z toho s popisem 50.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`ACCESS_ROLES`](#access_roles) | const | Oprávnění ke kalendáři v Googlu. |  |
| [`ACCOUNT_STATUSES`](#account_statuses) | const | Stav propojení účtu: `ok`, `reauth` (je třeba souhlas obnovit), `error` (poslední volání selhalo). |  |
| [`BUSY_TITLE`](api.md#busy_title) | const | Název, pod kterým se druhému uživateli ukáže soukromá událost (bez místa, účastníků a vazeb). | v `@rebar/kalendar/api` |
| [`CALENDAR_TIME_ZONE`](api.md#calendar_time_zone) | const | Časová zóna, ve které kalendář pracuje. | v `@rebar/kalendar/api` |
| [`ITEM_KINDS`](#item_kinds) | const | Druh položky v kalendáři (stejné druhy jako dřívější kalendář, řadí je `day-order`). |  |
| [`ITEM_SOURCES`](#item_sources) | const | Odkud událost pochází: z Googlu, nebo z úkolu v OPSYS (schůzka, hovor). |  |
| [`MAX_RANGE_DAYS`](#max_range_days) | const | Nejdelší okno, které `kalendar.range` vrátí najednou (dny). |  |
| [`WORK_HOURS`](api.md#work_hours) | const | Pracovní doba zvýrazněná v kalendáři (KAL-03). | v `@rebar/kalendar/api` |
| [`accountInput`](#accountinput) | const | `kalendar.account`: stav mého propojení a zdroje ostatních (bez vstupu). |  |
| [`connectStartInput`](#connectstartinput) | const | `kalendar.connect.start`: adresa, na kterou se přesměruje souhlas Googlu. |  |
| [`createMeetingInput`](#createmeetinginput) | const | `kalendar.createMeeting`: schůzka z kalendáře (tažením). S modulem `ukoly` vznikne úkol typu Schůzka, jinak jen událost v Googlu. |  |
| [`deleteEventInput`](#deleteeventinput) | const | `kalendar.delete`: smaže událost v Googlu (u události navázané na úkol i úkol, do koše). |  |
| [`disconnectInput`](#disconnectinput) | const | `kalendar.disconnect`: odpojí můj Google účet (zastaví push, smaže zrcadlo událostí a tokeny). |  |
| [`forRecordInput`](#forrecordinput) | const | `kalendar.forRecord`: události navázané na obchod, organizaci nebo kontakt (záložky, historie). |  |
| [`linkInput`](#linkinput) | const | `kalendar.link`: vazba události na obchod, organizaci, kontakt (`null` vazbu odebere, nezadáno ji ponechá). |  |
| [`moveInput`](#moveinput) | const | `kalendar.move`: přesun nebo změna délky události tažením (propíše se do Googlu; u úkolu i do úkolu). |  |
| [`rangeInput`](#rangeinput) | const | `kalendar.range`: položky kalendáře v okně (události, obsazeno, vrstvy ostatních modulů, svátky). |  |
| [`refreshCalendarsInput`](#refreshcalendarsinput) | const | `kalendar.calendars.refresh`: znovu načte seznam kalendářů z Googlu. |  |
| [`setWriteTargetInput`](#setwritetargetinput) | const | `kalendar.setWriteTarget`: kalendář, do kterého se zapisují nové schůzky a hovory z OPSYS. |  |
| [`settingsGetInput`](#settingsgetinput) | const | `kalendar.settings.get`: nastavení Google OAuth klienta a pravidel zápisu (jen správce). |  |
| [`settingsSaveInput`](#settingssaveinput) | const | `kalendar.settings.save`: uloží nastavení; prázdné tajemství znamená „ponechat uložené“. |  |
| [`suggestLinksInput`](#suggestlinksinput) | const | `kalendar.suggestLinks`: návrh vazeb podle shody e-mailu účastníka s kontaktem. |  |
| [`syncInput`](#syncinput) | const | `kalendar.sync`: ruční synchronizace („Synchronizovat teď“). |  |
| [`testInput`](#testinput) | const | `kalendar.test`: ověří, že uložený přístup k Googlu funguje (NFR-13). |  |
| [`toggleCalendarInput`](#togglecalendarinput) | const | `kalendar.toggleCalendar`: zobrazit/skrýt kalendář (skrytý se nesynchronizuje). |  |
| [`AccessRole`](#accessrole) | type | Oprávnění ke kalendáři v Googlu. |  |
| [`AccountDto`](#accountdto) | type | Propojený Google účet uživatele. |  |
| [`AccountState`](#accountstate) | type | Odpověď `kalendar.account`. |  |
| [`AccountStatus`](#accountstatus) | type | Stav propojení účtu s Googlem. |  |
| [`CalendarDto`](#calendardto) | type | Kalendář z Google účtu pro UI (výběr zobrazovaných a cíl zápisu). |  |
| [`CalendarItemDto`](api.md#calendaritemdto) | type | Položka kalendáře. Tvar odpovídá dřívějšímu kalendáři (`kind`, místní `start`/`end`), takže ho zná `day-order`. Soukromá cizí událost má `kind: "busy"`, `title: "Obsazeno"` a prázdné místo, účastníky, odkazy a vazby. | v `@rebar/kalendar/api` |
| [`CalendarSettingsDto`](#calendarsettingsdto) | type | Odpověď `kalendar.settings.get` (tajemství se nikdy nevrací, jen zda je vyplněné). |  |
| [`ConnectStartResult`](#connectstartresult) | type | Odpověď `kalendar.connect.start`. |  |
| [`CreateMeetingInput`](#createmeetinginput) | type | Vstup `kalendar.createMeeting`. |  |
| [`CreateMeetingResult`](#createmeetingresult) | type | Odpověď `kalendar.createMeeting`. |  |
| [`EventAttendee`](api.md#eventattendee) | type | Účastník události z Googlu (zrcadlo odpovědi API, bez tajemství). | v `@rebar/kalendar/api` |
| [`ItemKind`](#itemkind) | type | Druh položky v kalendáři. |  |
| [`ItemSource`](#itemsource) | type | Odkud událost pochází. |  |
| [`LayerMetaDto`](#layermetadto) | type | Vrstva ostatního modulu (úkoly s termínem, termíny zakázek…). |  |
| [`LinkInput`](#linkinput) | type | Vstup `kalendar.link`. |  |
| [`LinkRef`](api.md#linkref) | type | Odkaz na jiný záznam (obchod, organizace, kontakt) s názvem; soukromý nebo nedostupný záznam se nevrací. | v `@rebar/kalendar/api` |
| [`LinkSuggestion`](#linksuggestion) | type | Návrh vazby: kontakt (a jeho organizace, otevřené obchody) podle e-mailu účastníka. |  |
| [`MoveInput`](#moveinput) | type | Vstup `kalendar.move`. |  |
| [`RangeInput`](#rangeinput) | type | Vstup `kalendar.range`. |  |
| [`RangeResult`](#rangeresult) | type | Odpověď `kalendar.range`. |  |
| [`SettingsSaveInput`](#settingssaveinput) | type | Vstup `kalendar.settings.save`. |  |
| [`SourceDto`](#sourcedto) | type | Kalendáře jiného uživatele, které smím vidět (vrstva „Patrikovy kalendáře“). |  |
| [`SuggestLinksResult`](#suggestlinksresult) | type | Odpověď `kalendar.suggestLinks`. |  |
| [`SyncResult`](#syncresult) | type | Odpověď `kalendar.sync`. |  |
| [`TestResult`](#testresult) | type | Odpověď `kalendar.test`. |  |

### ACCESS_ROLES

const · `packages/modules/kalendar/src/contract.ts`

Oprávnění ke kalendáři v Googlu.

```ts
const ACCESS_ROLES: readonly ["owner", "writer", "reader", "freeBusyReader"]
```

### ACCOUNT_STATUSES

const · `packages/modules/kalendar/src/contract.ts`

Stav propojení účtu: `ok`, `reauth` (je třeba souhlas obnovit), `error` (poslední volání selhalo).

```ts
const ACCOUNT_STATUSES: readonly ["ok", "reauth", "error"]
```

### ITEM_KINDS

const · `packages/modules/kalendar/src/contract.ts`

Druh položky v kalendáři (stejné druhy jako dřívější kalendář, řadí je `day-order`).

```ts
const ITEM_KINDS: readonly ["event", "busy", "layer", "holiday"]
```

### ITEM_SOURCES

const · `packages/modules/kalendar/src/contract.ts`

Odkud událost pochází: z Googlu, nebo z úkolu v OPSYS (schůzka, hovor).

```ts
const ITEM_SOURCES: readonly ["google", "opsys"]
```

### MAX_RANGE_DAYS

const · `packages/modules/kalendar/src/contract.ts`

Nejdelší okno, které `kalendar.range` vrátí najednou (dny).

```ts
const MAX_RANGE_DAYS: 400
```

### accountInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.account`: stav mého propojení a zdroje ostatních (bez vstupu).

```ts
const accountInput: z.ZodObject<{}, z.core.$strip>
```

### connectStartInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.connect.start`: adresa, na kterou se přesměruje souhlas Googlu.

```ts
const connectStartInput: z.ZodObject<{ returnTo: z.ZodOptional<z.ZodString>; }, z.core.$strip>
```

### createMeetingInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.createMeeting`: schůzka z kalendáře (tažením). S modulem `ukoly` vznikne úkol typu Schůzka, jinak jen událost v Googlu.

```ts
const createMeetingInput: z.ZodObject<{ title: z.ZodString; startsAt: z.ZodISODateTime; endsAt: z.ZodISODateTime; allDay: z.ZodOptional<z.ZodBoolean>; place: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | null | undefined, string | nul…
```

### deleteEventInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.delete`: smaže událost v Googlu (u události navázané na úkol i úkol, do koše).

```ts
const deleteEventInput: z.ZodObject<{ eventId: z.ZodUUID; }, z.core.$strip>
```

### disconnectInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.disconnect`: odpojí můj Google účet (zastaví push, smaže zrcadlo událostí a tokeny).

```ts
const disconnectInput: z.ZodObject<{}, z.core.$strip>
```

### forRecordInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.forRecord`: události navázané na obchod, organizaci nebo kontakt (záložky, historie).

```ts
const forRecordInput: z.ZodObject<{ dealId: z.ZodOptional<z.ZodUUID>; companyId: z.ZodOptional<z.ZodUUID>; personId: z.ZodOptional<z.ZodUUID>; limit: z.ZodOptional<z.ZodNumber>; }, z.core.$strip>
```

### linkInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.link`: vazba události na obchod, organizaci, kontakt (`null` vazbu odebere, nezadáno ji ponechá).

```ts
const linkInput: z.ZodObject<{ eventId: z.ZodUUID; dealId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; companyId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; personId: z.ZodOptional<z.ZodNullable<z.ZodUUID>>; }, z.core.$strip>
```

### moveInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.move`: přesun nebo změna délky události tažením (propíše se do Googlu; u úkolu i do úkolu).

```ts
const moveInput: z.ZodObject<{ eventId: z.ZodUUID; startsAt: z.ZodISODateTime; endsAt: z.ZodISODateTime; allDay: z.ZodOptional<z.ZodBoolean>; }, z.core.$strip>
```

### rangeInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.range`: položky kalendáře v okně (události, obsazeno, vrstvy ostatních modulů, svátky).

```ts
const rangeInput: z.ZodObject<{ from: z.ZodISODate; to: z.ZodISODate; who: z.ZodDefault<z.ZodEnum<{ all: "all"; me: "me"; }>>; layers: z.ZodOptional<z.ZodArray<z.ZodString>>; }, z.core.$strip>
```

### refreshCalendarsInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.calendars.refresh`: znovu načte seznam kalendářů z Googlu.

```ts
const refreshCalendarsInput: z.ZodObject<{}, z.core.$strip>
```

### setWriteTargetInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.setWriteTarget`: kalendář, do kterého se zapisují nové schůzky a hovory z OPSYS.

```ts
const setWriteTargetInput: z.ZodObject<{ calendarId: z.ZodUUID; }, z.core.$strip>
```

### settingsGetInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.settings.get`: nastavení Google OAuth klienta a pravidel zápisu (jen správce).

```ts
const settingsGetInput: z.ZodObject<{}, z.core.$strip>
```

### settingsSaveInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.settings.save`: uloží nastavení; prázdné tajemství znamená „ponechat uložené“.

```ts
const settingsSaveInput: z.ZodObject<{ clientId: z.ZodOptional<z.ZodString>; clientSecret: z.ZodOptional<z.ZodString>; privateMeetingsToGoogle: z.ZodOptional<z.ZodBoolean>; }, z.core.$strip>
```

### suggestLinksInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.suggestLinks`: návrh vazeb podle shody e-mailu účastníka s kontaktem.

```ts
const suggestLinksInput: z.ZodObject<{ eventId: z.ZodUUID; }, z.core.$strip>
```

### syncInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.sync`: ruční synchronizace („Synchronizovat teď“).

```ts
const syncInput: z.ZodObject<{}, z.core.$strip>
```

### testInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.test`: ověří, že uložený přístup k Googlu funguje (NFR-13).

```ts
const testInput: z.ZodObject<{}, z.core.$strip>
```

### toggleCalendarInput

const · `packages/modules/kalendar/src/contract.ts`

`kalendar.toggleCalendar`: zobrazit/skrýt kalendář (skrytý se nesynchronizuje).

```ts
const toggleCalendarInput: z.ZodObject<{ calendarId: z.ZodUUID; visible: z.ZodBoolean; }, z.core.$strip>
```

### AccessRole

type · `packages/modules/kalendar/src/contract.ts`

Oprávnění ke kalendáři v Googlu.

```ts
type AccessRole = (typeof ACCESS_ROLES)[number];
```

### AccountDto

type · `packages/modules/kalendar/src/contract.ts`

Propojený Google účet uživatele.

```ts
type AccountDto = {
  id: string;
  userId: string;
  googleEmail: string;
  status: AccountStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  calendars: CalendarDto[];
};
```

### AccountState

type · `packages/modules/kalendar/src/contract.ts`

Odpověď `kalendar.account`.

```ts
type AccountState = {
  /** Google OAuth klient je v nastavení vyplněný (jinak se nedá připojit). */
  configured: boolean;
  /** Můj účet, nebo `null` (bez Googlu kalendář ukazuje jen úkoly a schůzky z OPSYS, KAL-09). */
  mine: AccountDto | null;
  /** Kalendáře ostatních uživatelů (jen s rozsahem „vše“). */
  others: SourceDto[];
  canWrite: boolean;
  canSeeAll: boolean;
};
```

### AccountStatus

type · `packages/modules/kalendar/src/contract.ts`

Stav propojení účtu s Googlem.

```ts
type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
```

### CalendarDto

type · `packages/modules/kalendar/src/contract.ts`

Kalendář z Google účtu pro UI (výběr zobrazovaných a cíl zápisu).

```ts
type CalendarDto = {
  id: string;
  googleId: string;
  name: string;
  color: string | null;
  visible: boolean;
  isWriteTarget: boolean;
  isPrimary: boolean;
  accessRole: AccessRole;
  /** Do kalendáře jde zapisovat (`owner`/`writer`). */
  canWrite: boolean;
  /** Push kanál běží (změny z Googlu dorazí hned); jinak jen pravidelná synchronizace. */
  push: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
};
```

### CalendarSettingsDto

type · `packages/modules/kalendar/src/contract.ts`

Odpověď `kalendar.settings.get` (tajemství se nikdy nevrací, jen zda je vyplněné).

```ts
type CalendarSettingsDto = {
  clientId: string;
  clientSecretSet: boolean;
  privateMeetingsToGoogle: boolean;
  /** Adresa, kterou je třeba zadat v Google Cloud Console jako „Authorized redirect URI“. */
  redirectUri: string;
  /** Adresa push kanálů; jen `https` (jinak se používá jen pravidelná synchronizace). */
  webhookUrl: string;
  /** Adresa aplikace je `https`, takže Google může volat webhook. */
  pushAvailable: boolean;
};
```

### ConnectStartResult

type · `packages/modules/kalendar/src/contract.ts`

Odpověď `kalendar.connect.start`.

```ts
type ConnectStartResult = { url: string };
```

### CreateMeetingInput

type · `packages/modules/kalendar/src/contract.ts`

Vstup `kalendar.createMeeting`.

```ts
type CreateMeetingInput = z.input<typeof createMeetingInput>;
```

### CreateMeetingResult

type · `packages/modules/kalendar/src/contract.ts`

Odpověď `kalendar.createMeeting`.

```ts
type CreateMeetingResult = {
  taskId: string | null;
  eventId: string | null;
  /** Schůzka je zatím jen v OPSYS (Google není připojený nebo zápis čeká na zpracování). */
  pending: boolean;
};
```

### ItemKind

type · `packages/modules/kalendar/src/contract.ts`

Druh položky v kalendáři.

```ts
type ItemKind = (typeof ITEM_KINDS)[number];
```

### ItemSource

type · `packages/modules/kalendar/src/contract.ts`

Odkud událost pochází.

```ts
type ItemSource = (typeof ITEM_SOURCES)[number];
```

### LayerMetaDto

type · `packages/modules/kalendar/src/contract.ts`

Vrstva ostatního modulu (úkoly s termínem, termíny zakázek…).

```ts
type LayerMetaDto = { key: string; label: string; color: string };
```

### LinkInput

type · `packages/modules/kalendar/src/contract.ts`

Vstup `kalendar.link`.

```ts
type LinkInput = z.input<typeof linkInput>;
```

### LinkSuggestion

type · `packages/modules/kalendar/src/contract.ts`

Návrh vazby: kontakt (a jeho organizace, otevřené obchody) podle e-mailu účastníka.

```ts
type LinkSuggestion = {
  email: string;
  personId: string;
  personName: string;
  companyId: string | null;
  companyName: string | null;
  deals: { id: string; title: string }[];
};
```

### MoveInput

type · `packages/modules/kalendar/src/contract.ts`

Vstup `kalendar.move`.

```ts
type MoveInput = z.input<typeof moveInput>;
```

### RangeInput

type · `packages/modules/kalendar/src/contract.ts`

Vstup `kalendar.range`.

```ts
type RangeInput = z.input<typeof rangeInput>;
```

### RangeResult

type · `packages/modules/kalendar/src/contract.ts`

Odpověď `kalendar.range`.

```ts
type RangeResult = {
  items: CalendarItemDto[];
  layers: LayerMetaDto[];
  canWrite: boolean;
  canSeeAll: boolean;
  /** Mám připojený Google účet (jinak jsou vidět jen úkoly a schůzky z OPSYS). */
  connected: boolean;
};
```

### SettingsSaveInput

type · `packages/modules/kalendar/src/contract.ts`

Vstup `kalendar.settings.save`.

```ts
type SettingsSaveInput = z.input<typeof settingsSaveInput>;
```

### SourceDto

type · `packages/modules/kalendar/src/contract.ts`

Kalendáře jiného uživatele, které smím vidět (vrstva „Patrikovy kalendáře“).

```ts
type SourceDto = {
  userId: string;
  userName: string;
  calendars: { id: string; name: string; color: string | null }[];
};
```

### SuggestLinksResult

type · `packages/modules/kalendar/src/contract.ts`

Odpověď `kalendar.suggestLinks`.

```ts
type SuggestLinksResult = { suggestions: LinkSuggestion[] };
```

### SyncResult

type · `packages/modules/kalendar/src/contract.ts`

Odpověď `kalendar.sync`.

```ts
type SyncResult = { calendars: number; changed: number; errors: string[] };
```

### TestResult

type · `packages/modules/kalendar/src/contract.ts`

Odpověď `kalendar.test`.

```ts
type TestResult = { ok: boolean; message: string; status: AccountStatus | null };
```
