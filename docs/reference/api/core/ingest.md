# @rebar/core/ingest

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/ingest` (soubor `packages/core/src/ingest/index.ts`). Exportů: 13, z toho s popisem 13.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`defineIngest`](#defineingest) | function | Pomocník pro typově bezpečnou definici příchozího zdroje (`ModuleServer.ingests`). |  |
| [`getIngestSecretStatus`](#getingestsecretstatus) | function | Stav tajemství pro Nastavení (bez hodnoty). |  |
| [`listInboundEvents`](#listinboundevents) | function | Příchozí události (nejnovější první); filtr podle zdroje a stavu. Jen se `settings.integrations`. |  |
| [`loadIngestSecrets`](#loadingestsecrets) | function | Tajemství, kterými se teď smí podepisovat (aktuální a případně ještě platné předchozí). |  |
| [`processIngest`](#processingest) | function | Zpracuje příchozí požadavek (viz popis modulu). Nevyhazuje: každou chybu převede na odpověď. |  |
| [`reprocessInbound`](#reprocessinbound) | function | Znovu zpracuje uloženou příchozí událost, která selhala (tlačítko v Nastavení → Integrace), ze zapsaného těla; n8n přitom nemusí nic opakovat. Podpis se nekontroluje (volá správce přes server action s oprávněním). |  |
| [`rotateIngestSecret`](#rotateingestsecret) | function | Vygeneruje nové tajemství příchozích požadavků a vrátí ho (zobrazí se jen jednou). `revokeOld` ukončí platnost dosavadního hned, jinak platí ještě 24 hodin. |  |
| [`INGEST_MAX_BODY_BYTES`](#ingest_max_body_bytes) | const | Největší povolené tělo požadavku (bajty). |  |
| [`PREVIOUS_SECRET_GRACE_HOURS`](#previous_secret_grace_hours) | const | Jak dlouho po výměně platí ještě staré tajemství. |  |
| [`InboundEventRow`](#inboundeventrow) | type | Příchozí událost pro seznam v Nastavení → Integrace (bez těla, to může nést osobní údaje z leadů). |  |
| [`IngestDef`](#ingestdef) | type | Příchozí požadavek od n8n a dalších (`POST /api/ingest/<source>`, podepsaný). Duplicita (`source`, `externalId`) se vyřídí bez zpracování. Trasu a zápis do `inbound_event` doplní C2. |  |
| [`IngestRequest`](#ingestrequest) | type | Vstup zpracování příchozího požadavku. |  |
| [`IngestResponse`](#ingestresponse) | type | Odpověď pro route handler. |  |

### defineIngest

function · `packages/core/src/modules/server.ts`

Pomocník pro typově bezpečnou definici příchozího zdroje (`ModuleServer.ingests`).

```ts
function defineIngest<S extends ZodType>(def: IngestDef<S>): IngestDef<S>
```

### getIngestSecretStatus

function · `packages/core/src/ingest/secret.ts`

Stav tajemství pro Nastavení (bez hodnoty).

```ts
async function getIngestSecretStatus(ctx: Ctx): Promise<{ configured: boolean; previousValidUntil: string | null }>
```

### listInboundEvents

function · `packages/core/src/ingest/list.ts`

Příchozí události (nejnovější první); filtr podle zdroje a stavu. Jen se `settings.integrations`.

```ts
async function listInboundEvents(ctx: Ctx, filter: { source?: string | undefined; status?: InboundEventRow["status"] | undefined; limit?: number | undefined; } = {}): Promise<InboundEventRow[]>
```

### loadIngestSecrets

function · `packages/core/src/ingest/secret.ts`

Tajemství, kterými se teď smí podepisovat (aktuální a případně ještě platné předchozí).

```ts
async function loadIngestSecrets(db: Executor, cipher: Cipher, now = new Date()): Promise<string[]>
```

### processIngest

function · `packages/core/src/ingest/process.ts`

Zpracuje příchozí požadavek (viz popis modulu). Nevyhazuje: každou chybu převede na odpověď.

```ts
async function processIngest(req: IngestRequest): Promise<IngestResponse>
```

### reprocessInbound

function · `packages/core/src/ingest/process.ts`

Znovu zpracuje uloženou příchozí událost, která selhala (tlačítko v Nastavení → Integrace), ze zapsaného těla;
n8n přitom nemusí nic opakovat. Podpis se nekontroluje (volá správce přes server action s oprávněním).

```ts
async function reprocessInbound(deps: Pick<IngestRequest, "db" | "ingests" | "deps">, id: string, now = new Date()): Promise<IngestResponse>
```

### rotateIngestSecret

function · `packages/core/src/ingest/secret.ts`

Vygeneruje nové tajemství příchozích požadavků a vrátí ho (zobrazí se jen jednou). `revokeOld` ukončí platnost
dosavadního hned, jinak platí ještě 24 hodin.

```ts
async function rotateIngestSecret(ctx: Ctx, cipher: Cipher, { revokeOld = false }: { revokeOld?: boolean } = {}): Promise<{ secret: string; previousValidUntil: string | null }>
```

### INGEST_MAX_BODY_BYTES

const · `packages/core/src/ingest/process.ts`

Největší povolené tělo požadavku (bajty).

```ts
const INGEST_MAX_BODY_BYTES: number
```

### PREVIOUS_SECRET_GRACE_HOURS

const · `packages/core/src/ingest/secret.ts`

Jak dlouho po výměně platí ještě staré tajemství.

```ts
const PREVIOUS_SECRET_GRACE_HOURS: 24
```

### InboundEventRow

type · `packages/core/src/ingest/list.ts`

Příchozí událost pro seznam v Nastavení → Integrace (bez těla, to může nést osobní údaje z leadů).

```ts
type InboundEventRow = {
  id: string;
  source: string;
  externalId: string;
  status: "received" | "processed" | "failed";
  error: string | null;
  entityType: string | null;
  entityId: string | null;
  receivedAt: string;
  processedAt: string | null;
};
```

### IngestDef

type · `packages/core/src/modules/server.ts`

Příchozí požadavek od n8n a dalších (`POST /api/ingest/<source>`, podepsaný). Duplicita (`source`, `externalId`)
se vyřídí bez zpracování. Trasu a zápis do `inbound_event` doplní C2.

```ts
type IngestDef<S extends ZodType = ZodType> = {
  source: string;
  schema: S;
  externalId: (body: z.output<S>) => string;
  handle: (
    ctx: Ctx,
    body: z.output<S>,
    deps: ModuleDeps,
  ) => Promise<{ entity?: { type: string; id: string } } | void>;
};
```

### IngestRequest

type · `packages/core/src/ingest/process.ts`

Vstup zpracování příchozího požadavku.

```ts
type IngestRequest = {
  db: Db;
  cipher: Cipher;
  ingests: readonly IngestDef[];
  deps: ModuleDeps;
  /** Zdroj z adresy (`drive`, `leads`). */
  source: string;
  /** Tělo přesně tak, jak přišlo (podepisuje se). */
  rawBody: string;
  /** Hodnota hlavičky `X-Opsys-Signature`. */
  signature: string | null;
  ip?: string | null;
  now?: Date;
};
```

### IngestResponse

type · `packages/core/src/ingest/process.ts`

Odpověď pro route handler.

```ts
type IngestResponse = { status: number; body: Record<string, unknown> };
```
