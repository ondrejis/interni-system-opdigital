# @rebar/kalendar/api

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kalendar/api` (soubor `packages/modules/kalendar/src/api.ts`). Exportů: 6, z toho s popisem 6.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`BUSY_TITLE`](#busy_title) | const | Název, pod kterým se druhému uživateli ukáže soukromá událost (bez místa, účastníků a vazeb). |  |
| [`CALENDAR_TIME_ZONE`](#calendar_time_zone) | const | Časová zóna, ve které kalendář pracuje. |  |
| [`WORK_HOURS`](#work_hours) | const | Pracovní doba zvýrazněná v kalendáři (KAL-03). |  |
| [`CalendarItemDto`](#calendaritemdto) | type | Položka kalendáře. Tvar odpovídá dřívějšímu kalendáři (`kind`, místní `start`/`end`), takže ho zná `day-order`. Soukromá cizí událost má `kind: "busy"`, `title: "Obsazeno"` a prázdné místo, účastníky, odkazy a vazby. |  |
| [`EventAttendee`](#eventattendee) | type | Účastník události z Googlu (zrcadlo odpovědi API, bez tajemství). |  |
| [`LinkRef`](#linkref) | type | Odkaz na jiný záznam (obchod, organizace, kontakt) s názvem; soukromý nebo nedostupný záznam se nevrací. |  |

### BUSY_TITLE

const · `packages/modules/kalendar/src/contract.ts`

Název, pod kterým se druhému uživateli ukáže soukromá událost (bez místa, účastníků a vazeb).

```ts
const BUSY_TITLE: "Obsazeno"
```

### CALENDAR_TIME_ZONE

const · `packages/modules/kalendar/src/contract.ts`

Časová zóna, ve které kalendář pracuje.

```ts
const CALENDAR_TIME_ZONE: "Europe/Prague"
```

### WORK_HOURS

const · `packages/modules/kalendar/src/contract.ts`

Pracovní doba zvýrazněná v kalendáři (KAL-03).

```ts
const WORK_HOURS: { readonly from: "08:00"; readonly to: "18:00"; }
```

### CalendarItemDto

type · `packages/modules/kalendar/src/contract.ts`

Položka kalendáře. Tvar odpovídá dřívějšímu kalendáři (`kind`, místní `start`/`end`), takže ho zná `day-order`.
Soukromá cizí událost má `kind: "busy"`, `title: "Obsazeno"` a prázdné místo, účastníky, odkazy a vazby.

```ts
type CalendarItemDto = {
  /** `calendar_event.id` u událostí, `<vrstva>:<id>` u vrstev, `holiday:<datum>` u svátků. */
  id: string;
  kind: ItemKind;
  layer: string | null;
  title: string;
  /** Celodenní: `YYYY-MM-DD`; jinak místní `YYYY-MM-DDTHH:mm` (Europe/Prague). */
  start: string;
  /** Celodenní: poslední den včetně; jinak místní konec. */
  end: string;
  allDay: boolean;
  /** Přesný začátek a konec jako ISO okamžik (jen události; u vrstev `null`). */
  startsAt: string | null;
  endsAt: string | null;
  color: string;
  href: string | null;
  eventId: string | null;
  /** Úkol (schůzka, hovor) v modulu `ukoly`, ke kterému událost patří. */
  taskId: string | null;
  location: string | null;
  meetUrl: string | null;
  description: string | null;
  calendarId: string | null;
  calendarName: string | null;
  owner: string | null;
  ownerId: string | null;
  /** Událost je z mého kalendáře (v přeplněném dni se řadí přednostně). */
  own: boolean;
  attendees: EventAttendee[];
  recurring: boolean;
  /** Smím událost přesouvat a upravovat (oprávnění, rozsah a role v Googlu). */
  canEdit: boolean;
  source: ItemSource | null;
  deal: LinkRef | null;
  company: LinkRef | null;
  person: LinkRef | null;
  /** Odkaz na událost v Google Kalendáři. */
  htmlLink: string | null;
};
```

### EventAttendee

type · `packages/modules/kalendar/src/contract.ts`

Účastník události z Googlu (zrcadlo odpovědi API, bez tajemství).

```ts
type EventAttendee = {
  email: string;
  name?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  self?: boolean;
  organizer?: boolean;
};
```

### LinkRef

type · `packages/modules/kalendar/src/contract.ts`

Odkaz na jiný záznam (obchod, organizace, kontakt) s názvem; soukromý nebo nedostupný záznam se nevrací.

```ts
type LinkRef = { id: string; title: string | null };
```
