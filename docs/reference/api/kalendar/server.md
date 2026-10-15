# @rebar/kalendar/server

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/kalendar/server` (soubor `packages/modules/kalendar/src/server.ts`). Exportů: 11, z toho s popisem 11.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`completeConnect`](#completeconnect) | function | Návrat ze souhlasu Googlu (`/api/kalendar/google/callback`): uloží účet, načte kalendáře a spustí první synchronizaci. |  |
| [`envOfDeps`](#envofdeps) | function | Prostředí z `ModuleDeps` (příkazy, obsluhy událostí). |  |
| [`handleGoogleWebhook`](#handlegooglewebhook) | function | Zpracuje volání push kanálu Googlu (hlavičky `X-Goog-*`). Kanál musí existovat a tajný token musí sedět (porovnání otisku v konstantním čase). První zpráva kanálu (`sync`) jen potvrzuje založení. Synchronizaci neprovádí, jen ji zařadí. |  |
| [`setGoogleClientOverride`](#setgoogleclientoverride) | function | Podstrčí klienta (fake Google v testech); `null` se vrátí ke skutečnému. Globálně: Next bundluje trasy zvlášť. |  |
| [`calendar`](schema.md#calendar) | const | Kalendář z Google účtu: zobrazení v OPSYS, cíl zápisu nových schůzek, synchronizační token a kanál pro push. | v `@rebar/kalendar/schema` |
| [`calendarAccount`](schema.md#calendaraccount) | const | Propojený Google účet uživatele (jeden na uživatele). `tokens_enc` jsou přístupové a obnovovací tokeny zašifrované přes `cipher` (nikdy v otevřené podobě); `status = reauth` znamená, že je potřeba souhlas obnovit. | v `@rebar/kalendar/schema` |
| [`calendarEvent`](schema.md#calendarevent) | const | Zrcadlo události z Google Kalendáře (zdroj pravdy je Google; konflikt rozhodne novější změna). Vazby na úkol, obchod, organizaci a kontakt jsou měkké. Soukromou událost cizího uživatele ukazuje systém jen jako „Obsazeno“. | v `@rebar/kalendar/schema` |
| [`calendarPush`](schema.md#calendarpush) | const | Fronta zápisu do Googlu (outbox). Vzniká v transakci změny úkolu (`task.*` → handler) a zpracovává ji úloha `kalendar.push`; díky tomu zápis do Googlu nemůže předběhnout potvrzení změny a výpadek Googlu změnu neztratí. Na jeden úkol je nejvýš jeden nevyřízený řádek (další změny se slučují, `queued_at` se posune). U mazání nese `payload` identifikaci události (úkol už nemusí existovat). | v `@rebar/kalendar/schema` |
| [`pushJobDef`](#pushjobdef) | const | Úloha zpracování fronty zápisu (cron každou minutu + spuštění hned po změně úkolu). |  |
| [`server`](#server) | const | Serverová část modulu „kalendar“: společné entity a příkazy plus oblast `google` (synchronizace s Google Kalendářem). |  |
| [`syncCalendarJobDef`](#synccalendarjobdef) | const | Úloha: synchronizace jednoho kalendáře (po webhooku, po zobrazení kalendáře). |  |

### completeConnect

function · `packages/modules/kalendar/src/google/connect.ts`

Návrat ze souhlasu Googlu (`/api/kalendar/google/callback`): uloží účet, načte kalendáře a spustí první synchronizaci.

```ts
async function completeConnect(ctx: Ctx, env: KalEnv, q: { code?: string | null; state?: string | null; error?: string | null }): Promise<{ redirectTo: string; ok: boolean }>
```

### envOfDeps

function · `packages/modules/kalendar/src/google/env.ts`

Prostředí z `ModuleDeps` (příkazy, obsluhy událostí).

```ts
function envOfDeps(d: ModuleDeps): KalEnv
```

### handleGoogleWebhook

function · `packages/modules/kalendar/src/google/watch.ts`

Zpracuje volání push kanálu Googlu (hlavičky `X-Goog-*`). Kanál musí existovat a tajný token musí sedět (porovnání
otisku v konstantním čase). První zpráva kanálu (`sync`) jen potvrzuje založení. Synchronizaci neprovádí, jen ji zařadí.

```ts
async function handleGoogleWebhook(db: Executor, headers: { get(name: string): string | null }, enqueueSync: (calendarId: string) => Promise<void>): Promise<WebhookResult>
```

### setGoogleClientOverride

function · `packages/modules/kalendar/src/google/env.ts`

Podstrčí klienta (fake Google v testech); `null` se vrátí ke skutečnému. Globálně: Next bundluje trasy zvlášť.

```ts
function setGoogleClientOverride(client: GoogleCalendarClient | null): void
```

### pushJobDef

const · `packages/modules/kalendar/src/google/push.ts`

Úloha zpracování fronty zápisu (cron každou minutu + spuštění hned po změně úkolu).

```ts
const pushJobDef: { name: string; schema: z.ZodObject<{}, z.core.$strip>; }
```

### server

const · `packages/modules/kalendar/src/server.ts`

Serverová část modulu „kalendar“: společné entity a příkazy plus oblast `google` (synchronizace s Google Kalendářem).

```ts
const server: import("@rebar/core/module-server").ModuleServer
```

### syncCalendarJobDef

const · `packages/modules/kalendar/src/google/watch.ts`

Úloha: synchronizace jednoho kalendáře (po webhooku, po zobrazení kalendáře).

```ts
const syncCalendarJobDef: { name: string; schema: z.ZodObject<{ calendarId: z.ZodUUID; full: z.ZodOptional<z.ZodBoolean>; }, z.core.$strip>; }
```
