# @rebar/core/push

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/push` (soubor `packages/core/src/push/index.ts`). Exportů: 25, z toho s popisem 12.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`classifyPushError`](#classifypusherror) | function | Jak naložit s chybou push služby: 404/410 odběr zanikl (smazat), 400/401/403/413 je trvalá chyba (špatné klíče VAPID, příliš velká zpráva) a opakování nepomůže, ostatní (429, 5xx, výpadek sítě) se zkusí znovu. |  |
| [`countSubscriptions`](#countsubscriptions) | function |  |  |
| [`createWebPushSender`](#createwebpushsender) | function | Odesílač přes knihovnu `web-push` (načítá se líně, ať ji nenesou testy a stránky bez push). |  |
| [`endpointHost`](#endpointhost) | function | Hostitel push služby (do protokolu doručení; adresa odběru samotná je tajná). |  |
| [`generateVapidKeys`](#generatevapidkeys) | function | Nový pár klíčů VAPID. |  |
| [`isAllowedPushEndpoint`](#isallowedpushendpoint) | function |  |  |
| [`listDevices`](#listdevices) | function | Zařízení přihlášeného s odběrem (nejnovější první). Adresa odběru slouží jen k poznání „tohoto“ zařízení. |  |
| [`payloadOf`](#payloadof) | function |  |  |
| [`pushToUser`](#pushtouser) | function | Pošle zprávu na všechna zařízení uživatele a uklidí, co push služba označila za zaniklé. Nikdy nevyhazuje chybu odeslání: výsledek popisuje, co se stalo (volající rozhodne o opakování). |  |
| [`removeDevice`](#removedevice) | function | Odhlášení zařízení ze seznamu zařízení; cizí odběr nejde zrušit. Vrací, zda nějaký zmizel. |  |
| [`removeSessionSubscriptions`](#removesessionsubscriptions) | function | Zruší odběry navázané na relaci (odhlášení: zařízení po odhlášení nemá dostávat cizí upozornění). |  |
| [`removeSubscription`](#removesubscription) | function |  |  |
| [`removeUserSubscriptions`](#removeusersubscriptions) | function | Zruší všechny odběry uživatele (deaktivace účtu, odhlášení ze všech zařízení). |  |
| [`replaceSubscription`](#replacesubscription) | function | Prohlížeč odběr po čase obnoví (`pushsubscriptionchange`): nový odběr nahradí starý téhož uživatele, aby se zařízení nezdvojilo. Starý odběr smí nahradit jen jeho majitel. |  |
| [`saveSubscription`](#savesubscription) | function |  |  |
| [`sendToUser`](#sendtouser) | function | Zpětně kompatibilní krátká podoba: počet doručených a smazaných odběrů. |  |
| [`PushDevice`](#pushdevice) | type |  |  |
| [`PushFailureKind`](#pushfailurekind) | type |  |  |
| [`PushPayload`](#pushpayload) | type |  |  |
| [`PushResult`](#pushresult) | type |  |  |
| [`PushSendOptions`](#pushsendoptions) | type |  |  |
| [`PushSender`](#pushsender) | type | Odešle jednu zprávu; při zrušeném odběru vyhodí chybu se `statusCode` 404 nebo 410. |  |
| [`PushTarget`](#pushtarget) | type |  |  |
| [`PushUrgency`](#pushurgency) | type |  |  |
| [`VapidConfig`](#vapidconfig) | type |  |  |

### classifyPushError

function · `packages/core/src/push/push.ts`

Jak naložit s chybou push služby: 404/410 odběr zanikl (smazat), 400/401/403/413 je trvalá chyba (špatné klíče
VAPID, příliš velká zpráva) a opakování nepomůže, ostatní (429, 5xx, výpadek sítě) se zkusí znovu.

```ts
function classifyPushError(err: unknown): { kind: PushFailureKind; status: number | null }
```

### countSubscriptions

function · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
async function countSubscriptions(ctx: Ctx): Promise<number>
```

### createWebPushSender

function · `packages/core/src/push/push.ts`

Odesílač přes knihovnu `web-push` (načítá se líně, ať ji nenesou testy a stránky bez push).

```ts
async function createWebPushSender(vapid: VapidConfig): Promise<PushSender>
```

### endpointHost

function · `packages/core/src/push/push.ts`

Hostitel push služby (do protokolu doručení; adresa odběru samotná je tajná).

```ts
function endpointHost(endpoint: string): string
```

### generateVapidKeys

function · `packages/core/src/push/push.ts`

Nový pár klíčů VAPID.

```ts
async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }>
```

### isAllowedPushEndpoint

function · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
function isAllowedPushEndpoint(raw: string): boolean
```

### listDevices

function · `packages/core/src/push/push.ts`

Zařízení přihlášeného s odběrem (nejnovější první). Adresa odběru slouží jen k poznání „tohoto“ zařízení.

```ts
async function listDevices(ctx: Ctx): Promise<PushDevice[]>
```

### payloadOf

function · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
function payloadOf(p: PushPayload): string
```

### pushToUser

function · `packages/core/src/push/push.ts`

Pošle zprávu na všechna zařízení uživatele a uklidí, co push služba označila za zaniklé. Nikdy nevyhazuje chybu
odeslání: výsledek popisuje, co se stalo (volající rozhodne o opakování).

```ts
async function pushToUser(db: Executor, send: PushSender, userId: string, payload: PushPayload | string, options: PushSendOptions = { ttl: 60 * 60 * 12, urgency: "normal" }): Promise<PushResult>
```

### removeDevice

function · `packages/core/src/push/push.ts`

Odhlášení zařízení ze seznamu zařízení; cizí odběr nejde zrušit. Vrací, zda nějaký zmizel.

```ts
async function removeDevice(ctx: Ctx, id: string): Promise<boolean>
```

### removeSessionSubscriptions

function · `packages/core/src/push/push.ts`

Zruší odběry navázané na relaci (odhlášení: zařízení po odhlášení nemá dostávat cizí upozornění).

```ts
async function removeSessionSubscriptions(db: Executor, sessionId: string): Promise<number>
```

### removeSubscription

function · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
async function removeSubscription(ctx: Ctx, endpoint: string): Promise<void>
```

### removeUserSubscriptions

function · `packages/core/src/push/push.ts`

Zruší všechny odběry uživatele (deaktivace účtu, odhlášení ze všech zařízení).

```ts
async function removeUserSubscriptions(db: Executor, userId: string): Promise<number>
```

### replaceSubscription

function · `packages/core/src/push/push.ts`

Prohlížeč odběr po čase obnoví (`pushsubscriptionchange`): nový odběr nahradí starý téhož uživatele,
aby se zařízení nezdvojilo. Starý odběr smí nahradit jen jeho majitel.

```ts
async function replaceSubscription(ctx: Ctx, oldEndpoint: string | null, input: Parameters<typeof saveSubscription>[1]): Promise<void>
```

### saveSubscription

function · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
async function saveSubscription(ctx: Ctx, input: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null; sessionId?: string | null; }): Promise<void>
```

### sendToUser

function · `packages/core/src/push/push.ts`

Zpětně kompatibilní krátká podoba: počet doručených a smazaných odběrů.

```ts
async function sendToUser(db: Executor, send: PushSender, userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }>
```

### PushDevice

type · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
type PushDevice = {
  id: string;
  endpoint: string;
  host: string;
  userAgent: string | null;
  createdAt: Date;
  lastSentAt: Date | null;
  failures: number;
  lastError: string | null;
};
```

### PushFailureKind

type · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
type PushFailureKind = "gone" | "rejected" | "transient";
```

### PushPayload

type · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
type PushPayload = {
  title: string;
  body?: string | null;
  url?: string | null;
  /** Zpráva se stejným tagem v zařízení nahradí starší. */
  tag?: string | null;
  /** Id upozornění: po ťuknutí se označí za přečtené. */
  nid?: string | null;
  /** Počet nepřečtených pro odznak na ikoně aplikace. */
  badge?: number | null;
  /** Kolik událostí zpráva sloučila. */
  count?: number | null;
  urgent?: boolean;
  /** Nabídnout akci „Odložit“. */
  snooze?: boolean;
};
```

### PushResult

type · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
type PushResult = {
  /** Na kolik zařízení zpráva odešla. */
  sent: number;
  /** Odběry, které zanikly a byly smazány. */
  removed: number;
  /** Zařízení, kde odeslání dočasně selhalo (stojí za opakování). */
  transient: number;
  /** Zařízení, kde push služba zprávu trvale odmítla. */
  rejected: number;
  hosts: string[];
  /** Stavové kódy chyb (bez adres a klíčů). */
  errors: number[];
  /** Uživatel nemá žádné zařízení. */
  noDevice: boolean;
};
```

### PushSendOptions

type · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
type PushSendOptions = {
  /** Jak dlouho push služba drží zprávu pro nedostupné zařízení (sekundy). */
  ttl: number;
  urgency: PushUrgency;
  /** Nová zpráva se stejným tématem nahradí starší, dosud nedoručenou (RFC 8030); max. 32 znaků base64url. */
  topic?: string | undefined;
};
```

### PushSender

type · `packages/core/src/push/push.ts`

Odešle jednu zprávu; při zrušeném odběru vyhodí chybu se `statusCode` 404 nebo 410.

```ts
type PushSender = (
  target: PushTarget,
  payload: string,
  options?: PushSendOptions,
) => Promise<void>;
```

### PushTarget

type · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
```

### PushUrgency

type · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
type PushUrgency = "very-low" | "low" | "normal" | "high";
```

### VapidConfig

type · `packages/core/src/push/push.ts`

_Bez popisu._

```ts
type VapidConfig = { publicKey: string; privateKey: string; subject: string };
```
