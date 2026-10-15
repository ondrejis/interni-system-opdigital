# @rebar/kalendar/testing

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kalendar/testing` (soubor `packages/modules/kalendar/src/google/testing.ts`). Exportů: 5, z toho s popisem 5.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createFakeGoogle`](#createfakegoogle) | function | Založí prázdný fake Google. `now` lze nahradit řízenými hodinami. |  |
| [`setGoogleClientOverride`](server.md#setgoogleclientoverride) | function | Podstrčí klienta (fake Google v testech); `null` se vrátí ke skutečnému. Globálně: Next bundluje trasy zvlášť. | v `@rebar/kalendar/server` |
| [`FakeCall`](#fakecall) | type | Zaznamenané volání zápisu. |  |
| [`FakeGoogle`](#fakegoogle) | type | Fake Google: klient a ovládání (účty, kalendáře, události „zvenku“, push, vypršení tokenů). |  |
| [`FakePing`](#fakeping) | type | Hlavičky, které by Google poslal na webhook (`X-Goog-*`). |  |

### createFakeGoogle

function · `packages/modules/kalendar/src/google/fake-google.ts`

Založí prázdný fake Google. `now` lze nahradit řízenými hodinami.

```ts
function createFakeGoogle(opts: { now?: () => number } = {}): { client: GoogleCalendarClient; calls: FakeCall[]; stoppedChannels: string[]; codeFor: (email: string) => string; addAccount(email: string, calendarName?: string): string; addCalendar(email: string, info: Partial<GoogleCalendarInfo> & { id…
```

### FakeCall

type · `packages/modules/kalendar/src/google/fake-google.ts`

Zaznamenané volání zápisu.

```ts
type FakeCall = {
  op: "insert" | "patch" | "delete" | "watch" | "stop" | "list";
  calendarId: string;
  eventId?: string;
  sendUpdates?: "all" | "none";
  conference?: boolean;
  syncToken?: string | undefined;
};
```

### FakeGoogle

type · `packages/modules/kalendar/src/google/fake-google.ts`

Fake Google: klient a ovládání (účty, kalendáře, události „zvenku“, push, vypršení tokenů).

```ts
type FakeGoogle = ReturnType<typeof createFakeGoogle>;
```

### FakePing

type · `packages/modules/kalendar/src/google/fake-google.ts`

Hlavičky, které by Google poslal na webhook (`X-Goog-*`).

```ts
type FakePing = Record<string, string>;
```
