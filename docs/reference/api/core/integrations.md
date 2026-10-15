# @rebar/core/integrations

<!-- GENERATED: tento soubor vzniká z kódu příkazem `pnpm docs:generate`. Neupravuj ho ručně, změna se přepíše. -->

> **Generovaný dokument.** Vzniká přímo z kódu (exporty vstupního bodu balíčku, JSDoc a deklarace ve zdrojích). Neupravuj ho ručně: změň kód a spusť `pnpm docs:generate`.
> Kontrola, že odpovídá kódu, běží v `pnpm docs:check` a v CI.

Vstupní bod `@rebar/core/integrations` (soubor `packages/core/src/integrations/index.ts`). Exportů: 7, z toho s popisem 7.

| Export | Druh | Popis | Podrobně |
| --- | --- | --- | --- |
| [`createCredentialStore`](#createcredentialstore) | function | Úložiště tajemství poskytovatelů nad zadaným šifrováním. |  |
| [`getIntegrationStatus`](#getintegrationstatus) | function | Souhrn stavu integrací; smí `settings.integrations` nebo `settings.manage`. Soukromá doručení vidí jen `private.read`. |  |
| [`CredentialInfo`](#credentialinfo) | type | Co o uloženém přístupu smí vědět UI (bez obsahu). |  |
| [`CredentialStore`](#credentialstore) | type | Úložiště přístupů poskytovatelů. |  |
| [`InboundSourceStatus`](#inboundsourcestatus) | type | Stav jednoho příchozího zdroje (`drive`, `leads`). |  |
| [`IntegrationStatus`](#integrationstatus) | type | Souhrn stavu integrací. |  |
| [`WebhookStatus`](#webhookstatus) | type | Stav odchozích webhooků. |  |

### createCredentialStore

function · `packages/core/src/integrations/credentials.ts`

Úložiště tajemství poskytovatelů nad zadaným šifrováním.

```ts
function createCredentialStore(cipher: Cipher): { save(ctx: Ctx, input: { provider: IntegrationProvider; userId?: string | null; data: Record<string, unknown>; status?: CredentialInfo["status"]; }): Promise<{ id: string; }>; load<T extends Record<string, unknown> = Record<string, unknow…
```

### getIntegrationStatus

function · `packages/core/src/integrations/status.ts`

Souhrn stavu integrací; smí `settings.integrations` nebo `settings.manage`. Soukromá doručení vidí jen `private.read`.

```ts
async function getIntegrationStatus(ctx: Ctx, cipher: Cipher): Promise<IntegrationStatus>
```

### CredentialInfo

type · `packages/core/src/integrations/credentials.ts`

Co o uloženém přístupu smí vědět UI (bez obsahu).

```ts
type CredentialInfo = {
  id: string;
  provider: IntegrationProvider;
  /** Prázdné = společný přístup agentury. */
  userId: string | null;
  status: "ok" | "reauth" | "error";
  updatedAt: string;
};
```

### CredentialStore

type · `packages/core/src/integrations/credentials.ts`

Úložiště přístupů poskytovatelů.

```ts
type CredentialStore = ReturnType<typeof createCredentialStore>;
```

### InboundSourceStatus

type · `packages/core/src/integrations/status.ts`

Stav jednoho příchozího zdroje (`drive`, `leads`).

```ts
type InboundSourceStatus = {
  source: string;
  lastReceivedAt: string | null;
  lastProcessedAt: string | null;
  failedTotal: number;
  failed24h: number;
};
```

### IntegrationStatus

type · `packages/core/src/integrations/status.ts`

Souhrn stavu integrací.

```ts
type IntegrationStatus = {
  webhooks: WebhookStatus;
  inbound: InboundSourceStatus[];
  credentials: CredentialInfo[];
  /** Je potřeba zásah správce (chybná doručení, selhané příchozí, přístup vyžaduje nové přihlášení)? */
  problems: number;
};
```

### WebhookStatus

type · `packages/core/src/integrations/status.ts`

Stav odchozích webhooků.

```ts
type WebhookStatus = {
  endpointsActive: number;
  endpointsTotal: number;
  pending: number;
  failed: number;
  delivered24h: number;
  oldestPendingAt: string | null;
  lastDeliveredAt: string | null;
};
```
