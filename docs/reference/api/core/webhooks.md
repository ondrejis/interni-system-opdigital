# @rebar/core/webhooks

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/webhooks` (soubor `packages/core/src/webhooks/index.ts`). Exportů: 47, z toho s popisem 47.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`attemptDelivery`](#attemptdelivery) | function | Provede jeden (už převzatý) pokus o doručení a zapíše výsledek. `maxAttempts` = po kolikátém neúspěšném pokusu je doručení `failed` (zkušební webhook: 1, bez opakování). |  |
| [`claimDelivery`](#claimdelivery) | function | Převezme doručení k odeslání (zamkne ho na dobu `LEASE_SECONDS` a započítá pokus). Vrací `false`, když je už jiný worker zpracovává nebo není čekající. |  |
| [`cleanupWebhookData`](#cleanupwebhookdata) | function | Úklid: smaže stará doručená a chybná doručení a zpracované příchozí události (idempotence tím nesmí trpět: dny jsou dlouhé). |  |
| [`computeSignature`](#computesignature) | function | Hodnota hex HMAC-SHA256 z `t + "." + tělo`. |  |
| [`createEndpoint`](#createendpoint) | function | Založí endpoint. Vrací i tajemství pro podpis: zobrazí se jen jednou, potom už nejde zjistit (jen vyměnit). |  |
| [`deleteEndpoint`](#deleteendpoint) | function | Smaže endpoint; čekající doručení se označí jako chybná (jdou případně znovu poslat na jiný endpoint ručně). |  |
| [`deliverDue`](#deliverdue) | function | Odešle všechna čekající doručení, jejichž čas nadešel. Bezpečné spouštět souběžně (každé doručení převezme jen jeden běh) i opakovaně. |  |
| [`enqueueWebhookDeliveries`](#enqueuewebhookdeliveries) | function | Outbox: v transakci změny zapíše řádek `webhook_delivery` každému aktivnímu endpointu, který událost odebírá (a smí ji dostat: soukromé záznamy jen endpointům `include_private`). Samotné odeslání dělá worker po potvrzení transakce; `pg_notify` se doručí až při commitu, takže se neodešle nic, co se nepotvrdilo. |  |
| [`generateWebhookSecret`](#generatewebhooksecret) | function | Nové tajemství endpointu (`whsec_…`, 256 bitů). |  |
| [`getDeliveryPayload`](#getdeliverypayload) | function | Tělo doručené (nebo čekající) zprávy pro kontrolu ve správě; soukromé jen s oprávněním `private.read`. |  |
| [`isValidEventPattern`](#isvalideventpattern) | function | Zda je vzor platný: přesný název z katalogu, nebo `skupina.*` odpovídající aspoň jedné události katalogu. |  |
| [`listDeliveries`](#listdeliveries) | function | Doručení (nejnovější první) bez těla zprávy; doručení soukromých událostí vidí jen ten, kdo smí soukromé. |  |
| [`listEndpoints`](#listendpoints) | function | Seznam endpointů (bez smazaných) s počty doručení. |  |
| [`matchesEvent`](#matchesevent) | function | Zda některý ze vzorů (přesný název nebo `skupina.*`) odpovídá názvu události. |  |
| [`parseSignatureHeader`](#parsesignatureheader) | function | Rozloží hlavičku na časovou značku a podpisy `v1` (víc podpisů umožňuje rotaci tajemství); neplatný tvar = `null`. |  |
| [`parseWebhookUrl`](#parsewebhookurl) | function | Ověří adresu webhooku a vrátí ji jako `URL`; neplatnou odmítne srozumitelnou chybou (`UserError`). |  |
| [`retryAllFailed`](#retryallfailed) | function | Vrátí do fronty všechna chybná doručení (volitelně jednoho endpointu); odešle je worker. Vrací jejich počet. |  |
| [`retryDelivery`](#retrydelivery) | function | Ručně znovu odešle chybné doručení: vrátí ho do fronty s novými pěti opakováními. S `immediate` zkusí odeslání hned a vrátí výsledek (jinak ho převezme worker do minuty). Zapíše se do auditu. |  |
| [`rotateEndpointSecret`](#rotateendpointsecret) | function | Vymění tajemství endpointu; vrací nové (zobrazí se jen jednou). Staré přestane platit hned. |  |
| [`sendTestDelivery`](#sendtestdelivery) | function | „Odeslat test“: pošle endpointu zkušební událost `webhook.test` hned (bez opakování) a vrátí výsledek. Doručení se zapíše do seznamu jako každé jiné, takže je vidět i podpis a odpověď serveru v chybě. |  |
| [`signatureHeader`](#signatureheader) | function | Celá hodnota hlavičky `X-Opsys-Signature` (`t=…,v1=…`). |  |
| [`updateEndpoint`](#updateendpoint) | function | Upraví endpoint (adresu, události, soukromá data, zapnutí). Tajemství zůstává. |  |
| [`verifySignature`](#verifysignature) | function | Ověří podpis těla jedním nebo více tajemstvími (aktuální + předchozí při rotaci). Porovnání v konstantním čase, časová značka se kontroluje před počítáním HMAC. |  |
| [`webhookEnvelope`](#webhookenvelope) | function | Obálka webhooku z doménové události (JSON-bezpečná kopie: data, která nejdou serializovat, vyhodí chybu). |  |
| [`webhookEventGroups`](#webhookeventgroups) | function | Události nabízené v Nastavení, seskupené podle předpony, v pořadí katalogu `WEBHOOK_EVENTS`. |  |
| [`webhookEventLabel`](#webhookeventlabel) | function | Čitelný název události (pro seznamy doručení); neznámý název se vrací beze změny. |  |
| [`DELIVERY_TIMEOUT_MS`](#delivery_timeout_ms) | const | Jak dlouho čekáme na odpověď serveru. |  |
| [`MAX_ATTEMPTS`](#max_attempts) | const | Nejvíc pokusů o jedno doručení: první + pět opakování. |  |
| [`RETENTION_DAYS`](#retention_days) | const | Jak dlouho se uchovávají vyřízená doručení a zpracované příchozí události (dny). |  |
| [`RETRY_DELAYS_SECONDS`](#retry_delays_seconds) | const | Odklad před dalším pokusem po neúspěšném pokusu číslo 1, 2, … (sekundy). |  |
| [`SIGNATURE_HEADER`](#signature_header) | const | Hlavička s podpisem. |  |
| [`SIGNATURE_TOLERANCE_SECONDS`](#signature_tolerance_seconds) | const | Povolená odchylka časové značky v sekundách (±5 minut). |  |
| [`WEBHOOK_NOTIFY_CHANNEL`](#webhook_notify_channel) | const | Kanál `NOTIFY`: worker po něm hned (bez čekání na minutový plán) spustí doručování. |  |
| [`webhookCleanupJob`](#webhookcleanupjob) | const | Denně v noci: smaže stará vyřízená doručení a příchozí události. |  |
| [`webhookDeliverJob`](#webhookdeliverjob) | const | Každou minutu a navíc hned po `NOTIFY` (worker poslouchá `WEBHOOK_NOTIFY_CHANNEL`): odešle čekající webhooky. |  |
| [`webhookJobs`](#webhookjobs) | const | Úlohy webhooků pro `coreJobs` (INT je přidá do `jobs/core-jobs.ts`, viz `docs/opsys/ZADOSTI.md`). |  |
| [`AttemptReport`](#attemptreport) | type | Výsledek zkušebního webhooku (nebo okamžitého opakování) pro zobrazení správci. |  |
| [`DeliverDeps`](#deliverdeps) | type | Co doručovač potřebuje. `fetch` jde nahradit v testech. |  |
| [`DeliverResult`](#deliverresult) | type | Počty z jednoho běhu doručovače (převzatá, doručená, odložená k opakování a definitivně chybná doručení). |  |
| [`DeliveryFilter`](#deliveryfilter) | type | Filtr seznamu doručení. |  |
| [`DeliveryRow`](#deliveryrow) | type | Doručení pro seznam (bez těla zprávy). |  |
| [`EndpointInput`](#endpointinput) | type | Údaje endpointu, které zadává správce. |  |
| [`EndpointRow`](#endpointrow) | type | Endpoint pro seznam v Nastavení (bez tajemství) s počty doručení. |  |
| [`SignatureCheck`](#signaturecheck) | type | Výsledek ověření podpisu; `reason` rozlišuje, proč se požadavek odmítl (do protokolu, ne do odpovědi). |  |
| [`WebhookEnvelope`](#webhookenvelope) | type | Tělo webhooku: událost tak, jak ji vidí handlery, doplněná o záznam, ke kterému se vztahuje (`entity.isPrivate`). |  |
| [`WebhookEventGroup`](#webhookeventgroup) | type | Skupina událostí v nabídce (předpona před první tečkou). |  |
| [`WebhookJobDeps`](#webhookjobdeps) | type | Minimum, co úlohy webhooků potřebují od workeru (`CoreJobDeps` to splňuje). |  |

### attemptDelivery

function · `packages/core/src/webhooks/deliver.ts`

Provede jeden (už převzatý) pokus o doručení a zapíše výsledek. `maxAttempts` = po kolikátém neúspěšném pokusu je
doručení `failed` (zkušební webhook: 1, bez opakování).

```ts
async function attemptDelivery(deps: DeliverDeps, id: string, { maxAttempts = MAX_ATTEMPTS }: { maxAttempts?: number } = {}): Promise<Outcome>
```

### claimDelivery

function · `packages/core/src/webhooks/deliver.ts`

Převezme doručení k odeslání (zamkne ho na dobu `LEASE_SECONDS` a započítá pokus). Vrací `false`, když je už
jiný worker zpracovává nebo není čekající.

```ts
async function claimDelivery(db: Executor, id: string, now = new Date()): Promise<boolean>
```

### cleanupWebhookData

function · `packages/core/src/webhooks/deliver.ts`

Úklid: smaže stará doručená a chybná doručení a zpracované příchozí události (idempotence tím nesmí trpět: dny jsou dlouhé).

```ts
async function cleanupWebhookData(db: Executor, now = new Date()): Promise<{ deliveries: number; inbound: number }>
```

### computeSignature

function · `packages/core/src/webhooks/signature.ts`

Hodnota hex HMAC-SHA256 z `t + "." + tělo`.

```ts
function computeSignature(secret: string, timestamp: number, body: string): string
```

### createEndpoint

function · `packages/core/src/webhooks/endpoints.ts`

Založí endpoint. Vrací i tajemství pro podpis: zobrazí se jen jednou, potom už nejde zjistit (jen vyměnit).

```ts
async function createEndpoint(ctx: Ctx, cipher: Cipher, input: EndpointInput): Promise<{ id: string; secret: string }>
```

### deleteEndpoint

function · `packages/core/src/webhooks/endpoints.ts`

Smaže endpoint; čekající doručení se označí jako chybná (jdou případně znovu poslat na jiný endpoint ručně).

```ts
async function deleteEndpoint(ctx: Ctx, id: string): Promise<void>
```

### deliverDue

function · `packages/core/src/webhooks/deliver.ts`

Odešle všechna čekající doručení, jejichž čas nadešel. Bezpečné spouštět souběžně (každé doručení převezme jen
jeden běh) i opakovaně.

```ts
async function deliverDue(deps: DeliverDeps, opts: { limit?: number } = {}): Promise<DeliverResult>
```

### enqueueWebhookDeliveries

function · `packages/core/src/webhooks/outbox.ts`

Outbox: v transakci změny zapíše řádek `webhook_delivery` každému aktivnímu endpointu, který událost odebírá
(a smí ji dostat: soukromé záznamy jen endpointům `include_private`). Samotné odeslání dělá worker po potvrzení
transakce; `pg_notify` se doručí až při commitu, takže se neodešle nic, co se nepotvrdilo.

Zápis běží ve vnořené transakci (savepoint) a jeho chyba se jen nahlásí: webhooky jsou vedlejší účinek změny a
nikdy ji nesmí zrušit (NFR-13). Vrací počet vytvořených doručení.

```ts
async function enqueueWebhookDeliveries(ctx: Ctx, event: DomainEvent): Promise<number>
```

### generateWebhookSecret

function · `packages/core/src/webhooks/endpoints.ts`

Nové tajemství endpointu (`whsec_…`, 256 bitů).

```ts
function generateWebhookSecret(): string
```

### getDeliveryPayload

function · `packages/core/src/webhooks/endpoints.ts`

Tělo doručené (nebo čekající) zprávy pro kontrolu ve správě; soukromé jen s oprávněním `private.read`.

```ts
async function getDeliveryPayload(ctx: Ctx, id: string): Promise<Record<string, unknown>>
```

### isValidEventPattern

function · `packages/core/src/webhooks/events.ts`

Zda je vzor platný: přesný název z katalogu, nebo `skupina.*` odpovídající aspoň jedné události katalogu.

```ts
function isValidEventPattern(pattern: string): boolean
```

### listDeliveries

function · `packages/core/src/webhooks/endpoints.ts`

Doručení (nejnovější první) bez těla zprávy; doručení soukromých událostí vidí jen ten, kdo smí soukromé.

```ts
async function listDeliveries(ctx: Ctx, filter: DeliveryFilter = {}): Promise<DeliveryRow[]>
```

### listEndpoints

function · `packages/core/src/webhooks/endpoints.ts`

Seznam endpointů (bez smazaných) s počty doručení.

```ts
async function listEndpoints(ctx: Ctx): Promise<EndpointRow[]>
```

### matchesEvent

function · `packages/core/src/webhooks/events.ts`

Zda některý ze vzorů (přesný název nebo `skupina.*`) odpovídá názvu události.

```ts
function matchesEvent(patterns: readonly string[], name: string): boolean
```

### parseSignatureHeader

function · `packages/core/src/webhooks/signature.ts`

Rozloží hlavičku na časovou značku a podpisy `v1` (víc podpisů umožňuje rotaci tajemství); neplatný tvar = `null`.

```ts
function parseSignatureHeader(header: string | null | undefined): { timestamp: number; signatures: string[] } | null
```

### parseWebhookUrl

function · `packages/core/src/webhooks/url.ts`

Ověří adresu webhooku a vrátí ji jako `URL`; neplatnou odmítne srozumitelnou chybou (`UserError`).

```ts
function parseWebhookUrl(raw: string): URL
```

### retryAllFailed

function · `packages/core/src/webhooks/endpoints.ts`

Vrátí do fronty všechna chybná doručení (volitelně jednoho endpointu); odešle je worker. Vrací jejich počet.

```ts
async function retryAllFailed(ctx: Ctx, filter: { endpointId?: string | undefined } = {}): Promise<number>
```

### retryDelivery

function · `packages/core/src/webhooks/endpoints.ts`

Ručně znovu odešle chybné doručení: vrátí ho do fronty s novými pěti opakováními. S `immediate` zkusí odeslání hned
a vrátí výsledek (jinak ho převezme worker do minuty). Zapíše se do auditu.

```ts
async function retryDelivery(ctx: Ctx, deps: Pick<DeliverDeps, "cipher" | "fetch" | "now">, id: string, { immediate = true }: { immediate?: boolean } = {}): Promise<AttemptReport | null>
```

### rotateEndpointSecret

function · `packages/core/src/webhooks/endpoints.ts`

Vymění tajemství endpointu; vrací nové (zobrazí se jen jednou). Staré přestane platit hned.

```ts
async function rotateEndpointSecret(ctx: Ctx, cipher: Cipher, id: string): Promise<{ secret: string }>
```

### sendTestDelivery

function · `packages/core/src/webhooks/endpoints.ts`

„Odeslat test“: pošle endpointu zkušební událost `webhook.test` hned (bez opakování) a vrátí výsledek. Doručení se
zapíše do seznamu jako každé jiné, takže je vidět i podpis a odpověď serveru v chybě.

```ts
async function sendTestDelivery(ctx: Ctx, deps: Pick<DeliverDeps, "cipher" | "fetch" | "now">, endpointId: string): Promise<AttemptReport>
```

### signatureHeader

function · `packages/core/src/webhooks/signature.ts`

Celá hodnota hlavičky `X-Opsys-Signature` (`t=…,v1=…`).

```ts
function signatureHeader(secret: string, body: string, nowMs = Date.now()): string
```

### updateEndpoint

function · `packages/core/src/webhooks/endpoints.ts`

Upraví endpoint (adresu, události, soukromá data, zapnutí). Tajemství zůstává.

```ts
async function updateEndpoint(ctx: Ctx, id: string, input: EndpointInput & { active: boolean }): Promise<void>
```

### verifySignature

function · `packages/core/src/webhooks/signature.ts`

Ověří podpis těla jedním nebo více tajemstvími (aktuální + předchozí při rotaci). Porovnání v konstantním čase,
časová značka se kontroluje před počítáním HMAC.

```ts
function verifySignature(opts: { secrets: readonly string[]; header: string | null | undefined; body: string; nowMs?: number; toleranceSeconds?: number; }): SignatureCheck
```

### webhookEnvelope

function · `packages/core/src/webhooks/outbox.ts`

Obálka webhooku z doménové události (JSON-bezpečná kopie: data, která nejdou serializovat, vyhodí chybu).

```ts
function webhookEnvelope(event: DomainEvent): WebhookEnvelope
```

### webhookEventGroups

function · `packages/core/src/webhooks/events.ts`

Události nabízené v Nastavení, seskupené podle předpony, v pořadí katalogu `WEBHOOK_EVENTS`.

```ts
function webhookEventGroups(): WebhookEventGroup[]
```

### webhookEventLabel

function · `packages/core/src/webhooks/events.ts`

Čitelný název události (pro seznamy doručení); neznámý název se vrací beze změny.

```ts
function webhookEventLabel(name: string): string
```

### DELIVERY_TIMEOUT_MS

const · `packages/core/src/webhooks/deliver.ts`

Jak dlouho čekáme na odpověď serveru.

```ts
const DELIVERY_TIMEOUT_MS: 10000
```

### MAX_ATTEMPTS

const · `packages/core/src/webhooks/deliver.ts`

Nejvíc pokusů o jedno doručení: první + pět opakování.

```ts
const MAX_ATTEMPTS: number
```

### RETENTION_DAYS

const · `packages/core/src/webhooks/deliver.ts`

Jak dlouho se uchovávají vyřízená doručení a zpracované příchozí události (dny).

```ts
const RETENTION_DAYS: { readonly delivered: 30; readonly failed: 90; readonly inboundProcessed: 90; readonly inboundFailed: 180; }
```

### RETRY_DELAYS_SECONDS

const · `packages/core/src/webhooks/deliver.ts`

Odklad před dalším pokusem po neúspěšném pokusu číslo 1, 2, … (sekundy).

```ts
const RETRY_DELAYS_SECONDS: readonly [60, 300, 900, 1800, 3600]
```

### SIGNATURE_HEADER

const · `packages/core/src/webhooks/signature.ts`

Hlavička s podpisem.

```ts
const SIGNATURE_HEADER: "x-opsys-signature"
```

### SIGNATURE_TOLERANCE_SECONDS

const · `packages/core/src/webhooks/signature.ts`

Povolená odchylka časové značky v sekundách (±5 minut).

```ts
const SIGNATURE_TOLERANCE_SECONDS: 300
```

### WEBHOOK_NOTIFY_CHANNEL

const · `packages/core/src/webhooks/outbox.ts`

Kanál `NOTIFY`: worker po něm hned (bez čekání na minutový plán) spustí doručování.

```ts
const WEBHOOK_NOTIFY_CHANNEL: "opsys_webhook"
```

### webhookCleanupJob

const · `packages/core/src/webhooks/deliver.ts`

Denně v noci: smaže stará vyřízená doručení a příchozí události.

```ts
const webhookCleanupJob: import("../jobs").JobDef<z.ZodObject<Record<string, never>, z.core.$strip>, WebhookJobDeps>
```

### webhookDeliverJob

const · `packages/core/src/webhooks/deliver.ts`

Každou minutu a navíc hned po `NOTIFY` (worker poslouchá `WEBHOOK_NOTIFY_CHANNEL`): odešle čekající webhooky.

```ts
const webhookDeliverJob: import("../jobs").JobDef<z.ZodObject<Record<string, never>, z.core.$strip>, WebhookJobDeps>
```

### webhookJobs

const · `packages/core/src/webhooks/deliver.ts`

Úlohy webhooků pro `coreJobs` (INT je přidá do `jobs/core-jobs.ts`, viz `docs/opsys/ZADOSTI.md`).

```ts
const webhookJobs: readonly [import("../jobs").JobDef<z.ZodObject<Record<string, never>, z.core.$strip>, WebhookJobDeps>, import("../jobs").JobDef<z.ZodObject<Record<string, never>, z.core.$strip>, WebhookJobDeps>]
```

### AttemptReport

type · `packages/core/src/webhooks/endpoints.ts`

Výsledek zkušebního webhooku (nebo okamžitého opakování) pro zobrazení správci.

```ts
type AttemptReport = {
  deliveryId: string;
  outcome: "delivered" | "retry" | "failed";
  error: string | null;
};
```

### DeliverDeps

type · `packages/core/src/webhooks/deliver.ts`

Co doručovač potřebuje. `fetch` jde nahradit v testech.

```ts
type DeliverDeps = {
  db: Executor;
  cipher: Cipher;
  fetch?: typeof fetch;
  now?: () => Date;
};
```

### DeliverResult

type · `packages/core/src/webhooks/deliver.ts`

Počty z jednoho běhu doručovače (převzatá, doručená, odložená k opakování a definitivně chybná doručení).

```ts
type DeliverResult = { claimed: number; delivered: number; retried: number; failed: number };
```

### DeliveryFilter

type · `packages/core/src/webhooks/endpoints.ts`

Filtr seznamu doručení.

```ts
type DeliveryFilter = {
  endpointId?: string | undefined;
  status?: "pending" | "delivered" | "failed" | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};
```

### DeliveryRow

type · `packages/core/src/webhooks/endpoints.ts`

Doručení pro seznam (bez těla zprávy).

```ts
type DeliveryRow = {
  id: string;
  endpointId: string;
  endpointName: string;
  eventId: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  isPrivate: boolean;
};
```

### EndpointInput

type · `packages/core/src/webhooks/endpoints.ts`

Údaje endpointu, které zadává správce.

```ts
type EndpointInput = {
  name: string;
  url: string;
  events: readonly string[];
  includePrivate: boolean;
};
```

### EndpointRow

type · `packages/core/src/webhooks/endpoints.ts`

Endpoint pro seznam v Nastavení (bez tajemství) s počty doručení.

```ts
type EndpointRow = {
  id: string;
  name: string;
  url: string;
  events: string[];
  includePrivate: boolean;
  active: boolean;
  createdAt: string;
  counts: { pending: number; delivered: number; failed: number };
  lastDeliveredAt: string | null;
};
```

### SignatureCheck

type · `packages/core/src/webhooks/signature.ts`

Výsledek ověření podpisu; `reason` rozlišuje, proč se požadavek odmítl (do protokolu, ne do odpovědi).

```ts
type SignatureCheck =
  { ok: true } | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" };
```

### WebhookEnvelope

type · `packages/core/src/webhooks/outbox.ts`

Tělo webhooku: událost tak, jak ji vidí handlery, doplněná o záznam, ke kterému se vztahuje (`entity.isPrivate`).

```ts
type WebhookEnvelope = {
  id: string;
  event: string;
  occurredAt: string;
  actor: DomainEvent["actor"];
  entity: DomainEvent["entity"];
  data: unknown;
  previous?: unknown;
};
```

### WebhookEventGroup

type · `packages/core/src/webhooks/events.ts`

Skupina událostí v nabídce (předpona před první tečkou).

```ts
type WebhookEventGroup = {
  /** Předpona (`deal`) a zároveň vzor celé skupiny (`deal.*`). */
  prefix: string;
  label: string;
  description?: string;
  events: { name: string; label: string }[];
};
```

### WebhookJobDeps

type · `packages/core/src/webhooks/deliver.ts`

Minimum, co úlohy webhooků potřebují od workeru (`CoreJobDeps` to splňuje).

```ts
type WebhookJobDeps = { db: Executor; cipher: Cipher };
```
